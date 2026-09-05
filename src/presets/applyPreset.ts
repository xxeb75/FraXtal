import { useEditorStore } from "../store/editorStore";
import { buildProjectFromStore } from "../project/Project";
import type { FractalRenderParams } from "../engine/fractals/defaults";
import type { ColorSettings } from "../engine/renderer/FrameRenderer";
import type { Preset } from "./types";

/**
 * The one generic function every preset goes through — presets themselves
 * stay pure data (registry.ts), this is the only place that knows how to
 * turn that data into store writes. Clears existing keyframes first so a
 * preset always produces the composition it describes, not a mix with
 * whatever the user had running before — but captures an undo snapshot
 * first, so that's a keystroke away from being reversed rather than a
 * blocking "are you sure?" dialog in front of a one-click action.
 */
export function applyPreset(preset: Preset): void {
  const s = useEditorStore.getState();

  s.setUndoSnapshot(buildProjectFromStore());
  s.clearAllKeyframes();
  s.setSelectedFractalId(preset.fractalId);
  // A loaded track already set the timeline to the song's real length
  // (loadAudio.ts) — a preset's own fixed duration is only a fallback for
  // when there's no audio dictating one, never an override that would
  // truncate the timeline out from under a longer track.
  const hasAudio = !!s.audioAnalysis;
  if (!hasAudio) {
    s.setDuration(preset.duration);
  }
  const targetDuration = hasAudio ? s.duration : preset.duration;
  s.setCurrentTime(0);
  s.requestCameraChange(preset.camera);

  for (const [id, value] of Object.entries(preset.params)) {
    s.setParam(preset.fractalId, id as keyof FractalRenderParams, value);
  }
  for (const [field, value] of Object.entries(preset.color) as [keyof ColorSettings, number][]) {
    s.setColorField(field, value);
  }
  // Every preset authors its keyframe times against its own `duration`
  // (e.g. "Infinite Zoom" dives from 0 to 30s). Dropped in unscaled onto a
  // full song's much longer timeline, that motion plays once in the first
  // 20-30s and then just holds its last value — the rest of the track
  // looks frozen but for the (much subtler) audio-reactive offset. Scaling
  // every keyframe time by targetDuration/preset.duration keeps the same
  // shape of motion stretched to fill however long the timeline actually is.
  const timeScale = preset.duration > 0 ? targetDuration / preset.duration : 1;
  for (const [paramId, keyframes] of Object.entries(preset.keyframesByParam)) {
    const scaled = timeScale === 1 ? keyframes : keyframes.map((k) => ({ ...k, time: k.time * timeScale }));
    s.setKeyframesForParam(paramId, scaled);
  }
}
