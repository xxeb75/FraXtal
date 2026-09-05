import commonSrc from "./shaders/common.wgsl?raw";
import mandelbrotSrc from "../fractals/mandelbrot.wgsl?raw";
import juliaSrc from "../fractals/julia.wgsl?raw";
import burningShipSrc from "../fractals/burningShip.wgsl?raw";
import newtonSrc from "../fractals/newton.wgsl?raw";
import feastSrc from "../fractals/feast.wgsl?raw";
import vortexSrc from "../fractals/vortex.wgsl?raw";
import barsSrc from "../fractals/bars.wgsl?raw";

// Fractal-specific WGSL modules, each defining fractalIterate(). Registering
// a new fractal here (plus its .wgsl file) is the only step needed to make
// it renderable — WebGPURenderer and common.wgsl never change.
const FRACTAL_SHADER_SOURCES: Record<string, string> = {
  mandelbrot: mandelbrotSrc,
  julia: juliaSrc,
  "burning-ship": burningShipSrc,
  newton: newtonSrc,
};

// "Feast" isn't an escape-time fractal — it supplies its own complete
// vs_main/fs_main/Uniforms (see feast.wgsl's header) instead of a
// fractalIterate() to plug into common.wgsl's shared fs_main, so it's kept
// out of concatenation entirely rather than forced into that shape.
const STANDALONE_SHADER_SOURCES: Record<string, string> = {
  feast: feastSrc,
  vortex: vortexSrc,
  bars: barsSrc,
};

export function buildShaderSource(fractalId: string): string {
  const standalone = STANDALONE_SHADER_SOURCES[fractalId];
  if (standalone) return standalone;

  const fractalSrc = FRACTAL_SHADER_SOURCES[fractalId];
  if (!fractalSrc) {
    throw new Error(`No shader registered for fractal "${fractalId}"`);
  }
  // WGSL module-scope declarations are order-independent, so simple
  // concatenation is enough to let fs_main (in commonSrc) call the
  // fractal's fractalIterate().
  return `${fractalSrc}\n${commonSrc}`;
}
