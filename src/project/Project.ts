import { useEditorStore } from "../store/editorStore";
import type { FractalProject } from "../types/project";
import type { ColorSettings } from "../engine/renderer/FrameRenderer";
import type { FractalRenderParams } from "../engine/fractals/defaults";

/**
 * Snapshot of everything needed to reproduce the current composition —
 * matches the FractalProject shape exactly (spec §18), so this is the whole
 * .fractal file once serialized. Post-processing isn't built yet, so it's
 * written as all-off; the field exists now so old projects stay forward-
 * compatible once that phase lands (no format migration needed).
 */
export function buildProjectFromStore(): FractalProject {
  const s = useEditorStore.getState();
  return {
    version: 1,
    fractal: s.selectedFractalId,
    duration: s.duration,
    fps: s.fps,
    resolution: s.resolution,
    camera: s.camera,
    parameters: s.paramsByFractal[s.selectedFractalId] as unknown as Record<string, number | boolean | string>,
    keyframes: s.keyframesByParam,
    palette: s.color,
    postProcessing: { bloom: false, glow: false, vignette: false, chromaticAberration: false, filmGrain: false },
    seed: s.lastSeed,
  };
}

/** The inverse of buildProjectFromStore — loading a project clears whatever
 * composition was live first, same as applying a preset. */
export function applyProjectToStore(project: FractalProject): void {
  const s = useEditorStore.getState();

  s.clearAllKeyframes();
  s.setSelectedFractalId(project.fractal);
  s.setDuration(project.duration);
  s.setFps(project.fps);
  s.setResolution(project.resolution);
  s.setCurrentTime(0);
  s.requestCameraChange(project.camera);

  for (const [id, value] of Object.entries(project.parameters)) {
    if (typeof value === "number") {
      s.setParam(project.fractal, id as keyof FractalRenderParams, value);
    }
  }
  for (const [field, value] of Object.entries(project.palette) as [keyof ColorSettings, number][]) {
    s.setColorField(field, value);
  }
  for (const [paramId, keyframes] of Object.entries(project.keyframes)) {
    s.setKeyframesForParam(paramId, keyframes);
  }
  s.setLastSeed(project.seed);
}
