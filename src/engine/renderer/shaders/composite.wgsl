// Composites two independently-rendered layers (WebGPURenderer's
// renderComposite()) with a simple additive blend: every mode's background
// is near-black with bright emissive content on top (fractals' escaped
// glow, Feast's plasma, Vortex's arcs, Bars' equalizer), so adding two such
// images together behaves like overlaying two light sources — black adds
// nothing, bright content stacks — without needing real alpha compositing
// or a blend-mode picker.

@group(0) @binding(0) var texA: texture_2d<f32>;
@group(0) @binding(1) var texB: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

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
  return vec4<f32>(clamp(a + b, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
