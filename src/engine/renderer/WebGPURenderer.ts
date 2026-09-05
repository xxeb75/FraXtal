import { buildShaderSource } from "./ShaderManager";
import compositeSrc from "./shaders/composite.wgsl?raw";

/** One mode rendered at a given moment — everything renderComposite() needs
 * to draw a single layer, identical to what render() has always taken. */
export interface LayerRequest {
  fractalId: string;
  uniforms: RenderUniforms;
  waveform?: Float32Array;
  spectrum?: Float32Array;
}

/** Everything the shader needs for one frame. Plain data — no React, no store. */
export interface RenderUniforms {
  resolutionX: number;
  resolutionY: number;
  centerX: number;
  centerY: number;
  zoom: number;
  rotation: number;
  iterations: number;
  bailout: number;
  /** Julia's fixed complex constant. Ignored by fractals that don't use it (e.g. Mandelbrot). */
  cReal: number;
  cImag: number;
  power: number;
  paletteId: number;
  paletteOffset: number;
  paletteScale: number;
  brightness: number;
  contrast: number;
  gamma: number;
  paletteSeed: number;
  /** Seconds — unused by the escape-time fractals, driven by Feast's plasma/blob field. */
  time: number;
}

// Must match the float count of `struct Uniforms` in common.wgsl (20 floats = 80 bytes,
// the last being explicit padding — see that struct's comment).
const UNIFORM_FLOAT_COUNT = 20;

// Must match feast.wgsl's `array<f32, 64>` storage binding and
// AudioAnalyzer.ts's WAVEFORM_SAMPLES_PER_FRAME — three independent
// constants (WGSL can't import a JS one) kept in sync by convention, not
// by the compiler, since this is the one place a mismatch would actually
// matter (a wrong buffer size).
const WAVEFORM_SAMPLE_COUNT = 64;

// Same idea for bars.wgsl's `array<f32, 32>` spectrum binding and
// AudioAnalyzer.ts's SPECTRUM_BINS_PER_FRAME.
const SPECTRUM_BIN_COUNT = 32;

/**
 * Owns the WebGPU device, canvas context, and per-fractal render pipelines.
 * Independent of React: FractalViewport drives it from a render loop, and
 * the future offline exporter (Phase 15) will drive the same class headlessly.
 */
export class WebGPURenderer {
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat = "bgra8unorm";
  private bindGroupLayout: GPUBindGroupLayout | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private pipelines = new Map<string, GPURenderPipeline>();
  private uniformData = new Float32Array(UNIFORM_FLOAT_COUNT);
  // Feast (feast.wgsl) is the only mode that reads real waveform samples —
  // a second binding the escape-time fractals have no use for — so it gets
  // its own bind group layout/pipeline layout/bind group built on the same
  // uniform buffer plus one extra storage buffer, entirely alongside the
  // fractals' original single-binding layout above rather than changing it.
  private feastBindGroupLayout: GPUBindGroupLayout | null = null;
  private feastBindGroup: GPUBindGroup | null = null;
  private waveformBuffer: GPUBuffer | null = null;
  private waveformData = new Float32Array(WAVEFORM_SAMPLE_COUNT);
  // Same pattern again for Bars (bars.wgsl), which reads the frequency
  // spectrum instead of the waveform — its own layout/buffer/bind group,
  // not shared with Feast's, so a shader only ever declares the one binding
  // it actually uses.
  private barsBindGroupLayout: GPUBindGroupLayout | null = null;
  private barsBindGroup: GPUBindGroup | null = null;
  private spectrumBuffer: GPUBuffer | null = null;
  private spectrumData = new Float32Array(SPECTRUM_BIN_COUNT);

  // Two-layer compositing (renderComposite()): each layer renders to its
  // own offscreen texture with its own pipeline/bind group exactly like the
  // single-layer path, then a small composite pass adds the two together
  // onto the canvas. Textures are created lazily at the canvas's own size
  // and only when a second layer is actually requested — a single-layer
  // frame never touches any of this, so it costs nothing when unused.
  private layerTextureA: GPUTexture | null = null;
  private layerTextureB: GPUTexture | null = null;
  private layerSize: { width: number; height: number } = { width: 0, height: 0 };
  private compositePipeline: GPURenderPipeline | null = null;
  private compositeBindGroupLayout: GPUBindGroupLayout | null = null;
  private compositeSampler: GPUSampler | null = null;

  /** `canvas` may be an OffscreenCanvas — the offline exporter (Phase 15)
   * renders to one sized at the project's export resolution, entirely
   * independent of whatever size the live viewport's on-screen canvas is. */
  async init(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<void> {
    if (!navigator.gpu) {
      throw new Error("WebGPU is not supported in this environment.");
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No suitable GPU adapter found.");
    }
    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    if (!context) {
      throw new Error("Failed to acquire a WebGPU canvas context.");
    }

    this.device = device;
    this.context = context;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format: this.format, alphaMode: "opaque" });

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }],
    });

    this.uniformBuffer = device.createBuffer({
      label: "fractal-uniforms",
      size: UNIFORM_FLOAT_COUNT * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    this.feastBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
      ],
    });

    this.waveformBuffer = device.createBuffer({
      label: "feast-waveform",
      size: WAVEFORM_SAMPLE_COUNT * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.feastBindGroup = device.createBindGroup({
      layout: this.feastBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.waveformBuffer } },
      ],
    });

    this.barsBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
      ],
    });

    this.spectrumBuffer = device.createBuffer({
      label: "bars-spectrum",
      size: SPECTRUM_BIN_COUNT * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.barsBindGroup = device.createBindGroup({
      layout: this.barsBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.spectrumBuffer } },
      ],
    });

    this.compositeBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    this.compositeSampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
    const compositeModule = device.createShaderModule({ label: "composite-shader", code: compositeSrc });
    this.compositePipeline = device.createRenderPipeline({
      label: "composite-pipeline",
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.compositeBindGroupLayout] }),
      vertex: { module: compositeModule, entryPoint: "vs_main" },
      fragment: { module: compositeModule, entryPoint: "fs_main", targets: [{ format: this.format }] },
      primitive: { topology: "triangle-list" },
    });
  }

  private getPipeline(fractalId: string): GPURenderPipeline {
    const cached = this.pipelines.get(fractalId);
    if (cached) return cached;

    const device = this.device!;
    const module = device.createShaderModule({
      label: `${fractalId}-shader`,
      code: buildShaderSource(fractalId),
    });

    const layout =
      fractalId === "feast"
        ? this.feastBindGroupLayout!
        : fractalId === "bars"
          ? this.barsBindGroupLayout!
          : this.bindGroupLayout!;
    const pipeline = device.createRenderPipeline({
      label: `${fractalId}-pipeline`,
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      vertex: { module, entryPoint: "vs_main" },
      fragment: { module, entryPoint: "fs_main", targets: [{ format: this.format }] },
      primitive: { topology: "triangle-list" },
    });

    this.pipelines.set(fractalId, pipeline);
    return pipeline;
  }

  render(fractalId: string, uniforms: RenderUniforms, waveform?: Float32Array, spectrum?: Float32Array): void {
    const context = this.context;
    if (!context) return;
    this.renderToTarget(fractalId, uniforms, context.getCurrentTexture().createView(), waveform, spectrum);
  }

  /** The shared drawing logic behind both render() (straight to the canvas)
   * and renderComposite() (each layer into its own offscreen texture first)
   * — same pipeline lookup, same uniform/waveform/spectrum upload, only the
   * destination view differs. */
  private renderToTarget(
    fractalId: string,
    uniforms: RenderUniforms,
    targetView: GPUTextureView,
    waveform?: Float32Array,
    spectrum?: Float32Array,
  ): void {
    const device = this.device;
    if (!device) return;

    const pipeline = this.getPipeline(fractalId);
    const isFeast = fractalId === "feast";
    const isBars = fractalId === "bars";

    this.uniformData.set([
      uniforms.resolutionX,
      uniforms.resolutionY,
      uniforms.centerX,
      uniforms.centerY,
      uniforms.zoom,
      uniforms.rotation,
      uniforms.iterations,
      uniforms.bailout,
      uniforms.cReal,
      uniforms.cImag,
      uniforms.power,
      uniforms.paletteId,
      uniforms.paletteOffset,
      uniforms.paletteScale,
      uniforms.brightness,
      uniforms.contrast,
      uniforms.gamma,
      uniforms.paletteSeed,
      uniforms.time,
      // 20th float is explicit padding in the WGSL struct — left at 0.
    ]);
    device.queue.writeBuffer(this.uniformBuffer!, 0, this.uniformData);

    if (isFeast) {
      this.waveformData.fill(0);
      if (waveform) this.waveformData.set(waveform.subarray(0, WAVEFORM_SAMPLE_COUNT));
      device.queue.writeBuffer(this.waveformBuffer!, 0, this.waveformData);
    }
    if (isBars) {
      this.spectrumData.fill(0);
      if (spectrum) this.spectrumData.set(spectrum.subarray(0, SPECTRUM_BIN_COUNT));
      device.queue.writeBuffer(this.spectrumBuffer!, 0, this.spectrumData);
    }

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: targetView,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, isFeast ? this.feastBindGroup! : isBars ? this.barsBindGroup! : this.bindGroup!);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  /** (Re)creates the two offscreen layer textures at `width`x`height` if
   * they don't already match — cheap to call every frame, only actually
   * allocates on the first call or after a real resize. */
  private ensureLayerTextures(width: number, height: number): void {
    const device = this.device!;
    if (this.layerTextureA && this.layerSize.width === width && this.layerSize.height === height) return;

    this.layerTextureA?.destroy();
    this.layerTextureB?.destroy();
    const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    this.layerTextureA = device.createTexture({ label: "layer-a", size: { width, height }, format: this.format, usage });
    this.layerTextureB = device.createTexture({ label: "layer-b", size: { width, height }, format: this.format, usage });
    this.layerSize = { width, height };
  }

  /**
   * Renders one or two modes into the same frame — Feast behind Bars,
   * say — by drawing each into its own offscreen texture with its own
   * pipeline (unchanged from the single-layer path) and additively
   * blending the two together onto the canvas (composite.wgsl). With no
   * second layer this is exactly render() plus one redundant branch, so a
   * single-layer frame costs nothing extra.
   */
  renderComposite(layerA: LayerRequest, layerB: LayerRequest | null): void {
    const device = this.device;
    const context = this.context;
    if (!device || !context) return;

    if (!layerB) {
      this.render(layerA.fractalId, layerA.uniforms, layerA.waveform, layerA.spectrum);
      return;
    }

    const canvasTexture = context.getCurrentTexture();
    this.ensureLayerTextures(canvasTexture.width, canvasTexture.height);

    this.renderToTarget(layerA.fractalId, layerA.uniforms, this.layerTextureA!.createView(), layerA.waveform, layerA.spectrum);
    this.renderToTarget(layerB.fractalId, layerB.uniforms, this.layerTextureB!.createView(), layerB.waveform, layerB.spectrum);

    const compositeBindGroup = device.createBindGroup({
      layout: this.compositeBindGroupLayout!,
      entries: [
        { binding: 0, resource: this.layerTextureA!.createView() },
        { binding: 1, resource: this.layerTextureB!.createView() },
        { binding: 2, resource: this.compositeSampler! },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: canvasTexture.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(this.compositePipeline!);
    pass.setBindGroup(0, compositeBindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  /** Resolves once the GPU has actually finished the last submitted frame.
   * The live viewport never calls this (fire-and-forget keeps it at display
   * refresh rate); the offline exporter awaits it before reading pixels back,
   * so each exported frame is guaranteed complete before the next begins. */
  async waitForGPU(): Promise<void> {
    await this.device?.queue.onSubmittedWorkDone();
  }

  dispose(): void {
    this.uniformBuffer?.destroy();
    this.uniformBuffer = null;
    this.waveformBuffer?.destroy();
    this.waveformBuffer = null;
    this.spectrumBuffer?.destroy();
    this.spectrumBuffer = null;
    this.layerTextureA?.destroy();
    this.layerTextureA = null;
    this.layerTextureB?.destroy();
    this.layerTextureB = null;
    this.layerSize = { width: 0, height: 0 };
    this.pipelines.clear();
    this.device = null;
    this.context = null;
  }
}
