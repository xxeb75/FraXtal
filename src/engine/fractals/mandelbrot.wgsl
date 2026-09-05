// Mandelbrot: z(n+1) = z(n)^power + c, iterated from z(0) = 0. Smooth
// coloring uses the standard continuous escape-time formula so the palette
// doesn't band at low iteration counts.

fn fractalIterate(c: vec2<f32>, power: f32, bailout: f32, maxIter: u32) -> IterResult {
  var z = vec2<f32>(0.0, 0.0);
  let bailout2 = bailout * bailout;

  var result: IterResult;
  result.value = 0.0;
  result.escaped = 0.0;

  var i: u32 = 0u;
  loop {
    if (i >= maxIter) {
      break;
    }
    z = cPow(z, power) + c;
    let d2 = dot(z, z);
    if (d2 > bailout2) {
      let logZn = log(d2) * 0.5;
      let nu = log(logZn / log(2.0)) / log(2.0);
      result.value = f32(i) + 1.0 - nu;
      result.escaped = 1.0;
      break;
    }
    i = i + 1u;
  }

  // Didn't escape within maxIter — bounded/interior point. Carry the final
  // orbit magnitude out instead of leaving value at 0 for every interior
  // pixel alike; common.wgsl uses it to shade the interior instead of
  // flattening it to uniform black.
  if (result.escaped < 0.5) {
    result.value = dot(z, z);
  }

  return result;
}
