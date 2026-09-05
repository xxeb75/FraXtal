import { describe, it, expect } from "vitest";
import { FRACTAL_REGISTRY, getFractalDefinition } from "./registry";
import { FRACTAL_DEFAULT_PARAMS, FRACTAL_DEFAULT_CAMERA } from "./defaults";

describe("fractal registry", () => {
  it("declares the four V1 fractals plus the generative, non-fractal visuals (Feast, Vortex, Bars)", () => {
    const ids = FRACTAL_REGISTRY.map((f) => f.id);
    expect(ids).toEqual(["mandelbrot", "julia", "burning-ship", "newton", "feast", "vortex", "bars"]);
  });

  it("getFractalDefinition finds a registered fractal and misses an unknown one", () => {
    expect(getFractalDefinition("julia")?.name).toBe("Julia");
    expect(getFractalDefinition("does-not-exist")).toBeUndefined();
  });

  it("every registered fractal has matching default params and camera (no dangling id)", () => {
    for (const f of FRACTAL_REGISTRY) {
      expect(FRACTAL_DEFAULT_PARAMS[f.id]).toBeDefined();
      expect(FRACTAL_DEFAULT_CAMERA[f.id]).toBeDefined();
    }
  });

  it("only Julia exposes cReal/cImag parameters", () => {
    const withC = FRACTAL_REGISTRY.filter((f) => f.parameters.some((p) => p.id === "cReal"));
    expect(withC.map((f) => f.id)).toEqual(["julia"]);
  });

  it("Newton exposes only iterations (bailout/power are meaningless for it)", () => {
    const newton = getFractalDefinition("newton");
    expect(newton?.parameters.map((p) => p.id)).toEqual(["iterations"]);
  });

  it("switching from Mandelbrot to Julia resets to a different camera center (spec: each fractal frames differently)", () => {
    expect(FRACTAL_DEFAULT_CAMERA.mandelbrot).not.toEqual(FRACTAL_DEFAULT_CAMERA.julia);
  });
});
