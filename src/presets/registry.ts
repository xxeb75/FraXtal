import type { Keyframe } from "../types/project";
import { DEFAULT_COLOR_SETTINGS } from "../engine/renderer/FrameRenderer";
import { cameraParamKey, colorParamKey, fractalParamKey } from "../engine/animation/paramKeys";
import type { Preset } from "./types";

// Small local helper so each preset's keyframesByParam reads as a list of
// (paramId, [values at times]) rows rather than repeating the Keyframe
// object shape everywhere — the presets below are still pure data, this
// just keeps that data legible.
function track(points: [time: number, value: number][], interpolation: Keyframe["interpolation"] = "smooth"): Keyframe[] {
  return points.map(([time, value]) => ({ time, value, interpolation }));
}

export const PRESETS: Preset[] = [
  {
    id: "infinite-zoom",
    name: "Infinite Zoom",
    description: "Mandelbrot, diving into the seahorse valley over the full timeline.",
    fractalId: "mandelbrot",
    duration: 30,
    camera: { centerX: -0.743643887037151, centerY: 0.13182590420533, zoom: 1, rotation: 0 },
    params: { iterations: 600, bailout: 4, power: 2 },
    color: { ...DEFAULT_COLOR_SETTINGS, paletteId: 4 },
    keyframesByParam: {
      [cameraParamKey("zoom")]: track([
        [0, 1],
        [30, 300],
      ]),
    },
  },
  {
    id: "julia-mutation",
    name: "Julia Mutation",
    description: "Julia set, its constant C drifting from dendrites into island clusters.",
    fractalId: "julia",
    duration: 20,
    camera: { centerX: 0, centerY: 0, zoom: 1.3, rotation: 0 },
    params: { iterations: 400, bailout: 4, power: 2, cReal: -0.8, cImag: 0.156 },
    color: { ...DEFAULT_COLOR_SETTINGS, paletteId: 2 },
    keyframesByParam: {
      [fractalParamKey("julia", "cReal")]: track([
        [0, -0.8],
        [20, 0.285],
      ]),
      [fractalParamKey("julia", "cImag")]: track([
        [0, 0.156],
        [20, 0.01],
      ]),
      [cameraParamKey("rotation")]: track([
        [0, 0],
        [20, Math.PI * 0.5],
      ]),
      [cameraParamKey("zoom")]: track([
        [0, 1.3],
        [20, 250],
      ]),
    },
  },
  {
    id: "burning-ship-dive",
    name: "Burning Ship Dive",
    description: "Burning Ship, zooming into a detailed fold of the hull.",
    fractalId: "burning-ship",
    duration: 25,
    camera: { centerX: -1.75, centerY: -0.03, zoom: 1, rotation: 0 },
    params: { iterations: 600, bailout: 4, power: 2 },
    color: { ...DEFAULT_COLOR_SETTINGS, paletteId: 1 },
    keyframesByParam: {
      [cameraParamKey("zoom")]: track([
        [0, 1],
        [25, 400],
      ]),
    },
  },
  {
    id: "toxic-bloom",
    name: "Toxic Bloom",
    description: "Mandelbrot breathing in and out, glowing toxic green.",
    fractalId: "mandelbrot",
    duration: 16,
    camera: { centerX: -0.5, centerY: 0, zoom: 1, rotation: 0 },
    params: { iterations: 300, bailout: 4, power: 2 },
    color: { ...DEFAULT_COLOR_SETTINGS, paletteId: 3 },
    keyframesByParam: {
      [cameraParamKey("zoom")]: track([
        [0, 1],
        [8, 3],
        [16, 1],
      ]),
      [colorParamKey("paletteOffset")]: track([
        [0, 0],
        [16, 1],
      ]),
    },
  },
  {
    id: "mathematical-nightmare",
    name: "Mathematical Nightmare",
    description: "Newton's basins, slowly rotating through a shifting, uneasy palette.",
    fractalId: "newton",
    duration: 20,
    camera: { centerX: 0, centerY: 0, zoom: 1.4, rotation: 0 },
    params: { iterations: 60, bailout: 4, power: 2 },
    color: { ...DEFAULT_COLOR_SETTINGS, paletteId: 6, paletteSeed: 1 },
    keyframesByParam: {
      [cameraParamKey("rotation")]: track([
        [0, 0],
        [20, Math.PI * 2],
      ], "linear"),
      [colorParamKey("paletteSeed")]: track([
        [0, 1],
        [6.6, 250],
        [13.3, 500],
        [20, 750],
      ], "linear"),
      [cameraParamKey("zoom")]: track([
        [0, 1.4],
        [20, 180],
      ]),
    },
  },
  // Feast, Vortex, and Bars are the least jargon-dependent, most "just
  // click and see magic" modes — impeccable critique (2026-09-05) flagged
  // them as the only ones with zero one-click starting point, exactly
  // backwards from where a first-timer would land first.
  {
    id: "molten-core",
    name: "Molten Core",
    description: "Feast's plasma glowing fire-hot, layers breathing in and out.",
    fractalId: "feast",
    duration: 20,
    camera: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 },
    params: { iterations: 500, bailout: 6, power: 4 },
    color: { ...DEFAULT_COLOR_SETTINGS, paletteId: 1 },
    keyframesByParam: {
      [colorParamKey("paletteOffset")]: track([
        [0, 0],
        [20, 2],
      ], "linear"),
    },
  },
  {
    id: "warp-speed",
    name: "Warp Speed",
    description: "Vortex accelerating into a neon tunnel, spinning as it goes.",
    fractalId: "vortex",
    duration: 20,
    camera: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 },
    params: { iterations: 400, bailout: 8, power: 4 },
    color: { ...DEFAULT_COLOR_SETTINGS, paletteId: 4 },
    keyframesByParam: {
      [cameraParamKey("zoom")]: track([
        [0, 1],
        [20, 15],
      ]),
      [cameraParamKey("rotation")]: track([
        [0, 0],
        [20, Math.PI * 4],
      ], "linear"),
    },
  },
  {
    id: "club-night",
    name: "Club Night",
    description: "Bars in full swing — reflection glowing, colors cycling through the set.",
    fractalId: "bars",
    duration: 20,
    camera: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 },
    params: { iterations: 500, bailout: 30, power: 5 },
    color: { ...DEFAULT_COLOR_SETTINGS, paletteId: 4 },
    keyframesByParam: {
      [colorParamKey("paletteOffset")]: track([
        [0, 0],
        [20, 3],
      ], "linear"),
    },
  },
];

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
