import type { FractalDefinition, FractalParameter } from "../../types/fractal";

// Shared by every escape-time fractal (Mandelbrot, Julia, Burning Ship).
// Newton's iteration doesn't use bailout/power, so it gets its own shorter list.
// Labels and hints are written for a neophyte, not a math textbook — the
// original "Iterations/Bailout/Power/C Real/C Imaginary" told a first-time
// user nothing (impeccable critique, 2026-09-05). The raw ids are unchanged
// (they're the wire format for params/keyframes/audio mappings), only the
// label a person actually reads and the hint their cursor can find changed.
const ITERATIONS: FractalParameter = {
  id: "iterations",
  label: "Detail",
  type: "number",
  value: 300,
  min: 10,
  max: 2000,
  step: 10,
  animatable: true,
  hint: "How much fine detail the fractal resolves before giving up — higher shows more, but renders slower.",
};

const BAILOUT: FractalParameter = {
  id: "bailout",
  label: "Threshold",
  type: "number",
  value: 4,
  min: 2,
  max: 50,
  step: 0.5,
  animatable: true,
  hint: "How far a point has to drift before it counts as \"escaped\" — changes how soft or sharp the edges look.",
};

const POWER: FractalParameter = {
  id: "power",
  label: "Complexity",
  type: "number",
  value: 2,
  min: 2,
  max: 8,
  step: 1,
  animatable: true,
  hint: "The exponent driving the fractal's growth — higher values fold the shape into more petals and spikes.",
};

const C_REAL: FractalParameter = {
  id: "cReal",
  label: "Shape X",
  type: "number",
  value: -0.8,
  min: -2,
  max: 2,
  step: 0.001,
  animatable: true,
  hint: "Together with Shape Y, sets Julia's entire silhouette — drag both to morph between wildly different shapes.",
};

const C_IMAG: FractalParameter = {
  id: "cImag",
  label: "Shape Y",
  type: "number",
  value: 0.156,
  min: -2,
  max: 2,
  step: 0.001,
  animatable: true,
  hint: "Together with Shape X, sets Julia's entire silhouette — drag both to morph between wildly different shapes.",
};

// Registry of available fractal families. The renderer and ParameterPanel
// read from this list only — adding a fractal here (plus its WGSL shader)
// is enough to expose it in the UI, with no per-fractal UI code required.
export const FRACTAL_REGISTRY: FractalDefinition[] = [
  { id: "mandelbrot", name: "Mandelbrot", shaderPath: "", parameters: [ITERATIONS, BAILOUT, { ...POWER }] },
  { id: "julia", name: "Julia", shaderPath: "", parameters: [ITERATIONS, BAILOUT, { ...POWER }, C_REAL, C_IMAG] },
  { id: "burning-ship", name: "Burning Ship", shaderPath: "", parameters: [ITERATIONS, BAILOUT, { ...POWER }] },
  {
    id: "newton",
    name: "Newton",
    shaderPath: "",
    parameters: [{ ...ITERATIONS, value: 50, max: 200, step: 5 }],
  },
  // Not an escape-time fractal — a generative plasma-and-glow-blobs visual
  // for projecting at a party (feast.wgsl). Reuses Iterations/Bailout/Power's
  // ids and ranges (so clamping, audio mappings, and ParameterPanel all work
  // unchanged) but relabeled for what they actually drive here: layer count,
  // wave frequency, and warp distortion instead of an iteration budget.
  {
    id: "feast",
    name: "Feast",
    shaderPath: "",
    parameters: [
      { ...ITERATIONS, label: "Layers", hint: "How many overlapping light layers blend together — more layers, denser texture." },
      { ...BAILOUT, label: "Frequency", hint: "How fast the wave pattern ripples across the screen." },
      { ...POWER, label: "Distortion", hint: "How much the plasma warps and bends — higher gets wilder." },
    ],
  },
  // Also generative, not a fractal (vortex.wgsl) — a kaleidoscope-mirrored
  // tunnel racing toward the viewer. Same reuse trick as Feast: Iterations/
  // Bailout/Power's ids and ranges stay put, relabeled for mirror segment
  // count, tunnel speed, and spiral twist.
  {
    id: "vortex",
    name: "Vortex",
    shaderPath: "",
    parameters: [
      { ...ITERATIONS, label: "Segments", hint: "How many mirrored wedges make up the kaleidoscope." },
      { ...BAILOUT, label: "Speed", hint: "How fast the tunnel races toward you." },
      { ...POWER, label: "Twist", hint: "How much the tunnel corkscrews as it recedes." },
    ],
  },
  // Also generative (bars.wgsl) — a psychedelic fake-3D equalizer, real
  // frequency-spectrum bars with a floor reflection. Same reuse trick again:
  // Iterations/Bailout/Power relabeled for bar count, reflection strength,
  // and edge perspective curve.
  {
    id: "bars",
    name: "Bars",
    shaderPath: "",
    parameters: [
      { ...ITERATIONS, label: "Bars", hint: "How many equalizer bars are shown." },
      { ...BAILOUT, label: "Reflection", hint: "How strong the floor reflection glows beneath the bars." },
      { ...POWER, label: "Curve", hint: "How much the row curves away at the edges, like a wall in the distance." },
    ],
  },
];

export function getFractalDefinition(id: string): FractalDefinition | undefined {
  return FRACTAL_REGISTRY.find((f) => f.id === id);
}
