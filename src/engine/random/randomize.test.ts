import { describe, it, expect } from "vitest";
import { mulberry32, randRange } from "./prng";
import { randomizeComposition, randomizeWithMotion } from "./randomize";

describe("mulberry32", () => {
  it("is deterministic: same seed always gives the same sequence", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("different seeds diverge", () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });

  it("stays within [0, 1)", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("randRange", () => {
  it("stays within [min, max)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      const v = randRange(rng, -2, 2);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(2);
    }
  });
});

describe("randomizeComposition", () => {
  it("is fully reproducible from seed + fractal id (spec §11)", () => {
    const a = randomizeComposition(827361, "julia");
    const b = randomizeComposition(827361, "julia");
    expect(a).toEqual(b);
  });

  it("different seeds produce different compositions", () => {
    const a = randomizeComposition(1, "mandelbrot");
    const b = randomizeComposition(2, "mandelbrot");
    expect(a).not.toEqual(b);
  });

  it("only generates params the fractal actually declares", () => {
    const newton = randomizeComposition(1, "newton");
    expect(Object.keys(newton.params)).toEqual(["iterations"]);

    const julia = randomizeComposition(1, "julia");
    expect(Object.keys(julia.params).sort()).toEqual(["bailout", "cImag", "cReal", "iterations", "power"].sort());
  });
});

describe("randomizeWithMotion", () => {
  it("keyframes every animated param at t=0 and t=duration", () => {
    const { keyframesByParam } = randomizeWithMotion(1, "mandelbrot", 30);
    for (const track of Object.values(keyframesByParam)) {
      expect(track).toHaveLength(2);
      expect(track[0].time).toBe(0);
      expect(track[1].time).toBe(30);
    }
  });

  it("base values match the seed's first snapshot", () => {
    const seed = 555;
    const { base } = randomizeWithMotion(seed, "julia", 20);
    const expectedBase = randomizeComposition(seed, "julia");
    expect(base).toEqual(expectedBase);
  });
});
