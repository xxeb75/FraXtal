// Feast: not a fractal — a generative, audio-reactive visual meant to be
// projected at a party, not stared at up close for detail. A layered
// sine-wave "plasma" field plus a handful of pulsating glow blobs, both
// driven by real elapsed time and warped by whatever the audio mappings
// are pushing through the same camera/fractal-param uniforms every other
// mode uses — so the existing "Bass → Zoom" style mappings still do
// something meaningful here instead of needing a parallel system.
//
// Fully standalone (its own vs_main/fs_main/Uniforms/palette, not
// concatenated with common.wgsl — see ShaderManager.ts) so nothing here can
// affect the escape-time fractals, and vice versa. The Uniforms struct's
// layout must still match common.wgsl's byte-for-byte: WebGPURenderer
// writes one fixed-size buffer regardless of which pipeline is bound.
// Several fields are repurposed for a generative field having no natural
// "iterations" or "Julia constant" of its own:
//   center        → a slow pan offset over the field
//   zoomRotation  → overall scale and spin of the whole pattern
//   iterBailout.x → plasma layer count ("Iterations" slider)
//   iterBailout.y → wave frequency ("Bailout" slider)
//   c             → a secondary flow offset ("C Real"/"C Imaginary" — unused
//                   here since Feast has no params exposing them, kept only
//                   so the uniform layout stays identical)
//   power         → warp/distortion strength

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

// The actual decoded waveform around the current playback instant — a real
// oscilloscope trace of the music, not a synthesized stand-in for one (see
// AudioAnalyzer.ts's waveform/waveformWindowAt). Size must match
// WebGPURenderer's WAVEFORM_SAMPLE_COUNT and AudioAnalyzer.ts's
// WAVEFORM_SAMPLES_PER_FRAME.
@group(0) @binding(1) var<storage, read> waveform: array<f32, 64>;

fn sampleWaveform(x: f32) -> f32 {
  let count = 64.0;
  let pos = clamp(x, 0.0, 0.999) * count;
  let i0 = u32(floor(pos));
  let i1 = min(i0 + 1u, 63u);
  return mix(waveform[i0], waveform[i1], fract(pos));
}

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

// Same cosine-palette formula and family presets as common.wgsl's — kept as
// its own copy (see the file header) rather than shared, so a swatch picked
// in the UI looks like "the same palette" in both modes without coupling
// the two shader modules together.
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

  // Same zoom/rotation knobs the fractal modes expose (and the same audio
  // mappings — "Bass → Zoom" etc — already target), scaling and spinning
  // the whole field instead of a camera over a fixed set.
  let zoom = max(u.zoomRotation.x, 0.05);
  let rot = u.zoomRotation.y;
  let s = sin(rot);
  let cr = cos(rot);
  p = vec2<f32>(p.x * cr - p.y * s, p.x * s + p.y * cr) / zoom;
  p = p + u.center * 0.3;

  let freq = 1.6 + u.iterBailout.y * 0.35;
  let distortion = 0.2 + u.power * 0.3;
  let layers = clamp(u.iterBailout.x * 0.015 + 2.0, 2.0, 9.0);
  let t = u.time;

  var field = 0.0;
  var amp = 1.0;
  var freqScale = 1.0;
  var pp = p + u.c * 0.3;

  var i = 0.0;
  loop {
    if (i >= layers) {
      break;
    }
    let a = pp.x * freq * freqScale + t * (0.6 + i * 0.12);
    let bb = pp.y * freq * freqScale - t * (0.5 + i * 0.09);
    field += amp * sin(a + distortion * sin(bb));
    pp = vec2<f32>(pp.x * cos(0.6) - pp.y * sin(0.6), pp.x * sin(0.6) + pp.y * cos(0.6));
    amp = amp * 0.62;
    freqScale = freqScale * 1.33;
    i = i + 1.0;
  }

  // A handful of pulsating glow blobs orbiting on top of the plasma field —
  // seeded from paletteSeed, so re-rolling the palette also reshuffles
  // where they sit.
  var glow = 0.0;
  var bi = 0.0;
  loop {
    if (bi >= 5.0) {
      break;
    }
    let seed = u.paletteSeed * 7.0 + bi * 3.1;
    let orbitSpeed = 0.25 + hash(seed + 0.61) * 0.35;
    let orbitRadius = 0.35 + hash(seed + 0.19) * 0.25;
    let phase = hash(seed) * 6.28318530718;
    let center = vec2<f32>(
      orbitRadius * cos(t * orbitSpeed + phase + bi),
      orbitRadius * sin(t * orbitSpeed * 1.3 + phase - bi),
    );
    let d = length(p - center);
    let r = 0.05 + 0.09 * (0.5 + 0.5 * sin(t * 1.8 + bi * 2.1));
    glow += r / (d + 0.015);
    bi = bi + 1.0;
  }
  glow = glow * 0.05;

  let colorT = field * 0.16 + glow + u.paletteOffset;
  var col = palette(colorT, u.paletteId);
  col = pow(max(col, vec3<f32>(0.0)), vec3<f32>(1.0 / max(u.gamma, 0.0001)));
  col = (col - vec3<f32>(0.5)) * u.contrast + vec3<f32>(0.5);
  col = col * u.brightness * (0.75 + glow * 0.5);

  // The oscilloscope trace itself, laid on top of everything else — real
  // phosphor traces read as pure bright lines cutting across the image
  // regardless of what's behind them, so this is additive glow rather than
  // blended color. distortion (power, already audio-mapped to treble) sets
  // how tall the trace swings.
  let scopeSample = sampleWaveform(in.uv.x);
  let scopeAmp = 0.22 + u.power * 0.035;
  let scopeCenter = 0.5 + scopeSample * scopeAmp;
  let distToLine = abs(in.uv.y - scopeCenter);
  let scopeGlow = 0.006 / (distToLine + 0.0018);
  col = col + vec3<f32>(scopeGlow) * (0.5 + u.brightness * 0.5);

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
