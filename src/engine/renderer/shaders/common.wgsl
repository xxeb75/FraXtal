// Shared prelude: uniforms, fullscreen-triangle vertex stage, complex-number
// helpers, palette, and the fragment entry point. Concatenated at build time
// (see ShaderManager.ts) with one fractal module that supplies fractalIterate().
// WGSL module-scope declarations are order-independent, so it doesn't matter
// whether this text lands before or after the fractal module.

struct Uniforms {
  resolution: vec2<f32>,
  center: vec2<f32>,
  zoomRotation: vec2<f32>,   // x: zoom, y: rotation (radians)
  iterBailout: vec2<f32>,    // x: max iterations, y: bailout radius
  c: vec2<f32>,              // Julia's fixed complex constant (unused by Mandelbrot)
  power: f32,
  paletteId: f32,
  paletteOffset: f32,
  paletteScale: f32,
  brightness: f32,
  contrast: f32,
  gamma: f32,
  paletteSeed: f32, // drives the "Random" palette's generated coefficients
  time: f32,        // seconds — unused by the escape-time fractals, but every
                     // mode shares this uniform layout (WebGPURenderer writes
                     // one fixed-size buffer regardless of which pipeline is
                     // active) and Feast (feast.wgsl) needs a real clock.
  _pad: f32,         // explicit padding to a 20-float/80-byte struct, spelled
                     // out rather than left to implicit alignment rules.
}

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VertexOut {
  // Fullscreen triangle, no vertex buffer: 3 clip-space points that cover
  // the viewport with no shared-edge seam.
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

fn cMul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

// a / b = a * conj(b) / |b|^2 — needed by root-finding fractals (Newton).
fn cDiv(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  let d = dot(b, b);
  return vec2<f32>(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / d;
}

// Integer complex power via repeated multiplication. `power` is rounded to
// the nearest integer >= 1; non-integer powers are a later refinement.
fn cPow(z: vec2<f32>, power: f32) -> vec2<f32> {
  let n = max(1, i32(round(power)));
  var result = z;
  for (var i = 1; i < n; i = i + 1) {
    result = cMul(result, z);
  }
  return result;
}

struct IterResult {
  value: f32,   // smooth iteration count (only meaningful if escaped == 1.0)
  escaped: f32, // 1.0 if the orbit escaped, 0.0 if it stayed bounded
}

// Cheap deterministic hash, f32 -> [0,1). Used only to generate the
// "Random" palette's coefficients from u.paletteSeed — not for anything
// requiring real random-number quality.
fn hash(seed: f32) -> f32 {
  return fract(sin(seed * 12.9898) * 43758.5453);
}

// Cosine-based palette (Inigo Quilez formula): a + b*cos(2π(c*t+d)). Each
// preset is just a coefficient row, so adding a palette never touches the
// fragment shader logic.
fn paletteColor(t: f32, pid: i32) -> vec3<f32> {
  // pid == 0 (or anything unmatched): monochrome (teal ramp, near-identical
  // phase per channel — brightness does the work, not hue cycling).
  var a = vec3<f32>(0.25, 0.35, 0.35);
  var b = vec3<f32>(0.35, 0.45, 0.45);
  var c = vec3<f32>(1.0, 1.0, 1.0);
  var d = vec3<f32>(0.55, 0.58, 0.6);

  if (pid == 1) {
    // fire
    a = vec3<f32>(0.55, 0.35, 0.2);
    b = vec3<f32>(0.5, 0.4, 0.3);
    c = vec3<f32>(1.0, 0.8, 0.6);
    d = vec3<f32>(0.0, 0.1, 0.2);
  } else if (pid == 2) {
    // ocean
    a = vec3<f32>(0.2, 0.4, 0.55);
    b = vec3<f32>(0.2, 0.35, 0.5);
    c = vec3<f32>(1.0, 0.9, 0.8);
    d = vec3<f32>(0.5, 0.55, 0.6);
  } else if (pid == 3) {
    // toxic
    a = vec3<f32>(0.4, 0.55, 0.2);
    b = vec3<f32>(0.4, 0.5, 0.2);
    c = vec3<f32>(1.2, 1.0, 0.6);
    d = vec3<f32>(0.3, 0.4, 0.1);
  } else if (pid == 4) {
    // neon
    a = vec3<f32>(0.5, 0.5, 0.5);
    b = vec3<f32>(0.6, 0.4, 0.7);
    c = vec3<f32>(1.0, 1.0, 1.5);
    d = vec3<f32>(0.8, 0.4, 0.2);
  } else if (pid == 5) {
    // grayscale
    a = vec3<f32>(0.5, 0.5, 0.5);
    b = vec3<f32>(0.5, 0.5, 0.5);
    c = vec3<f32>(1.0, 1.0, 1.0);
    d = vec3<f32>(0.0, 0.0, 0.0);
  } else if (pid == 6) {
    // random — a fresh coefficient set generated from u.paletteSeed. Re-roll
    // by changing the seed (the "Random" swatch does this on each click).
    let s = u.paletteSeed;
    a = vec3<f32>(hash(s + 1.0), hash(s + 2.0), hash(s + 3.0)) * 0.4 + 0.3;
    b = vec3<f32>(hash(s + 4.0), hash(s + 5.0), hash(s + 6.0)) * 0.4 + 0.3;
    c = vec3<f32>(hash(s + 7.0), hash(s + 8.0), hash(s + 9.0)) * 1.5 + 0.5;
    d = vec3<f32>(hash(s + 10.0), hash(s + 11.0), hash(s + 12.0));
  }

  return a + b * cos(6.28318530718 * (c * t + d));
}

// Animating `id` itself (not just t) morphs smoothly between two palette
// families — e.g. Fire (1.0) sliding into Ocean (2.0) crossfades every
// channel in between, rather than hard-cutting at the keyframe.
fn palette(t: f32, id: f32) -> vec3<f32> {
  let id0 = floor(id);
  let blend = id - id0;
  let c0 = paletteColor(t, i32(id0));
  let c1 = paletteColor(t, i32(id0) + 1);
  return mix(c0, c1, blend);
}

fn screenToComplex(uv: vec2<f32>) -> vec2<f32> {
  let aspect = u.resolution.x / u.resolution.y;
  let zoom = u.zoomRotation.x;
  let rotation = u.zoomRotation.y;
  let scale = 4.0 / zoom;

  var p = (uv - vec2<f32>(0.5, 0.5)) * vec2<f32>(aspect, 1.0) * scale;

  let s = sin(rotation);
  let cr = cos(rotation);
  p = vec2<f32>(p.x * cr - p.y * s, p.x * s + p.y * cr);

  return u.center + p;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  let c = screenToComplex(in.uv);
  let maxIter = u32(u.iterBailout.x);
  let bailout = u.iterBailout.y;

  let result = fractalIterate(c, u.power, bailout, maxIter);

  var col: vec3<f32>;
  if (result.escaped < 0.5) {
    // Bounded/interior points get a dim, palette-tinted shade instead of
    // flat black. With power/C pushed hard by audio reactivity, the whole
    // visible frame can momentarily land entirely inside the set — flat
    // black there reads as "the app broke", not "this is what the set
    // looks like right now". palette()'s cosine formula troughs near (and
    // clamps to) zero at some phases though, and a deep zoom can put most
    // of the visible interior at nearly the same orbit value — same phase
    // for every pixel at once — so scaling it down was still going fully
    // black sometimes. A fixed dark floor added underneath guarantees a
    // visible (if dim) color regardless of phase; the palette term on top
    // still gives it texture and keeps it tracking paletteOffset, i.e.
    // still moving with the music.
    let tIn = fract(result.value * 0.15 + u.paletteOffset * 0.5);
    col = vec3<f32>(0.03, 0.03, 0.05) + max(palette(tIn, u.paletteId), vec3<f32>(0.0)) * 0.25;
  } else {
    let t = result.value * u.paletteScale * 0.02 + u.paletteOffset;
    col = palette(t, u.paletteId);
  }
  col = pow(max(col, vec3<f32>(0.0)), vec3<f32>(1.0 / max(u.gamma, 0.0001)));
  col = (col - vec3<f32>(0.5)) * u.contrast + vec3<f32>(0.5);
  col = col * u.brightness;
  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
