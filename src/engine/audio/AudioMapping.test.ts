import { describe, it, expect } from "vitest";
import { audioOffsetFor } from "./AudioMapping";
import type { AudioAnalysis } from "./AudioAnalyzer";

const analysis: AudioAnalysis = {
  duration: 1,
  frameRate: 2,
  bass: [0, 1],
  mid: [0, 0],
  treble: [0, 0],
  amplitude: [0, 0],
  waveform: new Float32Array(0),
  waveformSamplesPerFrame: 0,
  spectrum: new Float32Array(0),
  spectrumBinsPerFrame: 0,
};

describe("audioOffsetFor", () => {
  it("is zero with no analysis loaded", () => {
    expect(audioOffsetFor("camera.zoom", null, [{ id: "m1", source: "bass", targetParamId: "camera.zoom", amount: 1 }], 0.5)).toBe(0);
  });

  it("is zero with no mappings", () => {
    expect(audioOffsetFor("camera.zoom", analysis, [], 0.5)).toBe(0);
  });

  it("is zero for a param no mapping targets", () => {
    const mappings = [{ id: "m1", source: "bass" as const, targetParamId: "camera.zoom", amount: 1 }];
    expect(audioOffsetFor("camera.rotation", analysis, mappings, 0.5)).toBe(0);
  });

  it("scales the band value by amount for a matching mapping", () => {
    const mappings = [{ id: "m1", source: "bass" as const, targetParamId: "camera.zoom", amount: 0.5 }];
    // frameRate=2 -> t=0.5s lands exactly on frame index 1 -> bass=1
    expect(audioOffsetFor("camera.zoom", analysis, mappings, 0.5)).toBeCloseTo(0.5);
  });

  it("sums multiple mappings targeting the same param", () => {
    const mappings = [
      { id: "m1", source: "bass" as const, targetParamId: "camera.zoom", amount: 1 },
      { id: "m2", source: "bass" as const, targetParamId: "camera.zoom", amount: 2 },
    ];
    expect(audioOffsetFor("camera.zoom", analysis, mappings, 0.5)).toBeCloseTo(3);
  });
});
