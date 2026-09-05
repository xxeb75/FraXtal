import { describe, it, expect } from "vitest";
import { applyEasing, lerp } from "./Interpolation";

describe("applyEasing", () => {
  it("clamps outside [0,1]", () => {
    expect(applyEasing(-1, "linear")).toBe(0);
    expect(applyEasing(2, "linear")).toBe(1);
  });

  it("linear is identity", () => {
    expect(applyEasing(0.3, "linear")).toBeCloseTo(0.3);
  });

  it("every curve starts at 0 and ends at 1", () => {
    const types = ["linear", "easeIn", "easeOut", "easeInOut", "smooth", "exponential"] as const;
    for (const t of types) {
      expect(applyEasing(0, t)).toBeCloseTo(0);
      expect(applyEasing(1, t)).toBeCloseTo(1);
    }
  });

  it("smooth (smoothstep) is symmetric around 0.5", () => {
    expect(applyEasing(0.5, "smooth")).toBeCloseTo(0.5);
  });

  it("easeIn starts slower than linear, easeOut starts faster", () => {
    expect(applyEasing(0.3, "easeIn")).toBeLessThan(0.3);
    expect(applyEasing(0.3, "easeOut")).toBeGreaterThan(0.3);
  });
});

describe("lerp", () => {
  it("interpolates linearly between two values", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it("handles negative ranges", () => {
    expect(lerp(-10, 10, 0.5)).toBe(0);
  });
});
