/**
 * mulberry32 — a small, fast, seeded PRNG. Deterministic: the same seed
 * always produces the same sequence, which is what makes RANDOMIZE
 * reproducible (spec §11 — two compositions with the same seed must match).
 * Not cryptographic; doesn't need to be for generating fractal parameters.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}
