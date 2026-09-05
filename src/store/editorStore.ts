import { create } from "zustand";
import type { CameraState, Keyframe, InterpolationType, FractalProject } from "../types/project";
import { DEFAULT_COLOR_SETTINGS, type ColorSettings } from "../engine/renderer/FrameRenderer";
import { FRACTAL_DEFAULT_PARAMS, type FractalRenderParams } from "../engine/fractals/defaults";
import type { AudioAnalysis } from "../engine/audio/AudioAnalyzer";
import type { AudioMapping } from "../engine/audio/AudioMapping";
import type { RenderProgress } from "../export/RenderQueue";
import { getPreset } from "../presets/registry";
import {
  sequenceTotalDuration,
  DEFAULT_TRANSITION_SECONDS,
  MIN_STEP_HOLD_SECONDS,
  type SequenceStep,
} from "../engine/sequence/Sequence";
import { STROKE_LIFETIME_SECONDS, DEFAULT_DRAW_COLOR, type DrawItem } from "../engine/draw/DrawLayer";

// Central editor state. UI reads/writes here; the render engine stays
// independent of React and is driven from this state by the viewport.
interface EditorState {
  selectedFractalId: string;
  setSelectedFractalId: (id: string) => void;

  // A second mode composited additively on top of the first (renderComposite()
  // in WebGPURenderer.ts) — e.g. Bars over Feast. null means single-layer,
  // today's default and the only case that costs anything extra. Shares
  // camera/color/keyframes/audio mappings with the primary layer; only the
  // fractal id and that fractal's own paramsByFractal entry differ.
  layerBFractalId: string | null;
  setLayerBFractalId: (id: string | null) => void;

  // Live fractal-specific parameter values, keyed by fractal id so switching
  // away and back preserves whatever the user tweaked. Seeded lazily from
  // FRACTAL_DEFAULT_PARAMS the first time a fractal is selected.
  paramsByFractal: Record<string, FractalRenderParams>;
  setParam: (fractalId: string, paramId: keyof FractalRenderParams, value: number) => void;

  // Mirrors the live Camera instance owned by FractalViewport, updated on
  // pointer interaction (not every animation frame) so panels can display
  // and later edit it without the render loop depending on React state.
  camera: CameraState;
  setCamera: (camera: CameraState) => void;

  // One-shot command consumed by FractalViewport: setting this asks the
  // live Camera instance to jump to a new state (used by RANDOMIZE, and
  // later by "load project"). null once applied.
  cameraCommand: CameraState | null;
  requestCameraChange: (camera: CameraState) => void;
  clearCameraCommand: () => void;

  lastSeed: number;
  setLastSeed: (seed: number) => void;

  color: ColorSettings;
  setColorField: (field: keyof ColorSettings, value: number) => void;

  currentTime: number;
  duration: number;
  fps: number;
  isPlaying: boolean;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setFps: (fps: number) => void;
  togglePlaying: () => void;

  resolution: [number, number];
  setResolution: (resolution: [number, number]) => void;

  // Keyframes per qualified parameter id ("camera.zoom", "julia.cReal", …).
  // Plain serializable data — matches the .fractal project file shape
  // directly (types/project.ts) and is turned into an AnimationEngine
  // Track only at evaluation time (live render loop, offline exporter).
  keyframesByParam: Record<string, Keyframe[]>;
  addOrUpdateKeyframe: (paramId: string, time: number, value: number, interpolation: InterpolationType) => void;
  removeKeyframe: (paramId: string, time: number) => void;
  moveKeyframe: (paramId: string, oldTime: number, newTime: number) => void;
  /** Replaces a whole track at once — used by RANDOMIZE to lay down a full motion in one go. */
  setKeyframesForParam: (paramId: string, keyframes: Keyframe[]) => void;
  /** Drops every track — presets apply onto a clean slate rather than mixing with whatever was there. */
  clearAllKeyframes: () => void;

  presetBrowserOpen: boolean;
  togglePresetBrowser: () => void;

  // Offline render progress (Phase 15) — read by RenderProgressOverlay.
  // The actual RenderQueue instance lives outside the store (see
  // export/activeRenderQueue.ts); this is just its reported numbers.
  renderProgress: RenderProgress | null;
  setRenderProgress: (progress: RenderProgress | null) => void;

  // One-shot recovery snapshot: RANDOMIZE and PRESETS capture the whole
  // composition here right before they overwrite it, so a single UNDO
  // (button or Ctrl+Z) can bring it back without a blocking confirmation
  // dialog interrupting the "just try things" flow those actions exist for.
  undoSnapshot: FractalProject | null;
  setUndoSnapshot: (snapshot: FractalProject | null) => void;

  // Audio-reactive (spec §14, pulled forward per user priority): the
  // analyzed track (bass/mid/treble/amplitude time series) plus the list of
  // "band → param, amount" mappings. The raw audio bytes/object-URL live
  // outside the store (see engine/audio/activeAudioBytes.ts) — this only
  // holds what's cheap to keep here and what the UI needs to render.
  audioFileName: string | null;
  audioObjectUrl: string | null;
  audioAnalysis: AudioAnalysis | null;
  audioLoading: boolean;
  audioError: string | null;
  setAudioLoaded: (fileName: string, objectUrl: string | null, analysis: AudioAnalysis) => void;
  setAudioLoading: (loading: boolean) => void;
  setAudioError: (error: string | null) => void;
  clearAudio: () => void;

  audioMappings: AudioMapping[];
  addAudioMapping: (mapping: AudioMapping) => void;
  updateAudioMapping: (id: string, patch: Partial<Omit<AudioMapping, "id">>) => void;
  removeAudioMapping: (id: string) => void;

  // Scene chaining (HeavyM-inspired sequencer, user request 2026-09-05): an
  // ordered list of presets, each held for its own duration, crossfading
  // into the next (engine/sequence/Sequence.ts resolves the actual frames).
  // Building/editing the list never touches playback; only setSequenceActive
  // does, so composing a set doesn't interrupt whatever's on screen.
  sequence: SequenceStep[];
  sequenceTransitionSeconds: number;
  sequenceActive: boolean;
  /** duration/currentTime before entering Sequence mode — setSequenceActive
   * restores it on exit rather than leaving the timeline permanently
   * stretched to the sequence's own total length. */
  preSequenceDuration: number | null;
  addSequenceStep: (presetId: string) => void;
  removeSequenceStep: (index: number) => void;
  moveSequenceStep: (index: number, direction: -1 | 1) => void;
  setSequenceStepHold: (index: number, holdSeconds: number) => void;
  setSequenceTransitionSeconds: (seconds: number) => void;
  /** true starts playback from 0 across the whole sequence; false stops and
   * hands the timeline back to whatever single preset/track was active. */
  setSequenceActive: (active: boolean) => void;
  clearSequence: () => void;

  // Live drawing that disintegrates to the beat (user request 2026-09-05):
  // an overlay independent of the fractal renderer (engine/draw/DrawLayer.ts,
  // DrawCanvas.tsx). drawMode only gates *capturing new strokes* — committed
  // ones keep animating/fading regardless, so toggling it off mid-song
  // doesn't freeze or erase what's already been drawn.
  drawMode: boolean;
  setDrawMode: (on: boolean) => void;
  /** Which gesture Draw mode captures — freehand strokes, or a tap to place
   * a line of text (2026-09-05 follow-up: "same behavior, text disintegrates
   * too"). Only meaningful while drawMode is on. */
  drawTool: "stroke" | "text";
  setDrawTool: (tool: "stroke" | "text") => void;
  /** Applies to items drawn from now on — doesn't recolor ones already on
   * screen, same as changing a slider's default never rewrites past
   * keyframes. */
  drawColor: string;
  setDrawColor: (color: string) => void;
  /** Holds both strokes and text items (DrawItem) — the name predates text
   * but "drawn items" is what it means throughout. */
  drawStrokes: DrawItem[];
  addDrawStroke: (item: DrawItem) => void;
  clearDrawStrokes: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  selectedFractalId: "mandelbrot",
  setSelectedFractalId: (id) => set({ selectedFractalId: id }),

  layerBFractalId: null,
  setLayerBFractalId: (id) => set({ layerBFractalId: id }),

  // Seeded eagerly for every registered fractal (cheap, tiny objects) so
  // setParam never has to special-case "first time this fractal is picked".
  paramsByFractal: Object.fromEntries(
    Object.entries(FRACTAL_DEFAULT_PARAMS).map(([id, params]) => [id, { ...params }]),
  ),
  setParam: (fractalId, paramId, value) =>
    set((s) => ({
      paramsByFractal: {
        ...s.paramsByFractal,
        [fractalId]: { ...s.paramsByFractal[fractalId], [paramId]: value },
      },
    })),

  camera: { centerX: -0.5, centerY: 0, zoom: 1, rotation: 0 },
  setCamera: (camera) => set({ camera }),

  cameraCommand: null,
  requestCameraChange: (camera) => set({ cameraCommand: camera }),
  clearCameraCommand: () => set({ cameraCommand: null }),

  lastSeed: 0,
  setLastSeed: (seed) => set({ lastSeed: seed }),

  color: { ...DEFAULT_COLOR_SETTINGS },
  setColorField: (field, value) => set((s) => ({ color: { ...s.color, [field]: value } })),

  currentTime: 0,
  duration: 30,
  fps: 30,
  isPlaying: false,
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setFps: (fps) => set({ fps }),
  togglePlaying: () => set((s) => ({ isPlaying: !s.isPlaying })),

  resolution: [1920, 1080],
  setResolution: (resolution) => set({ resolution }),

  keyframesByParam: {},
  addOrUpdateKeyframe: (paramId, time, value, interpolation) =>
    set((s) => {
      const existing = s.keyframesByParam[paramId] ?? [];
      const withoutSameTime = existing.filter((k) => k.time !== time);
      const next = [...withoutSameTime, { time, value, interpolation }].sort((a, b) => a.time - b.time);
      return { keyframesByParam: { ...s.keyframesByParam, [paramId]: next } };
    }),
  removeKeyframe: (paramId, time) =>
    set((s) => {
      const existing = s.keyframesByParam[paramId] ?? [];
      const next = existing.filter((k) => k.time !== time);
      const rest = { ...s.keyframesByParam };
      if (next.length === 0) {
        delete rest[paramId];
      } else {
        rest[paramId] = next;
      }
      return { keyframesByParam: rest };
    }),
  moveKeyframe: (paramId, oldTime, newTime) =>
    set((s) => {
      const existing = s.keyframesByParam[paramId] ?? [];
      const kf = existing.find((k) => k.time === oldTime);
      if (!kf) return {};
      const withoutOld = existing.filter((k) => k.time !== oldTime && k.time !== newTime);
      const next = [...withoutOld, { ...kf, time: newTime }].sort((a, b) => a.time - b.time);
      return { keyframesByParam: { ...s.keyframesByParam, [paramId]: next } };
    }),
  setKeyframesForParam: (paramId, keyframes) =>
    set((s) => ({ keyframesByParam: { ...s.keyframesByParam, [paramId]: [...keyframes].sort((a, b) => a.time - b.time) } })),
  clearAllKeyframes: () => set({ keyframesByParam: {} }),

  presetBrowserOpen: false,
  togglePresetBrowser: () => set((s) => ({ presetBrowserOpen: !s.presetBrowserOpen })),

  renderProgress: null,
  setRenderProgress: (progress) => set({ renderProgress: progress }),

  undoSnapshot: null,
  setUndoSnapshot: (snapshot) => set({ undoSnapshot: snapshot }),

  audioFileName: null,
  audioObjectUrl: null,
  audioAnalysis: null,
  audioLoading: false,
  audioError: null,
  setAudioLoaded: (fileName, objectUrl, analysis) =>
    set({ audioFileName: fileName, audioObjectUrl: objectUrl, audioAnalysis: analysis, audioLoading: false, audioError: null }),
  setAudioLoading: (loading) => set((s) => ({ audioLoading: loading, audioError: loading ? null : s.audioError })),
  setAudioError: (error) => set({ audioError: error, audioLoading: false }),
  clearAudio: () =>
    set({ audioFileName: null, audioObjectUrl: null, audioAnalysis: null, audioMappings: [], audioLoading: false, audioError: null }),

  audioMappings: [],
  addAudioMapping: (mapping) => set((s) => ({ audioMappings: [...s.audioMappings, mapping] })),
  updateAudioMapping: (id, patch) =>
    set((s) => ({ audioMappings: s.audioMappings.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  removeAudioMapping: (id) => set((s) => ({ audioMappings: s.audioMappings.filter((m) => m.id !== id) })),

  sequence: [],
  sequenceTransitionSeconds: DEFAULT_TRANSITION_SECONDS,
  sequenceActive: false,
  preSequenceDuration: null,
  addSequenceStep: (presetId) =>
    set((s) => ({
      sequence: [...s.sequence, { presetId, holdSeconds: getPreset(presetId)?.duration ?? 10 }],
    })),
  removeSequenceStep: (index) => set((s) => ({ sequence: s.sequence.filter((_, i) => i !== index) })),
  moveSequenceStep: (index, direction) =>
    set((s) => {
      const target = index + direction;
      if (target < 0 || target >= s.sequence.length) return {};
      const next = [...s.sequence];
      [next[index], next[target]] = [next[target], next[index]];
      return { sequence: next };
    }),
  setSequenceStepHold: (index, holdSeconds) =>
    set((s) => ({
      sequence: s.sequence.map((step, i) =>
        i === index ? { ...step, holdSeconds: Math.max(MIN_STEP_HOLD_SECONDS, holdSeconds) } : step,
      ),
    })),
  setSequenceTransitionSeconds: (seconds) => set({ sequenceTransitionSeconds: Math.max(0, seconds) }),
  setSequenceActive: (active) =>
    set((s) => {
      if (active) {
        return {
          sequenceActive: true,
          preSequenceDuration: s.duration,
          duration: Math.max(1, sequenceTotalDuration(s.sequence)),
          currentTime: 0,
          isPlaying: true,
        };
      }
      return { sequenceActive: false, duration: s.preSequenceDuration ?? s.duration, isPlaying: false };
    }),
  clearSequence: () =>
    set((s) => ({
      sequence: [],
      sequenceActive: false,
      duration: s.sequenceActive ? (s.preSequenceDuration ?? s.duration) : s.duration,
      isPlaying: s.sequenceActive ? false : s.isPlaying,
    })),

  drawMode: false,
  setDrawMode: (on) => set({ drawMode: on }),
  drawTool: "stroke",
  setDrawTool: (tool) => set({ drawTool: tool }),
  drawColor: DEFAULT_DRAW_COLOR,
  setDrawColor: (color) => set({ drawColor: color }),
  drawStrokes: [],
  // Drops anything already past its own visible lifetime while adding the
  // new one — a live-drawing feature run over a long track would otherwise
  // grow this array forever even though old items contribute nothing
  // (resolveDrawItem already returns null for them).
  addDrawStroke: (item) =>
    set((s) => ({
      drawStrokes: [...s.drawStrokes.filter((it) => s.currentTime - it.bornAt < STROKE_LIFETIME_SECONDS), item],
    })),
  clearDrawStrokes: () => set({ drawStrokes: [] }),
}));
