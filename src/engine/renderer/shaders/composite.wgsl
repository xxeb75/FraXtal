// Composites two independently-rendered layers (WebGPURenderer's
// renderComposite()) in one of two modes, chosen by `blend.crossfade`:
//
// - crossfade < 0 (the manual "Layer B" checkbox, FractalSelector): simple
//   additive blend. Every mode's background is near-black with bright
//   emissive content on top (fractals' escaped glow, Feast's plasma,
//   Vortex's arcs, Bars' equalizer), so adding two such images together
//   behaves like overlaying two light sources — black adds nothing, bright
//   content stacks — without needing real alpha compositing.
// - crossfade in [0, 1] (scene-sequence transitions, engine/sequence/Sequence.ts):
//   a straight linear mix from A to B — a real dissolve between two whole
//   scenes that can be completely different fractals, not a stack of two.

@group(0) @binding(0) var texA: texture_2d<f32>;
@group(0) @binding(1) var texB: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

struct BlendParams {
  crossfade: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}
@group(0) @binding(3) var<uniform> blend: BlendParams;

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VertexOut {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  );
  var out: VertexOut;
  out.position = vec4<f32>(pos[idx], 0.0, 1.0);
  out.uv = pos[idx] * 0.5 + vec2<f32>(0.5, 0.5);
  return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  let a = textureSample(texA, samp, in.uv).rgb;
  let b = textureSample(texB, samp, in.uv).rgb;
  if (blend.crossfade < 0.0) {
    return vec4<f32>(clamp(a + b, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
  }
  return vec4<f32>(mix(a, b, clamp(blend.crossfade, 0.0, 1.0)), 1.0);
}
