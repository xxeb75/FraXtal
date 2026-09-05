import { describe, it, expect } from "vitest";
import { audioValueAt, type AudioAnalysis } from "./AudioAnalyzer";

function fakeAnalysis(): AudioAnalysis {
  return {
    duration: 3,
    frameRate: 10,
    bass: [0, 0.5, 1, 0.5, 0, 0.5, 1, 0.5, 0, 0.2, 0.4],
    mid: new Array(11).fill(0.3),
    treble: new Array(11).fill(0.1),
    amplitude: new Array(11).fill(0.6),
    waveform: new Float32Array(0),
    waveformSamplesPerFrame: 0,
    spectrum: new Float32Array(0),
    spectrumBinsPerFrame: 0,
  };
}

describe("audioValueAt", () => {
  it("returns the exact sample at an on-grid time", () => {
    const a = fakeAnalysis();
    expect(audioValueAt(a, "bass", 0)).toBe(0);
    expect(audioValueAt(a, "bass", 0.2)).toBe(1);
  });

  it("interpolates linearly between grid points", () => {
    const a = fakeAnalysis();
    // frame 0 = 0, frame 1 = 0.5, at t halfway between them (0.05s)
    expect(audioValueAt(a, "bass", 0.05)).toBeCloseTo(0.25);
  });

  it("holds the last value past the end of the analysis", () => {
    const a = fakeAnalysis();
    expect(audioValueAt(a, "bass", 999)).toBe(a.bass[a.bass.length - 1]);
  });

  it("holds the first value before time 0", () => {
    const a = fakeAnalysis();
    expect(audioValueAt(a, "bass", -5)).toBe(a.bass[0]);
  });

  it("reads the requested band independently", () => {
    const a = fakeAnalysis();
    expect(audioValueAt(a, "mid", 1)).toBeCloseTo(0.3);
    expect(audioValueAt(a, "amplitude", 1)).toBeCloseTo(0.6);
  });
});
