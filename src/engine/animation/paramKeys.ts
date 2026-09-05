import { FRACTAL_REGISTRY } from "../fractals/registry";

// Qualified parameter ids used as keys into keyframesByParam. Fractal
// parameters are namespaced per fractal ("julia.cReal") since the same
// short id (e.g. "power") means something different per fractal and must
// not share keyframes across them.
export function fractalParamKey(fractalId: string, paramId: string): string {
  return `${fractalId}.${paramId}`;
}

export function cameraParamKey(field: "centerX" | "centerY" | "zoom" | "rotation"): string {
  return `camera.${field}`;
}

export function colorParamKey(
  field: "paletteId" | "paletteOffset" | "paletteScale" | "brightness" | "contrast" | "gamma" | "paletteSeed",
): string {
  return `color.${field}`;
}

export const CAMERA_FIELD_LABELS: Record<string, string> = {
  centerX: "Center X",
  centerY: "Center Y",
  zoom: "Zoom",
  rotation: "Rotation",
};

const COLOR_FIELD_LABELS: Record<string, string> = {
  paletteId: "Palette",
  paletteOffset: "Palette Offset",
  paletteScale: "Palette Scale",
  brightness: "Brightness",
  contrast: "Contrast",
  gamma: "Gamma",
  paletteSeed: "Palette Seed",
};

const FRACTAL_NAMES: Record<string, string> = Object.fromEntries(FRACTAL_REGISTRY.map((f) => [f.id, f.name]));

/** Friendly display label for a qualified param id, e.g. "Julia · C Real". */
export function paramDisplayLabel(paramId: string): string {
  const [scope, field] = paramId.split(".");
  if (scope === "camera") return `Camera · ${CAMERA_FIELD_LABELS[field] ?? field}`;
  if (scope === "color") return `Color · ${COLOR_FIELD_LABELS[field] ?? field}`;

  const fractalName = FRACTAL_NAMES[scope] ?? scope;
  const paramLabel = FRACTAL_REGISTRY.find((f) => f.id === scope)?.parameters.find((p) => p.id === field)?.label;
  return `${fractalName} · ${paramLabel ?? field}`;
}
