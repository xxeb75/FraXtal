// Palette registry: id must match the `pid` branches in common.wgsl's
// palette() function. `preview` is a CSS approximation for swatches only —
// the real gradient is computed on GPU from the IQ cosine coefficients.
export interface PaletteDefinition {
  id: number;
  name: string;
  preview: string;
}

export const PALETTES: PaletteDefinition[] = [
  { id: 0, name: "Monochrome", preview: "linear-gradient(90deg, #162626, #4a8080, #e8fbfb)" },
  { id: 1, name: "Fire", preview: "linear-gradient(90deg, #330f00, #cc5500, #ffdd88)" },
  { id: 2, name: "Ocean", preview: "linear-gradient(90deg, #0a2a40, #2a7aa0, #cfeeff)" },
  { id: 3, name: "Toxic", preview: "linear-gradient(90deg, #1a2600, #7acc00, #e8ffb3)" },
  { id: 4, name: "Neon", preview: "linear-gradient(90deg, #24003a, #ff33aa, #33ccff)" },
  { id: 5, name: "Grayscale", preview: "linear-gradient(90deg, #050505, #808080, #fafafa)" },
  // Coefficients generated on the GPU from color.paletteSeed (common.wgsl) —
  // clicking it again re-rolls the seed for a fresh set. The conic preview
  // just signals "this one changes", it isn't a literal preview.
  { id: 6, name: "Random", preview: "conic-gradient(from 90deg, #ff4d6d, #ffd166, #06d6a0, #4d7cff, #ff4d6d)" },
];
