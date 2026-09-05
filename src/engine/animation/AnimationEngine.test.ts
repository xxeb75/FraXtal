import { describe, it, expect } from "vitest";
import { AnimationEngine } from "./AnimationEngine";

describe("AnimationEngine", () => {
  it("evaluate() returns the fallback for a parameter with no track", () => {
    const engine = new AnimationEngine();
    expect(engine.evaluate("camera.zoom", 5, 1)).toBe(1);
  });

  it("evaluate() reflects keyframes once set", () => {
    const engine = new AnimationEngine();
    engine.setKeyframes("camera.zoom", [
      { time: 0, value: 1, interpolation: "linear" },
      { time: 10, value: 100, interpolation: "linear" },
    ]);
    expect(engine.evaluate("camera.zoom", 5, 1)).toBeCloseTo(50.5);
  });

  it("isAnimated() distinguishes tracks with and without keyframes", () => {
    const engine = new AnimationEngine();
    expect(engine.isAnimated("julia.cReal")).toBe(false);
    engine.addKeyframe("julia.cReal", { time: 0, value: -0.8, interpolation: "smooth" });
    expect(engine.isAnimated("julia.cReal")).toBe(true);
  });

  it("clearTrack() removes a track entirely", () => {
    const engine = new AnimationEngine();
    engine.addKeyframe("julia.cReal", { time: 0, value: -0.8, interpolation: "smooth" });
    engine.clearTrack("julia.cReal");
    expect(engine.isAnimated("julia.cReal")).toBe(false);
    expect(engine.getKeyframes("julia.cReal")).toEqual([]);
  });

  it("evaluateAll() evaluates every fallback key, animated or not", () => {
    const engine = new AnimationEngine();
    engine.setKeyframes("mandelbrot.power", [
      { time: 0, value: 2, interpolation: "linear" },
      { time: 10, value: 6, interpolation: "linear" },
    ]);
    const result = engine.evaluateAll({ "mandelbrot.power": 2, "mandelbrot.bailout": 4 }, 5);
    expect(result["mandelbrot.power"]).toBeCloseTo(4);
    expect(result["mandelbrot.bailout"]).toBe(4); // unanimated, holds fallback
  });
});
