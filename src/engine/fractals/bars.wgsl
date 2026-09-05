// Bars: a psychedelic equalizer, driven by the real (log-binned) frequency
// spectrum — see AudioAnalyzer.ts's spectrum/spectrumWindowAt. "Fake 3D" is
// exactly that: no camera/perspective matrix, just two well-worn cheap
// tricks that read as depth instantly — a mirrored, distance-faded floor
// reflection below the bars, and bars shrinking toward the screen edges
// like a wall curving away from the viewer. Behind all of that, jagged
// electric bolts (boltGlow) burst from the horizon's center and jump
// between neighboring bar tips, plus a scatter of twinkling particles — the
// "electric light show" backdrop the bars sit in front of, rather than a
// flat black void. Standalone (own vs_main/fs_main/Uniforms, not
// concatenated with common.wgsl — see feast.wgsl's header for why) and
// needs its own extra binding (like Feast's waveform, but for the spectrum
// instead), so WebGPURenderer gives it a third bind-group layout alongside
// the escape-time fractals' and Feast's.
//
// Repurposed uniform fields (registry.ts relabels the sliders to match):
//   iterBailout.x → number of bars ("Bars")
//   iterBailout.y → reflection strength ("Reflection")
//   power         → edge perspective curve amount ("Curve")

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

// The real log-binned frequency spectrum around the current playback
// instant (AudioAnalyzer.ts's spectrum/spectrumWindowAt) — each bar's
// height comes from an actual FFT bin, not a synthesized stand-in. Size
// must match WebGPURenderer's SPECTRUM_BIN_COUNT and AudioAnalyzer.ts's
// SPECTRUM_BINS_PER_FRAME.
@group(0) @binding(1) var<storage, read> spectrum: array<f32, 32>;

const HORIZON: f32 = 0.55;

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

fn hash2(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453);
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

// A cheap lightning bolt: project the pixel onto segment a→b, then displace
// that projected point sideways by layered noise (coarse wander + fine
// jitter), tapered to zero at both ends so the bolt is anchored exactly at
// a and b instead of drifting off them. Distance from the pixel to that
// displaced point drives the glow — the same "distance-to-a-noisy-curve"
// trick behind most lightning shaders, cheap enough for a full-screen pass
// since it needs no marching, just one displaced point per pixel per bolt.
fn boltGlow(uv: vec2<f32>, a: vec2<f32>, b: vec2<f32>, seed: f32, t: f32) -> f32 {
  let ab = b - a;
  let abLen = length(ab) + 0.0001;
  let dir = ab / abLen;
  let perp = vec2<f32>(-dir.y, dir.x);

  let proj = clamp(dot(uv - a, dir), 0.0, abLen);
  let tt = proj / abLen;
  let taper = sin(tt * 3.14159265);

  let n1 = (hash2(vec2<f32>(tt * 5.0 + seed, floor(t * 6.0) + seed)) - 0.5) * 0.06;
  let n2 = (hash2(vec2<f32>(tt * 23.0 + seed * 3.1, floor(t * 30.0) + seed)) - 0.5) * 0.02;
  let offset = (n1 + n2) * taper;

  let boltPoint = a + dir * proj + perp * offset * abLen;
  let dist = length(uv - boltPoint);

  // Flickers on/off per-bolt on a slow clock instead of glowing steadily —
  // real electric arcs stutter, they don't hum at a constant brightness.
  let flicker = step(0.35, hash2(vec2<f32>(seed * 7.0, floor(t * 8.0))));
  return flicker * (0.012 / (dist + 0.0025));
}

// Same bar-height math fs_main uses for its own column, factored out so
// bolts can jump between two *other* bars' tips (chain-lightning across
// the row) without duplicating the logic out of sync.
fn barTipAt(i: f32, barCount: f32, curveAmount: f32) -> vec2<f32> {
  let bx = (i + 0.5) / barCount;
  let centerDist = abs(bx - 0.5) * 2.0;
  let edgeScale = 1.0 - centerDist * (0.35 + curveAmount * 0.4);
  let idx = u32(clamp(floor((i / barCount) * 32.0), 0.0, 31.0));
  let energy = spectrum[idx];
  let barHeight = (energy * 0.4 + 0.03) * edgeScale;
  return vec2<f32>(bx, HORIZON + barHeight);
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  let barCount = clamp(round(u.iterBailout.x * 0.08), 8.0, 40.0);
  let horizon = HORIZON;
  let x = in.uv.x;

  let barIndexF = floor(x * barCount);
  let barLocalX = fract(x * barCount);
  let spectrumIdx = u32(clamp(floor((barIndexF / barCount) * 32.0), 0.0, 31.0));
  let energy = spectrum[spectrumIdx];

  // "Curve": bars nearer the edges are pushed shorter and pulled slightly
  // inward, as if the whole row were a wall curving away from the viewer —
  // the one genuinely perspective-flavored trick here, everything else is
  // a flat 2D bar plus the floor-reflection illusion below.
  let centerDist = abs(x - 0.5) * 2.0;
  let curveAmount = clamp(u.power - 2.0, 0.0, 6.0) / 6.0;
  let edgeScale = 1.0 - centerDist * (0.35 + curveAmount * 0.4);

  let barHeight = (energy * 0.4 + 0.03) * edgeScale;
  let gap = barLocalX > 0.1 && barLocalX < 0.9;

  let aboveHorizon = in.uv.y > horizon;
  let distAbove = in.uv.y - horizon;
  let insideBar = aboveHorizon && gap && distAbove < barHeight;

  let reflectionStrength = clamp(u.iterBailout.y / 50.0, 0.0, 1.0);
  let distBelow = horizon - in.uv.y;
  let reflectionFade = clamp(1.0 - distBelow / 0.4, 0.0, 1.0) * reflectionStrength;
  let insideReflection = !aboveHorizon && gap && distBelow < barHeight;

  let barT = barIndexF / barCount + u.paletteOffset;
  let barColor = palette(barT, u.paletteId);

  // Near-black base with a soft glow band along the horizon line itself —
  // gives the floor something to catch even where no bar reaches it.
  var col = vec3<f32>(0.015, 0.015, 0.03);
  let horizonGlow = exp(-abs(in.uv.y - horizon) * 10.0) * 0.12;
  col = col + palette(u.paletteOffset, u.paletteId) * horizonGlow;

  // Electric: jagged bolts bursting from the horizon's center (replaces a
  // plain radial ray pattern — a clean ray reads as "light source", a
  // noise-displaced one reads as "spark"), plus a handful more jumping
  // chain-lightning-style between neighboring bar tips. Both flicker
  // on/off per-bolt rather than glowing steadily, and both drawn before
  // the bars so the bars still sit legibly on top of it.
  let rayCenter = vec2<f32>(0.5, horizon);
  var electric = 0.0;
  for (var i = 0; i < 7; i = i + 1) {
    let fi = f32(i);
    let ang = fi / 7.0 * 6.28318530718 + u.time * 0.15;
    let radius = 0.4 + hash(fi * 3.7) * 0.3;
    let endPoint = rayCenter + vec2<f32>(cos(ang), sin(ang)) * radius;
    electric = electric + boltGlow(in.uv, rayCenter, endPoint, fi * 13.7 + 1.0, u.time);
  }
  for (var k = 0; k < 5; k = k + 1) {
    let fk = f32(k);
    // Which bars link together changes every ~1.4s so it's not always the
    // same pair, and stays sparse (5 links) rather than chaining all of
    // them — barCount can reach 40, and lightning between every neighbor
    // would read as noise instead of a few standout sparks.
    let baseIdx = floor(hash(fk * 9.1 + floor(u.time * 0.7)) * barCount);
    let tipA = barTipAt(baseIdx, barCount, curveAmount);
    let tipB = barTipAt(min(baseIdx + 1.0, barCount - 1.0), barCount, curveAmount);
    electric = electric + boltGlow(in.uv, tipA, tipB, fk * 5.3 + 100.0, u.time);
  }
  col = col + vec3<f32>(0.55, 0.8, 1.0) * electric * (0.7 + u.brightness * 0.5);

  let cellUv = in.uv * 12.0;
  let cellId = floor(cellUv);
  let jitter = (vec2<f32>(hash2(cellId), hash2(cellId + vec2<f32>(5.5, 1.7))) - 0.5) * 0.6;
  let localUv = fract(cellUv) - 0.5 + jitter;
  let sparkleSeed = hash2(cellId + floor(u.time * 0.4));
  let sparkleLit = step(0.75, sparkleSeed);
  let twinkle = 0.5 + 0.5 * sin(u.time * 2.5 + sparkleSeed * 30.0);
  let sparkle = smoothstep(0.1, 0.0, length(localUv)) * sparkleLit * twinkle;
  col = col + vec3<f32>(1.0, 1.0, 1.0) * sparkle * (0.5 + u.brightness * 0.3);

  if (insideBar) {
    let tipGlow = smoothstep(barHeight - 0.02, barHeight, distAbove);
    col = mix(barColor, vec3<f32>(1.0), tipGlow * 0.7);
  } else if (insideReflection) {
    col = barColor * reflectionFade * 0.55;
  }

  col = pow(max(col, vec3<f32>(0.0)), vec3<f32>(1.0 / max(u.gamma, 0.0001)));
  col = (col - vec3<f32>(0.5)) * u.contrast + vec3<f32>(0.5);
  col = col * u.brightness;
  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
