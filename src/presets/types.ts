import type { CameraState, Keyframe } from "../types/project";
import type { ColorSettings } from "../engine/renderer/FrameRenderer";

/**
 * A preset is pure data — fractal id, base values, and optional motion — no
 * per-preset code. registry.ts only ever adds new entries to an array; the
 * generic apply logic (applyPreset.ts) never needs to change.
 */
export interface Preset {
  id: string;
  name: string;
  description: string;
  fractalId: string;
  duration: number;
  camera: CameraState;
  params: Record<string, number>;
  color: ColorSettings;
  /** Optional animated tracks, keyed by qualified param id (see paramKeys.ts). */
  keyframesByParam: Record<string, Keyframe[]>;
}
