// Newton fractal for f(z) = z^3 - 1: z(n+1) = z(n) - f(z)/f'(z), iterated
// from z(0) = the pixel's complex coordinate. Unlike the escape-time
// fractals, every point converges to one of the three cube roots of unity
// (except a measure-zero set) — there's no "interior", so coloring comes
// from *which* root it converged to (basin) shaded by how fast it got there.

fn fractalIterate(c: vec2<f32>, power: f32, bailout: f32, maxIter: u32) -> IterResult {
  var z = c;
  let epsilon2 = 1e-12;

  var i: u32 = 0u;
  loop {
    if (i >= maxIter) {
      break;
    }
    let z2 = cMul(z, z);
    let fz = cMul(z2, z) - vec2<f32>(1.0, 0.0); // z^3 - 1
    let dfz = 3.0 * z2;                          // f'(z) = 3z^2
    let delta = cDiv(fz, dfz);
    z = z - delta;
    if (dot(delta, delta) < epsilon2) {
      break;
    }
    i = i + 1u;
  }

  // Which of the 3 roots (at angles 0°, 120°, 240°) z landed closest to.
  let twoPi = 6.28318530718;
  var angle = atan2(z.y, z.x);
  if (angle < 0.0) {
    angle = angle + twoPi;
  }
  let rootIndex = floor(angle / (twoPi / 3.0) + 0.5) % 3.0;

  var result: IterResult;
  result.escaped = 1.0; // always "escaped" — every basin gets colored, no black interior
  result.value = rootIndex * 8.0 + f32(i) * 0.15;
  return result;
}
