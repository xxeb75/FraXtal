// .fractal project file shape. Kept flat and JSON-serializable so a project is
// fully reproducible from disk alone (see cahier des charges §18).
import type { ColorSettings } from "../engine/renderer/FrameRenderer";

export interface CameraState {
  centerX: number;
  centerY: number;
  zoom: number;
  rotation: number;
}

export interface PostProcessingState {
  bloom: boolean;
  glow: boolean;
  vignette: boolean;
  chromaticAberration: boolean;
  filmGrain: boolean;
}

export type InterpolationType =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "smooth"
  | "exponential";

export interface Keyframe {
  time: number;
  value: number;
  interpolation: InterpolationType;
}

export interface FractalProject {
  version: 1;
  fractal: string;
  duration: number;
  fps: number;
  resolution: [number, number];
  camera: CameraState;
  parameters: Record<string, number | boolean | string>;
  keyframes: Record<string, Keyframe[]>;
  palette: ColorSettings;
  postProcessing: PostProcessingState;
  seed: number;
}
