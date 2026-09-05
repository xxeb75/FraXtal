import type { InterpolationType } from "../../types/project";

/**
 * Eases a normalized progress value t ∈ [0, 1]. Pure math, no dependency on
 * keyframes or time — Track.ts calls this once it has already reduced a
 * (time, keyframe pair) down to a local t.
 */
export function applyEasing(t: number, type: InterpolationType): number {
  const clamped = Math.min(1, Math.max(0, t));
  switch (type) {
    case "linear":
      return clamped;
    case "easeIn":
      return clamped * clamped;
    case "easeOut":
      return 1 - (1 - clamped) * (1 - clamped);
    case "easeInOut":
      return clamped < 0.5 ? 2 * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
    case "smooth":
      // Smoothstep: zero velocity at both ends, the "cinematic" default.
      return clamped * clamped * (3 - 2 * clamped);
    case "exponential":
      return clamped === 0 ? 0 : Math.pow(2, 10 * (clamped - 1));
    default:
      return clamped;
  }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
