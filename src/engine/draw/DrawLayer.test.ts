import { describe, it, expect } from "vitest";
import { resolveStroke, STROKE_LIFETIME_SECONDS, type DrawStroke } from "./DrawLayer";

function makeStroke(bornAt: number): DrawStroke {
  return {
    id: "s1",
    bornAt,
    color: "#f97316",
    width: 0.004,
    points: [
      // jitterPhase/jitterFreq at 0 keeps the continuous tremor at exactly 0
      // (sin(0)=0 regardless of time) so it doesn't interfere with the
      // shatter/fade assertions below — jitter gets its own dedicated test.
      { x: 0.2, y: 0.2, shatterX: 1, shatterY: 0, shatterSpeed: 1, jitterPhase: 0, jitterFreq: 0 },
      { x: 0.8, y: 0.2, shatterX: -1, shatterY: 0, shatterSpeed: 1, jitterPhase: 0, jitterFreq: 0 },
    ],
  };
}

describe("resolveStroke", () => {
  it("returns null before the stroke is born (e.g. scrubbing earlier on the timeline)", () => {
    expect(resolveStroke(makeStroke(5), 4.9, 0)).toBeNull();
  });

  it("returns null once fully past its lifetime", () => {
    expect(resolveStroke(makeStroke(0), STROKE_LIFETIME_SECONDS, 0)).toBeNull();
  });

  it("sits at its original position with no scatter right when born and no kick", () => {
    const resolved = resolveStroke(makeStroke(0), 0, 0);
    expect(resolved?.[0].x).toBeCloseTo(0.2);
    expect(resolved?.[0].alpha).toBeCloseTo(1);
  });

  it("fades linearly toward 0 opacity over its lifetime", () => {
    const half = resolveStroke(makeStroke(0), STROKE_LIFETIME_SECONDS / 2, 0);
    expect(half?.[0].alpha).toBeCloseTo(0.5, 5);
  });

  it("scatters points apart on a strong kick, once past the age ramp", () => {
    const resolved = resolveStroke(makeStroke(0), 1, 1); // age=1s >> the ~0.25s ramp, kick=1 (max)
    // Point 0 has shatterX=1 (pushed +x), point 1 has shatterX=-1 (pushed -x) —
    // a real kick should visibly pull them apart from their drawn positions.
    expect(resolved![0].x).toBeGreaterThan(0.2);
    expect(resolved![1].x).toBeLessThan(0.8);
  });

  it("does not scatter yet immediately after birth, even with a strong kick (the age ramp)", () => {
    const resolved = resolveStroke(makeStroke(0), 0.001, 1);
    expect(resolved![0].x).toBeCloseTo(0.2, 2);
  });

  it("dims (not just scatters) during a strong kick", () => {
    const quiet = resolveStroke(makeStroke(0), 1, 0)!;
    const loud = resolveStroke(makeStroke(0), 1, 1)!;
    expect(loud[0].alpha).toBeLessThan(quiet[0].alpha);
  });

  it("is a pure function: same stroke/time/kick always resolves the same way", () => {
    const stroke = makeStroke(2);
    const a = resolveStroke(stroke, 3.4, 0.6);
    const b = resolveStroke(stroke, 3.4, 0.6);
    expect(a).toEqual(b);
  });

  it("adds a small continuous tremor independent of the kick, once past the age ramp", () => {
    const stroke = makeStroke(0);
    stroke.points[0].jitterPhase = 1.2;
    stroke.points[0].jitterFreq = 5;
    const resolved = resolveStroke(stroke, 1, 0); // no kick at all — jitter alone should still move it
    expect(resolved![0].x).not.toBeCloseTo(0.2, 5);
  });

  it("does not jitter yet immediately after birth (same age ramp as the shatter)", () => {
    const stroke = makeStroke(0);
    stroke.points[0].jitterPhase = 1.2;
    stroke.points[0].jitterFreq = 5;
    const resolved = resolveStroke(stroke, 0.001, 0);
    expect(resolved![0].x).toBeCloseTo(0.2, 3);
  });
});
