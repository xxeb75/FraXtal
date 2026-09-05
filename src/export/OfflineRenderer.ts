import { WebGPURenderer } from "../engine/renderer/WebGPURenderer";
import { evaluateAnimatedFrame } from "../engine/renderer/FrameRenderer";
import type { ColorSettings } from "../engine/renderer/FrameRenderer";
import type { CameraState, Keyframe } from "../types/project";
import type { FractalRenderParams } from "../engine/fractals/defaults";
import type { AudioAnalysis } from "../engine/audio/AudioAnalyzer";
import { waveformWindowAt, spectrumWindowAt } from "../engine/audio/AudioAnalyzer";
import type { AudioMapping } from "../engine/audio/AudioMapping";

export interface OfflineFrameRequest {
  fractalId: string;
  camera: CameraState;
  params: FractalRenderParams;
  keyframesByParam: Record<string, Keyframe[]>;
  color: ColorSettings;
  audioAnalysis?: AudioAnalysis | null;
  audioMappings?: AudioMapping[];
  /** A second mode composited on top of the first (renderComposite() in
   * WebGPURenderer.ts) — shares camera/color/keyframes/audio with the
   * primary layer, only the fractal id and its own params differ, exactly
   * like the live preview's layer B. */
  layerB?: { fractalId: string; params: FractalRenderParams } | null;
}

/**
 * Renders one frame at a time to an offscreen canvas sized at the export
 * resolution — completely decoupled from the live viewport's canvas size or
 * refresh rate (spec §16/§17: offline render must not depend on the display).
 * Every frame goes through the exact same evaluateAnimatedFrame() the live
 * preview uses, so an exported video always matches what scrubbing showed.
 */
export class OfflineRenderer {
  private renderer = new WebGPURenderer();
  private canvas: OffscreenCanvas;
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.canvas = new OffscreenCanvas(width, height);
  }

  async init(): Promise<void> {
    await this.renderer.init(this.canvas);
  }

  /** Renders the frame at `time` (seconds) and returns it as PNG bytes. */
  async renderFrame(request: OfflineFrameRequest, time: number): Promise<Uint8Array> {
    const buildLayer = (fractalId: string, params: FractalRenderParams) => {
      const uniforms = evaluateAnimatedFrame(
        fractalId,
        request.camera,
        params,
        request.keyframesByParam,
        time,
        this.width,
        this.height,
        request.color,
        request.audioAnalysis ?? null,
        request.audioMappings ?? [],
      );
      return {
        fractalId,
        uniforms,
        waveform: fractalId === "feast" && request.audioAnalysis ? waveformWindowAt(request.audioAnalysis, time) : undefined,
        spectrum: fractalId === "bars" && request.audioAnalysis ? spectrumWindowAt(request.audioAnalysis, time) : undefined,
      };
    };
    const layerA = buildLayer(request.fractalId, request.params);
    const layerB = request.layerB ? buildLayer(request.layerB.fractalId, request.layerB.params) : null;
    this.renderer.renderComposite(layerA, layerB);
    // Unlike the live loop (fire-and-forget, next frame at display refresh
    // rate), an export frame must be fully complete before we read it back
    // or move on — that's what makes the sequence deterministic.
    await this.renderer.waitForGPU();

    const blob = await this.canvas.convertToBlob({ type: "image/png" });
    return new Uint8Array(await blob.arrayBuffer());
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
