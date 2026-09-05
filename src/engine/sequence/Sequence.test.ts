import { describe, it, expect } from "vitest";
import { resolveSequenceFrame, sequenceTotalDuration, type SequenceStep } from "./Sequence";

// Uses the real preset registry (presets/registry.ts) rather than mocks —
// resolveSequenceFrame's whole job is turning preset ids into frames, so a
// fake preset would test nothing about that lookup actually working.
const twoScenes: SequenceStep[] = [
  { presetId: "infinite-zoom", holdSeconds: 10 }, // mandelbrot
  { presetId: "julia-mutation", holdSeconds: 10 }, // julia
];

describe("sequenceTotalDuration", () => {
  it("sums every step's hold time", () => {
    expect(sequenceTotalDuration(twoScenes)).toBe(20);
  });

  it("is 0 for an empty sequence", () => {
    expect(sequenceTotalDuration([])).toBe(0);
  });
});

describe("resolveSequenceFrame", () => {
  it("returns null for an empty sequence — callers fall back to normal single-fractal rendering", () => {
    expect(resolveSequenceFrame([], 0, 3, 800, 600)).toBeNull();
  });

  it("drops an unknown preset id instead of crashing, using only the valid steps", () => {
    const withGhost: SequenceStep[] = [{ presetId: "does-not-exist", holdSeconds: 5 }, ...twoScenes];
    const resolved = resolveSequenceFrame(withGhost, 1, 3, 800, 600);
    expect(resolved?.layerA.fractalId).toBe("mandelbrot"); // infinite-zoom, the first *valid* step
  });

  it("shows only the current scene, no crossfade, well before the transition window", () => {
    const resolved = resolveSequenceFrame(twoScenes, 1, 3, 800, 600);
    expect(resolved?.layerA.fractalId).toBe("mandelbrot");
    expect(resolved?.layerB).toBeNull();
    expect(resolved?.crossfade).toBeNull();
  });

  it("crossfades into the next scene during the last `transitionSeconds` of the current one", () => {
    // Scene 1 spans [0,10), a 3s transition window means it starts at t=7.
    // Halfway through that window (t=8.5) crossfade should read ~0.5.
    const resolved = resolveSequenceFrame(twoScenes, 8.5, 3, 800, 600);
    expect(resolved?.layerA.fractalId).toBe("mandelbrot");
    expect(resolved?.layerB?.fractalId).toBe("julia");
    expect(resolved?.crossfade).toBeCloseTo(0.5, 5);
  });

  it("is near crossfade 0 right as the transition window opens and near 1 right up to the cut", () => {
    const atOpen = resolveSequenceFrame(twoScenes, 7, 3, 800, 600);
    expect(atOpen?.crossfade).toBeCloseTo(0, 5);
    const atCut = resolveSequenceFrame(twoScenes, 9.999, 3, 800, 600);
    expect(atCut?.crossfade).toBeGreaterThan(0.99);
  });

  it("loops back to the first scene past the sequence's total duration", () => {
    const resolved = resolveSequenceFrame(twoScenes, 20 + 1, 3, 800, 600); // total=20, wraps to t=1
    expect(resolved?.layerA.fractalId).toBe("mandelbrot");
  });

  it("caps the transition window at half a scene's hold so two short scenes can't overlap into each other", () => {
    const shortScenes: SequenceStep[] = [
      { presetId: "infinite-zoom", holdSeconds: 2 },
      { presetId: "julia-mutation", holdSeconds: 2 },
    ];
    // A 3s transitionSeconds request gets capped to 1s (half of 2s) — at
    // t=0.5 (1.5s before the cut) we should NOT be in a transition yet.
    const resolved = resolveSequenceFrame(shortScenes, 0.5, 3, 800, 600);
    expect(resolved?.crossfade).toBeNull();
  });

  it("never crossfades with only one scene in the sequence", () => {
    const oneScene: SequenceStep[] = [{ presetId: "infinite-zoom", holdSeconds: 5 }];
    const resolved = resolveSequenceFrame(oneScene, 4.9, 3, 800, 600);
    expect(resolved?.crossfade).toBeNull();
    expect(resolved?.layerB).toBeNull();
  });

  it("is a pure function: the same time always resolves to the same frame", () => {
    const a = resolveSequenceFrame(twoScenes, 8.5, 3, 800, 600);
    const b = resolveSequenceFrame(twoScenes, 8.5, 3, 800, 600);
    expect(a).toEqual(b);
  });
});
