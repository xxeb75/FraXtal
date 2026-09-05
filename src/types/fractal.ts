// Fractal family definitions. Each fractal is data + a WGSL shader, not a hardcoded
// UI branch, so adding a new family never touches the renderer or ParameterPanel.

export type ParameterType = "number" | "boolean" | "select" | "color";

export interface ParameterOption {
  label: string;
  value: string;
}

export interface FractalParameter {
  id: string;
  label: string;
  type: ParameterType;
  value: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: ParameterOption[];
  /** Whether this parameter can receive timeline keyframes. */
  animatable: boolean;
  /** One-line plain-language explanation shown as the slider's tooltip —
   * the only place a neophyte can learn what an unfamiliar control does,
   * short of guessing by trial and error. */
  hint?: string;
}

export interface FractalDefinition {
  id: string;
  name: string;
  /** Path to the WGSL shader module implementing this fractal's iteration. */
  shaderPath: string;
  parameters: FractalParameter[];
}
