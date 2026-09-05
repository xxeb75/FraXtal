import { describe, it, expect } from "vitest";
import { defaultMappings } from "./loadAudio";
import { cameraParamKey, colorParamKey, fractalParamKey } from "../animation/paramKeys";

describe("defaultMappings", () => {
  it("covers zoom, rotation, and color out of the box (spec §14's own example)", () => {
    const mappings = defaultMappings("mandelbrot");
    const targets = mappings.map((m) => m.targetParamId);
    expect(targets).toContain(cameraParamKey("zoom"));
    expect(targets).toContain(cameraParamKey("rotation"));
    expect(targets).toContain(colorParamKey("paletteOffset"));
    expect(targets).toContain(colorParamKey("brightness"));
  });

  it("adds a shape-changing mapping so the fractal doesn't just pan/zoom/recolor", () => {
    expect(defaultMappings("mandelbrot").map((m) => m.targetParamId)).toContain(fractalParamKey("mandelbrot", "power"));
    expect(defaultMappings("burning-ship").map((m) => m.targetParamId)).toContain(fractalParamKey("burning-ship", "power"));
    const juliaTargets = defaultMappings("julia").map((m) => m.targetParamId);
    expect(juliaTargets).toContain(fractalParamKey("julia", "cReal"));
    expect(juliaTargets).toContain(fractalParamKey("julia", "cImag"));
  });

  it("every mapping has a unique id", () => {
    const ids = defaultMappings("mandelbrot").map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("amounts are non-zero (otherwise nothing would visibly move)", () => {
    for (const fractalId of ["mandelbrot", "julia", "burning-ship", "newton"]) {
      for (const m of defaultMappings(fractalId)) {
        expect(m.amount).not.toBe(0);
      }
    }
  });
});
