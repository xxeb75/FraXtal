import type { CameraState, Keyframe } from "../../types/project";
import type { RenderUniforms } from "./WebGPURenderer";
import type { FractalRenderParams } from "../fractals/defaults";
import { evaluateKeyframes } from "../animation/Track";
import { cameraParamKey, colorParamKey, fractalParamKey } from "../animation/paramKeys";
import type { AudioAnalysis } from "../audio/AudioAnalyzer";
import type { AudioMapping } from "../audio/AudioMapping";
import { audioOffsetFor } from "../audio/AudioMapping";
import { getFractalDefinition } from "../fractals/registry";

/** Same floor Camera.zoomAt() uses — keeps 4.0/zoom finite in screenToComplex(). */
const MIN_ZOOM = 1e-6;

/**
 * Audio mappings add an unbounded offset on top of a keyframed/manual value
 * (spec §14's "additive, not a replacement" contract), so a loud moment or
 * an aggressive user-authored mapping can push a fractal parameter outside
 * the range its slider ever allowed. iterations is the dangerous one: cast
 * to u32 in the shader, a negative value wraps to a huge unsigned count and
 * the per-pixel escape loop effectively never terminates — a GPU hang the
 * driver eventually TDRs on, freezing the whole window. Clamping every
 * fractal param back to its registry-declared [min, max] here (the single
 * function both the live viewport and the offline exporter call) closes
 * that off for both at once instead of trusting every caller to.
 */
function clampToParamRange(fractalId: string, paramId: string, value: number): number {
  const def = getFractalDefinition(fractalId);
  const param = def?.parameters.find((p) => p.id === paramId);
  if (!param || typeof param.min !== "number" || typeof param.max !== "number") return value;
  return Math.min(param.max, Math.max(param.min, value));
}

export interface ColorSettings {
  paletteId: number;
  paletteOffset: number;
  paletteScale: number;
  brightness: number;
  contrast: number;
  gamma: number;
  /** Seeds the "Random" palette's generated coefficients (id 6, see common.wgsl). */
  paletteSeed: number;
}

export const DEFAULT_COLOR_SETTINGS: ColorSettings = {
  paletteId: 0,
  paletteOffset: 0,
  paletteScale: 1,
  brightness: 1,
  contrast: 1,
  gamma: 1,
  paletteSeed: 1,
};

/**
 * Pure function turning camera + fractal state into the flat uniform bag
 * WebGPURenderer needs. Used by the live viewport today and, unchanged, by
 * the offline frame-by-frame exporter later (Phase 15) — preview and final
 * render must never diverge in how a frame is computed.
 */
export function evaluateFrame(
  camera: CameraState,
  resolutionX: number,
  resolutionY: number,
  params: FractalRenderParams,
  color: ColorSettings = DEFAULT_COLOR_SETTINGS,
  time = 0,
): RenderUniforms {
  return {
    resolutionX,
    resolutionY,
    centerX: camera.centerX,
    centerY: camera.centerY,
    zoom: camera.zoom,
    rotation: camera.rotation,
    iterations: params.iterations,
    bailout: params.bailout,
    cReal: params.cReal ?? 0,
    cImag: params.cImag ?? 0,
    power: params.power,
    paletteId: color.paletteId,
    paletteOffset: color.paletteOffset,
    paletteScale: color.paletteScale,
    brightness: color.brightness,
    contrast: color.contrast,
    gamma: color.gamma,
    paletteSeed: color.paletteSeed,
    time,
  };
}

/**
 * The Phase 10 contract: at any time t, every value the renderer uses comes
 * from the AnimationEngine, not straight from manual/interactive state. A
 * parameter with no keyframes just evaluates to its manual value (the
 * fallback), so dragging the camera or a slider keeps working exactly as
 * before until the user actually keyframes that field. This function is the
 * single place that resolves "manual value, or animated at time t" — the
 * live viewport calls it every frame, and the offline exporter (Phase 15)
 * will call it once per output frame, so preview and final render can never
 * diverge in how a frame is computed.
 */
export function evaluateAnimatedFrame(
  fractalId: string,
  manualCamera: CameraState,
  manualParams: FractalRenderParams,
  keyframesByParam: Record<string, Keyframe[]>,
  time: number,
  resolutionX: number,
  resolutionY: number,
  manualColor: ColorSettings = DEFAULT_COLOR_SETTINGS,
  audioAnalysis: AudioAnalysis | null = null,
  audioMappings: AudioMapping[] = [],
): RenderUniforms {
  // A param's final value = keyframed-or-manual value, plus whatever the
  // audio mappings targeting it add at this instant (spec §14: "Bass → Zoom,
  // Amount: 0.35" — additive, not a replacement, so it layers on top of any
  // hand-authored animation instead of fighting it).
  const at = (paramId: string, fallback: number) =>
    evaluateKeyframes(keyframesByParam[paramId] ?? [], time, fallback) +
    audioOffsetFor(paramId, audioAnalysis, audioMappings, time);

  const camera: CameraState = {
    centerX: at(cameraParamKey("centerX"), manualCamera.centerX),
    centerY: at(cameraParamKey("centerY"), manualCamera.centerY),
    zoom: Math.max(MIN_ZOOM, at(cameraParamKey("zoom"), manualCamera.zoom)),
    rotation: at(cameraParamKey("rotation"), manualCamera.rotation),
  };

  const clampParam = (paramId: "iterations" | "bailout" | "power" | "cReal" | "cImag", value: number) =>
    clampToParamRange(fractalId, paramId, value);

  const params: FractalRenderParams = {
    iterations: clampParam("iterations", at(fractalParamKey(fractalId, "iterations"), manualParams.iterations)),
    bailout: clampParam("bailout", at(fractalParamKey(fractalId, "bailout"), manualParams.bailout)),
    power: clampParam("power", at(fractalParamKey(fractalId, "power"), manualParams.power)),
    cReal:
      manualParams.cReal !== undefined
        ? clampParam("cReal", at(fractalParamKey(fractalId, "cReal"), manualParams.cReal))
        : undefined,
    cImag:
      manualParams.cImag !== undefined
        ? clampParam("cImag", at(fractalParamKey(fractalId, "cImag"), manualParams.cImag))
        : undefined,
  };

  // Color morphs too — including paletteId itself, which the shader's
  // palette() blends fractionally between two families (see common.wgsl).
  const color: ColorSettings = {
    paletteId: at(colorParamKey("paletteId"), manualColor.paletteId),
    paletteOffset: at(colorParamKey("paletteOffset"), manualColor.paletteOffset),
    paletteScale: at(colorParamKey("paletteScale"), manualColor.paletteScale),
    brightness: at(colorParamKey("brightness"), manualColor.brightness),
    contrast: at(colorParamKey("contrast"), manualColor.contrast),
    gamma: at(colorParamKey("gamma"), manualColor.gamma),
    paletteSeed: at(colorParamKey("paletteSeed"), manualColor.paletteSeed),
  };

  return evaluateFrame(camera, resolutionX, resolutionY, params, color, time);
}
