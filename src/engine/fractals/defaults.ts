import { FRACTAL_REGISTRY } from "./registry";

// Per-fractal default parameter values, derived from registry.ts's
// FractalParameter descriptors so the default and the slider's starting
// position can never drift apart.
export interface FractalRenderParams {
  iterations: number;
  bailout: number;
  power: number;
  /** Julia's fixed complex constant. Ignored by fractals that don't use it. */
  cReal?: number;
  cImag?: number;
}

function defaultParamsFor(fractalId: string): FractalRenderParams {
  const def = FRACTAL_REGISTRY.find((f) => f.id === fractalId);
  const values: Record<string, number> = {};
  for (const p of def?.parameters ?? []) {
    if (p.type === "number") values[p.id] = p.value as number;
  }
  return {
    iterations: values.iterations ?? 300,
    bailout: values.bailout ?? 4,
    power: values.power ?? 2,
    cReal: values.cReal,
    cImag: values.cImag,
  };
}

export const FRACTAL_DEFAULT_PARAMS: Record<string, FractalRenderParams> = Object.fromEntries(
  FRACTAL_REGISTRY.map((f) => [f.id, defaultParamsFor(f.id)]),
);

// Where the camera resets to when switching fractal families — each
// fractal's interesting structure is centered differently (Mandelbrot's
// main cardioid sits at ~-0.5, a Julia set is centered on the origin).
export const FRACTAL_DEFAULT_CAMERA: Record<string, { centerX: number; centerY: number; zoom: number; rotation: number }> = {
  mandelbrot: { centerX: -0.5, centerY: 0, zoom: 1, rotation: 0 },
  julia: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 },
  "burning-ship": { centerX: -0.4, centerY: -0.5, zoom: 1, rotation: 0 },
  newton: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 },
  feast: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 },
  vortex: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 },
  bars: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 },
};

// Where an automatic deep zoom (the default "infinite zoom" audio.loadAudio
// seeds, distinct from FRACTAL_DEFAULT_CAMERA's wide establishing shot)
// should dive toward — a coordinate on the boundary with detail at every
// depth, not into the cardioid/bulb interior or open exterior, either of
// which just gets emptier the deeper you go. Mandelbrot's is the
// well-known "seahorse valley"; Burning Ship's is a documented detailed
// fold of the hull (same point "Burning Ship Dive" already uses).
export const FRACTAL_ZOOM_TARGET: Record<string, { centerX: number; centerY: number }> = {
  mandelbrot: { centerX: -0.743643887037151, centerY: 0.13182590420533 },
  julia: { centerX: 0, centerY: 0 },
  "burning-ship": { centerX: -1.75, centerY: -0.03 },
  newton: { centerX: 0, centerY: 0 },
  // Feast/Vortex have no boundary/interior to dive toward — "center" only
  // pans the generative field, so there's no wrong place to start, and
  // Vortex's own tunnel-depth math already races toward the viewer without
  // needing the camera to help.
  feast: { centerX: 0, centerY: 0 },
  vortex: { centerX: 0, centerY: 0 },
};
