import { describe, it, expect } from "vitest";
import { serializeProjectToJSON, parseProjectFromJSON } from "./ProjectSerializer";
import type { FractalProject } from "../types/project";

function sampleProject(): FractalProject {
  return {
    version: 1,
    fractal: "julia",
    duration: 20,
    fps: 30,
    resolution: [1920, 1080],
    camera: { centerX: 0, centerY: 0, zoom: 1.3, rotation: 0 },
    parameters: { iterations: 400, bailout: 4, power: 2, cReal: -0.8, cImag: 0.156 },
    keyframes: {
      "julia.cReal": [
        { time: 0, value: -0.8, interpolation: "smooth" },
        { time: 20, value: 0.285, interpolation: "smooth" },
      ],
    },
    palette: {
      paletteId: 2,
      paletteOffset: 0,
      paletteScale: 1,
      brightness: 1,
      contrast: 1,
      gamma: 1,
      paletteSeed: 1,
    },
    postProcessing: { bloom: false, glow: false, vignette: false, chromaticAberration: false, filmGrain: false },
    seed: 827361,
  };
}

describe("ProjectSerializer", () => {
  it("round-trips a project through JSON without loss", () => {
    const project = sampleProject();
    const json = serializeProjectToJSON(project);
    const parsed = parseProjectFromJSON(json);
    expect(parsed).toEqual(project);
  });

  it("produces human-readable (indented) JSON", () => {
    const json = serializeProjectToJSON(sampleProject());
    expect(json).toContain("\n");
  });

  it("rejects a file with the wrong or missing version", () => {
    expect(() => parseProjectFromJSON(JSON.stringify({ ...sampleProject(), version: 2 }))).toThrow();
    expect(() => parseProjectFromJSON(JSON.stringify({ fractal: "mandelbrot" }))).toThrow();
  });

  it("rejects malformed JSON", () => {
    expect(() => parseProjectFromJSON("{not json")).toThrow();
  });
});
