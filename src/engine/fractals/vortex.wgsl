// Vortex: a kaleidoscope-mirrored infinite tunnel. Screen space is folded
// into N symmetric wedges around the center (the classic kaleidoscope
// trick — mirror the angle, not the whole image), then raced along its own
// radius toward the viewer for the "flying down a tunnel" rush, colored by
// the same palette every mode shares. Standalone (own vs_main/fs_main/
// Uniforms, not concatenated with common.wgsl — see feast.wgsl's header for
// why) but unlike Feast needs no extra binding: everything here comes from
// the same plain uniform buffer the escape-time fractals use, so it slots
// into WebGPURenderer without any pipeline-layout branching of its own.
//
// Repurposed uniform fields (registry.ts relabels the sliders to match):
//   iterBailout.x → mirror segment count ("Segments")
//   iterBailout.y → tunnel rush speed ("Speed")
//   power         → spiral twist amount ("Twist")

struct Uniforms {
  resolution: vec2<f32>,
  center: vec2<f32>,
  zoomRotation: vec2<f32>,
  iterBailout: vec2<f32>,
  c: vec2<f32>,
  power: f32,
  paletteId: f32,
  paletteOffset: f32,
  paletteScale: f32,
  brightness: f32,
  contrast: f32,
  gamma: f32,
  paletteSeed: f32,
  time: f32,
  _pad: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;

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

fn hash(seed: f32) -> f32 {
  return fract(sin(seed * 12.9898) * 43758.5453);
}

fn paletteColor(t: f32, pid: i32) -> vec3<f32> {
  var a = vec3<f32>(0.25, 0.35, 0.35);
  var b = vec3<f32>(0.35, 0.45, 0.45);
  var c = vec3<f32>(1.0, 1.0, 1.0);
  var d = vec3<f32>(0.55, 0.58, 0.6);

  if (pid == 1) {
    a = vec3<f32>(0.55, 0.35, 0.2);
    b = vec3<f32>(0.5, 0.4, 0.3);
    c = vec3<f32>(1.0, 0.8, 0.6);
    d = vec3<f32>(0.0, 0.1, 0.2);
  } else if (pid == 2) {
    a = vec3<f32>(0.2, 0.4, 0.55);
    b = vec3<f32>(0.2, 0.35, 0.5);
    c = vec3<f32>(1.0, 0.9, 0.8);
    d = vec3<f32>(0.5, 0.55, 0.6);
  } else if (pid == 3) {
    a = vec3<f32>(0.4, 0.55, 0.2);
    b = vec3<f32>(0.4, 0.5, 0.2);
    c = vec3<f32>(1.2, 1.0, 0.6);
    d = vec3<f32>(0.3, 0.4, 0.1);
  } else if (pid == 4) {
    a = vec3<f32>(0.5, 0.5, 0.5);
    b = vec3<f32>(0.6, 0.4, 0.7);
    c = vec3<f32>(1.0, 1.0, 1.5);
    d = vec3<f32>(0.8, 0.4, 0.2);
  } else if (pid == 5) {
    a = vec3<f32>(0.5, 0.5, 0.5);
    b = vec3<f32>(0.5, 0.5, 0.5);
    c = vec3<f32>(1.0, 1.0, 1.0);
    d = vec3<f32>(0.0, 0.0, 0.0);
  } else if (pid == 6) {
    let s = u.paletteSeed;
    a = vec3<f32>(hash(s + 1.0), hash(s + 2.0), hash(s + 3.0)) * 0.4 + 0.3;
    b = vec3<f32>(hash(s + 4.0), hash(s + 5.0), hash(s + 6.0)) * 0.4 + 0.3;
    c = vec3<f32>(hash(s + 7.0), hash(s + 8.0), hash(s + 9.0)) * 1.5 + 0.5;
    d = vec3<f32>(hash(s + 10.0), hash(s + 11.0), hash(s + 12.0));
  }

  return a + b * cos(6.28318530718 * (c * t + d));
}

fn palette(t: f32, id: f32) -> vec3<f32> {
  let id0 = floor(id);
  let blend = id - id0;
  let c0 = paletteColor(t, i32(id0));
  let c1 = paletteColor(t, i32(id0) + 1);
  return mix(c0, c1, blend);
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  let aspect = u.resolution.x / u.resolution.y;
  var p = (in.uv - vec2<f32>(0.5, 0.5)) * vec2<f32>(aspect, 1.0);

  let zoom = max(u.zoomRotation.x, 0.05);
  p = p / zoom + u.center * 0.15;

  let radius = length(p) + 0.0001;
  var angle = atan2(p.y, p.x) + u.zoomRotation.y;

  // Kaleidoscope fold: mirror the angle into `segments` symmetric wedges.
  // Explicit modulo (a - n*floor(a/n)) rather than the `%` operator, so
  // this doesn't depend on how a given WGSL implementation handles it for
  // floats.
  let segments = clamp(round(u.iterBailout.x * 0.02), 3.0, 24.0);
  let wedge = 6.28318530718 / segments;
  let folded = angle - wedge * floor(angle / wedge);
  angle = abs(folded - wedge * 0.5);

  // Twist: a radius-dependent angular offset turns straight mirror seams
  // into a spiral, so the tunnel corkscrews instead of just receding.
  let twist = (u.power - 2.0) * 0.6;
  angle = angle + twist * log(radius + 1.0);

  let speed = 0.4 + u.iterBailout.y * 0.12;
  let depth = 1.0 / radius - u.time * speed;

  let rings = sin(depth * 6.0) * 0.5 + 0.5;
  let spokes = sin(angle * segments * 1.5) * 0.5 + 0.5;

  let t = rings * 0.6 + spokes * 0.4 + u.paletteOffset;
  var col = palette(t, u.paletteId);

  // The wedge seam itself reads as a bright dividing line — part of what
  // sells "cut from mirrors" instead of just a repeated texture — and a
  // vignette keeps the very center (radius → 0, where 1/radius blows up)
  // and the far edges from ever fully blowing out.
  let seam = smoothstep(0.06, 0.0, angle);
  col = col + vec3<f32>(seam * 0.6);
  let vignette = smoothstep(1.4, 0.15, radius);
  col = col * vignette;

  col = pow(max(col, vec3<f32>(0.0)), vec3<f32>(1.0 / max(u.gamma, 0.0001)));
  col = (col - vec3<f32>(0.5)) * u.contrast + vec3<f32>(0.5);
  col = col * u.brightness;
  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
