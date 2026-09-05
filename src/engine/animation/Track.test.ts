import { describe, it, expect } from "vitest";
import { Track, evaluateKeyframes } from "./Track";

describe("Track", () => {
  it("holds the single keyframe's value everywhere when there's only one", () => {
    const t = new Track();
    t.setKeyframes([{ time: 5, value: 42, interpolation: "linear" }]);
    expect(t.evaluate(0)).toBe(42);
    expect(t.evaluate(5)).toBe(42);
    expect(t.evaluate(100)).toBe(42);
  });

  it("holds the edge value before the first and after the last keyframe", () => {
    const t = new Track();
    t.setKeyframes([
      { time: 0, value: 1, interpolation: "linear" },
      { time: 10, value: 100, interpolation: "linear" },
    ]);
    expect(t.evaluate(-5)).toBe(1);
    expect(t.evaluate(15)).toBe(100);
  });

  it("interpolates linearly between two keyframes", () => {
    const t = new Track();
    t.setKeyframes([
      { time: 0, value: 0, interpolation: "linear" },
      { time: 10, value: 100, interpolation: "linear" },
    ]);
    expect(t.evaluate(5)).toBeCloseTo(50);
    expect(t.evaluate(2.5)).toBeCloseTo(25);
  });

  it("picks the surrounding pair correctly with 3+ keyframes", () => {
    const t = new Track();
    t.setKeyframes([
      { time: 0, value: 0, interpolation: "linear" },
      { time: 10, value: 100, interpolation: "linear" },
      { time: 20, value: 0, interpolation: "linear" },
    ]);
    expect(t.evaluate(15)).toBeCloseTo(50);
  });

  it("sorts out-of-order keyframes", () => {
    const t = new Track();
    t.setKeyframes([
      { time: 10, value: 100, interpolation: "linear" },
      { time: 0, value: 0, interpolation: "linear" },
    ]);
    expect(t.evaluate(5)).toBeCloseTo(50);
  });

  it("addKeyframe replaces an existing keyframe at the same time", () => {
    const t = new Track();
    t.addKeyframe({ time: 0, value: 1, interpolation: "linear" });
    t.addKeyframe({ time: 0, value: 2, interpolation: "linear" });
    expect(t.getKeyframes()).toHaveLength(1);
    expect(t.evaluate(0)).toBe(2);
  });

  it("removeKeyframe drops the matching keyframe only", () => {
    const t = new Track();
    t.setKeyframes([
      { time: 0, value: 0, interpolation: "linear" },
      { time: 10, value: 100, interpolation: "linear" },
    ]);
    t.removeKeyframe(0);
    expect(t.getKeyframes()).toHaveLength(1);
    expect(t.getKeyframes()[0].time).toBe(10);
  });

  it("isEmpty reflects keyframe count", () => {
    const t = new Track();
    expect(t.isEmpty()).toBe(true);
    t.addKeyframe({ time: 0, value: 1, interpolation: "linear" });
    expect(t.isEmpty()).toBe(false);
  });

  it("throws if evaluated with no keyframes", () => {
    const t = new Track();
    expect(() => t.evaluate(0)).toThrow();
  });
});

describe("evaluateKeyframes", () => {
  it("returns the fallback for an empty keyframe list", () => {
    expect(evaluateKeyframes([], 5, 42)).toBe(42);
  });

  it("evaluates a non-empty list without needing a Track instance", () => {
    const kfs = [
      { time: 0, value: 0, interpolation: "linear" as const },
      { time: 10, value: 100, interpolation: "linear" as const },
    ];
    expect(evaluateKeyframes(kfs, 5, 0)).toBeCloseTo(50);
  });
});
