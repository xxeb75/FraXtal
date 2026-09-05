import { describe, it, expect } from "vitest";
import { evaluateFrame, evaluateAnimatedFrame, DEFAULT_COLOR_SETTINGS } from "./FrameRenderer";
import type { CameraState } from "../../types/project";
import type { FractalRenderParams } from "../fractals/defaults";
import type { AudioAnalysis } from "../audio/AudioAnalyzer";

const camera: CameraState = { centerX: -0.5, centerY: 0, zoom: 1, rotation: 0 };
const params: FractalRenderParams = { iterations: 300, bailout: 4, power: 2 };

describe("evaluateFrame", () => {
  it("maps camera + params + color straight into the uniform bag", () => {
    const uniforms = evaluateFrame(camera, 800, 600, params, DEFAULT_COLOR_SETTINGS);
    expect(uniforms.resolutionX).toBe(800);
    expect(uniforms.resolutionY).toBe(600);
    expect(uniforms.centerX).toBe(-0.5);
    expect(uniforms.iterations).toBe(300);
    expect(uniforms.power).toBe(2);
    expect(uniforms.paletteId).toBe(0);
  });

  it("defaults cReal/cImag to 0 for fractals that don't use them (e.g. Mandelbrot)", () => {
    const uniforms = evaluateFrame(camera, 800, 600, params);
    expect(uniforms.cReal).toBe(0);
    expect(uniforms.cImag).toBe(0);
  });

  it("passes Julia's cReal/cImag through untouched", () => {
    const juliaParams: FractalRenderParams = { ...params, cReal: -0.8, cImag: 0.156 };
    const uniforms = evaluateFrame(camera, 800, 600, juliaParams);
    expect(uniforms.cReal).toBe(-0.8);
    expect(uniforms.cImag).toBe(0.156);
  });
});

describe("evaluateAnimatedFrame", () => {
  it("falls back to the manual value when a param has no keyframes", () => {
    const uniforms = evaluateAnimatedFrame("mandelbrot", camera, params, {}, 5, 800, 600);
    expect(uniforms.zoom).toBe(1);
    expect(uniforms.power).toBe(2);
  });

  it("interpolates an animated param at time t, matching Track's own math", () => {
    const keyframesByParam = {
      "mandelbrot.power": [
        { time: 0, value: 2, interpolation: "linear" as const },
        { time: 10, value: 6, interpolation: "linear" as const },
      ],
    };
    const at0 = evaluateAnimatedFrame("mandelbrot", camera, params, keyframesByParam, 0, 800, 600);
    const at5 = evaluateAnimatedFrame("mandelbrot", camera, params, keyframesByParam, 5, 800, 600);
    const at10 = evaluateAnimatedFrame("mandelbrot", camera, params, keyframesByParam, 10, 800, 600);
    expect(at0.power).toBe(2);
    expect(at5.power).toBeCloseTo(4);
    expect(at10.power).toBe(6);
  });

  it("namespaces keyframes per fractal — Julia's power track never leaks into Mandelbrot's", () => {
    const keyframesByParam = {
      "julia.power": [
        { time: 0, value: 2, interpolation: "linear" as const },
        { time: 10, value: 8, interpolation: "linear" as const },
      ],
    };
    const uniforms = evaluateAnimatedFrame("mandelbrot", camera, params, keyframesByParam, 5, 800, 600);
    expect(uniforms.power).toBe(2); // manual fallback, unaffected by julia's track
  });

  it("animates color, including a fractional paletteId for the shader's crossfade", () => {
    const keyframesByParam = {
      "color.paletteId": [
        { time: 0, value: 1, interpolation: "linear" as const },
        { time: 10, value: 2, interpolation: "linear" as const },
      ],
    };
    const uniforms = evaluateAnimatedFrame("mandelbrot", camera, params, keyframesByParam, 5, 800, 600, DEFAULT_COLOR_SETTINGS);
    expect(uniforms.paletteId).toBeCloseTo(1.5);
  });

  it("is a pure function: same inputs always produce the same uniforms (determinism)", () => {
    const keyframesByParam = {
      "camera.zoom": [
        { time: 0, value: 1, interpolation: "smooth" as const },
        { time: 30, value: 300, interpolation: "smooth" as const },
      ],
    };
    const a = evaluateAnimatedFrame("mandelbrot", camera, params, keyframesByParam, 12.5, 1920, 1080);
    const b = evaluateAnimatedFrame("mandelbrot", camera, params, keyframesByParam, 12.5, 1920, 1080);
    expect(a).toEqual(b);
  });

  it("layers audio-reactive modulation additively on top of the keyframed/manual value", () => {
    const analysis: AudioAnalysis = {
      duration: 1,
      frameRate: 1,
      bass: [0, 2],
      mid: [0, 0],
      treble: [0, 0],
      amplitude: [0, 0],
      kick: [0, 0],
      waveform: new Float32Array(0),
      waveformSamplesPerFrame: 0,
      spectrum: new Float32Array(0),
      spectrumBinsPerFrame: 0,
    };
    const mappings = [{ id: "m1", source: "bass" as const, targetParamId: "camera.zoom", amount: 0.5 }];

    const withoutAudio = evaluateAnimatedFrame("mandelbrot", camera, params, {}, 1, 800, 600);
    const withAudio = evaluateAnimatedFrame("mandelbrot", camera, params, {}, 1, 800, 600, DEFAULT_COLOR_SETTINGS, analysis, mappings);

    expect(withoutAudio.zoom).toBe(1); // manual camera.zoom, unaffected
    expect(withAudio.zoom).toBeCloseTo(1 + 2 * 0.5); // + bass(t=1)=2 * amount 0.5
  });

  it("audio mappings with no analysis loaded are a no-op", () => {
    const mappings = [{ id: "m1", source: "bass" as const, targetParamId: "camera.zoom", amount: 0.5 }];
    const result = evaluateAnimatedFrame("mandelbrot", camera, params, {}, 1, 800, 600, DEFAULT_COLOR_SETTINGS, null, mappings);
    expect(result.zoom).toBe(1);
  });
});
