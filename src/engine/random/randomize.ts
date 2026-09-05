import type { CameraState, Keyframe } from "../../types/project";
import type { ColorSettings } from "../renderer/FrameRenderer";
import { getFractalDefinition } from "../fractals/registry";
import { FRACTAL_DEFAULT_CAMERA } from "../fractals/defaults";
import { PALETTES } from "../color/palettes";
import { cameraParamKey, colorParamKey, fractalParamKey } from "../animation/paramKeys";
import { mulberry32, randRange } from "./prng";

export interface RandomizeResult {
  camera: CameraState;
  params: Record<string, number>;
  color: ColorSettings;
}

/**
 * One deterministic "MUTATE": same seed + same fractal always produces the
 * same composition (spec §11). Camera stays near the fractal's known
 * interesting region rather than fully unbounded — a uniformly random
 * center/zoom mostly lands on empty, featureless space.
 */
export function randomizeComposition(seed: number, fractalId: string): RandomizeResult {
  const rng = mulberry32(seed);
  const def = getFractalDefinition(fractalId);
  const base = FRACTAL_DEFAULT_CAMERA[fractalId] ?? FRACTAL_DEFAULT_CAMERA.mandelbrot;

  const camera: CameraState = {
    centerX: base.centerX + randRange(rng, -1.2, 1.2),
    centerY: base.centerY + randRange(rng, -1.2, 1.2),
    // Log-uniform, matching the log-zoom feel (spec §6) — 1x to 40x.
    zoom: Math.exp(randRange(rng, 0, Math.log(40))),
    rotation: randRange(rng, 0, Math.PI * 2),
  };

  const params: Record<string, number> = {};
  for (const p of def?.parameters ?? []) {
    if (p.type !== "number") continue;
    const min = p.min ?? 0;
    const max = p.max ?? 1;
    let v = randRange(rng, min, max);
    if (p.step && p.step >= 1) v = Math.round(v);
    params[p.id] = v;
  }

  const color: ColorSettings = {
    paletteId: Math.floor(randRange(rng, 0, PALETTES.length)),
    paletteOffset: randRange(rng, 0, 1),
    paletteScale: randRange(rng, 0.5, 3),
    brightness: randRange(rng, 0.7, 1.3),
    contrast: randRange(rng, 0.8, 1.4),
    gamma: randRange(rng, 0.7, 1.6),
    paletteSeed: randRange(rng, 0, 1000),
  };

  return { camera, params, color };
}

export interface RandomizeMotionResult {
  /** Values at t=0 — also written as the manual/static fallback for every field. */
  base: RandomizeResult;
  keyframesByParam: Record<string, Keyframe[]>;
}

/**
 * RANDOMIZE doesn't just pick a new still — it keyframes a short morph
 * across the current timeline (t=0 → t=duration) from one random
 * composition to a second one, so pressing it produces motion you can
 * immediately scrub or play, not just a static change (spec's "Chaos"
 * idea: a small generative variation over time). `seed` and `seed+1` are
 * deterministic, so RANDOMIZE stays reproducible from the seed alone.
 */
export function randomizeWithMotion(seed: number, fractalId: string, duration: number): RandomizeMotionResult {
  const a = randomizeComposition(seed, fractalId);
  const b = randomizeComposition(seed + 1, fractalId);

  const keyframesByParam: Record<string, Keyframe[]> = {};
  const track = (paramId: string, valueA: number, valueB: number) => {
    keyframesByParam[paramId] = [
      { time: 0, value: valueA, interpolation: "smooth" },
      { time: duration, value: valueB, interpolation: "smooth" },
    ];
  };

  track(cameraParamKey("centerX"), a.camera.centerX, b.camera.centerX);
  track(cameraParamKey("centerY"), a.camera.centerY, b.camera.centerY);
  track(cameraParamKey("zoom"), a.camera.zoom, b.camera.zoom);
  track(cameraParamKey("rotation"), a.camera.rotation, b.camera.rotation);

  for (const id of Object.keys(a.params)) {
    track(fractalParamKey(fractalId, id), a.params[id], b.params[id]);
  }

  for (const field of Object.keys(a.color) as (keyof ColorSettings)[]) {
    track(colorParamKey(field), a.color[field], b.color[field]);
  }

  return { base: a, keyframesByParam };
}
