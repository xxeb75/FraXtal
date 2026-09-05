import type { LayerRequest } from "../renderer/WebGPURenderer";
import { evaluateAnimatedFrame } from "../renderer/FrameRenderer";
import type { FractalRenderParams } from "../fractals/defaults";
import { FRACTAL_DEFAULT_PARAMS } from "../fractals/defaults";
import { waveformWindowAt, spectrumWindowAt } from "../audio/AudioAnalyzer";
import type { AudioAnalysis } from "../audio/AudioAnalyzer";
import { getPreset } from "../../presets/registry";
import type { Preset } from "../../presets/types";

// Scene chaining (inspired by HeavyM's sequencer — user request 2026-09-05):
// a Sequence is an ordered list of presets, each held for its own number of
// seconds, crossfading into the next one instead of hard-cutting. Unlike the
// existing manual "Layer B" feature (FractalSelector's checkbox), which
// shares one camera/color/keyframe state across two simultaneous fractals,
// each scene here is a fully independent preset — its own fractal, camera,
// params, color and keyframes — so a whole VJ set can be built from presets
// that look nothing alike.

export interface SequenceStep {
  presetId: string;
  /** How long this scene holds before crossfading into the next one, seconds. */
  holdSeconds: number;
}

export const DEFAULT_TRANSITION_SECONDS = 3;
export const MIN_STEP_HOLD_SECONDS = 1;

export function sequenceTotalDuration(sequence: SequenceStep[]): number {
  return sequence.reduce((sum, step) => sum + step.holdSeconds, 0);
}

interface StepWindow {
  step: SequenceStep;
  preset: Preset;
  start: number;
  end: number;
  index: number;
}

function stepWindows(sequence: SequenceStep[]): StepWindow[] {
  let t = 0;
  const windows: StepWindow[] = [];
  for (let i = 0; i < sequence.length; i++) {
    const step = sequence[i];
    const preset = getPreset(step.presetId);
    if (!preset) continue; // a deleted/renamed preset id just drops out of the set rather than crashing playback
    windows.push({ step, preset, start: t, end: t + step.holdSeconds, index: windows.length });
    t += step.holdSeconds;
  }
  return windows;
}

/** A preset's own `params` is data (presets/types.ts's Preset.params is a
 * plain Record<string, number>), not guaranteed to carry every field
 * FractalRenderParams needs (a hand-edited preset could omit one) — merging
 * over that fractal's own defaults keeps evaluateAnimatedFrame's inputs
 * always complete, the same safety FRACTAL_DEFAULT_PARAMS already gives
 * paramsByFractal's seeding in the store. */
function paramsFor(preset: Preset): FractalRenderParams {
  const defaults = FRACTAL_DEFAULT_PARAMS[preset.fractalId] ?? { iterations: 300, bailout: 4, power: 2 };
  return { ...defaults, ...preset.params } as FractalRenderParams;
}

function buildLayer(
  preset: Preset,
  localTime: number,
  width: number,
  height: number,
  audioAnalysis: AudioAnalysis | null,
): LayerRequest {
  const uniforms = evaluateAnimatedFrame(
    preset.fractalId,
    preset.camera,
    paramsFor(preset),
    preset.keyframesByParam,
    localTime,
    width,
    height,
    preset.color,
    audioAnalysis,
    // Audio *mappings* are authored against one live track's own param
    // targets (AudioSection); a sequence's scenes weren't authored with any
    // particular mapping set in mind, so they don't carry one — a scene
    // still gets audio's kick/bass etc. through whatever the preset itself
    // keyframes, just not an extra reactive layer on top (v1 scope).
    [],
  );
  return {
    fractalId: preset.fractalId,
    uniforms,
    waveform: preset.fractalId === "feast" && audioAnalysis ? waveformWindowAt(audioAnalysis, localTime) : undefined,
    spectrum: preset.fractalId === "bars" && audioAnalysis ? spectrumWindowAt(audioAnalysis, localTime) : undefined,
  };
}

export interface ResolvedSequenceFrame {
  layerA: LayerRequest;
  /** The upcoming scene, only while a crossfade is in progress. */
  layerB: LayerRequest | null;
  /** null outside a transition; 0→1 crossfade weight toward layerB during one. */
  crossfade: number | null;
}

/**
 * Resolves a whole sequence down to exactly what WebGPURenderer.renderComposite()
 * needs at one instant. The live viewport's render loop and the offline
 * exporter both call this the same way (same contract as evaluateAnimatedFrame
 * itself), so scrubbing the sequence preview and the exported frame at that
 * same time can never diverge. Loops back to the first scene past the total
 * duration, same "boucle" behavior the single-preset timeline already has.
 */
export function resolveSequenceFrame(
  sequence: SequenceStep[],
  time: number,
  transitionSeconds: number,
  width: number,
  height: number,
  audioAnalysis: AudioAnalysis | null = null,
): ResolvedSequenceFrame | null {
  const windows = stepWindows(sequence);
  if (windows.length === 0) return null;

  const total = windows[windows.length - 1].end;
  const t = total > 0 ? ((time % total) + total) % total : 0;
  const current = windows.find((w) => t >= w.start && t < w.end) ?? windows[windows.length - 1];
  const layerA = buildLayer(current.preset, t - current.start, width, height, audioAnalysis);

  if (windows.length < 2 || transitionSeconds <= 0) {
    return { layerA, layerB: null, crossfade: null };
  }

  // Crossfade only during the last `window` seconds of the current scene —
  // capped at half its hold so two short scenes back to back can't overlap
  // into each other's transitions.
  const window = Math.min(transitionSeconds, current.step.holdSeconds / 2);
  const untilEnd = current.end - t;
  if (window <= 0 || untilEnd > window) {
    return { layerA, layerB: null, crossfade: null };
  }

  const next = windows[(current.index + 1) % windows.length];
  const nextLocalTime = window - untilEnd; // 0 at the transition's start, `window` right at the cut
  const layerB = buildLayer(next.preset, nextLocalTime, width, height, audioAnalysis);
  const crossfade = nextLocalTime / window;
  return { layerA, layerB, crossfade };
}
