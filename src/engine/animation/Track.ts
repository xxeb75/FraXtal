import type { Keyframe } from "../../types/project";
import { applyEasing, lerp } from "./Interpolation";

/**
 * One parameter's full set of keyframes, always kept time-sorted. The
 * interpolation type stored on a keyframe describes how the animation
 * eases *into* that keyframe from the previous one — a common convention
 * (matches After Effects/Figma-style timelines) that keeps "ease in" read
 * naturally at the keyframe it's set on.
 */
export class Track {
  private keyframes: Keyframe[] = [];

  setKeyframes(keyframes: Keyframe[]): void {
    this.keyframes = [...keyframes].sort((a, b) => a.time - b.time);
  }

  getKeyframes(): Keyframe[] {
    return [...this.keyframes];
  }

  addKeyframe(keyframe: Keyframe): void {
    const withoutSameTime = this.keyframes.filter((k) => k.time !== keyframe.time);
    this.keyframes = [...withoutSameTime, keyframe].sort((a, b) => a.time - b.time);
  }

  removeKeyframe(time: number): void {
    this.keyframes = this.keyframes.filter((k) => k.time !== time);
  }

  isEmpty(): boolean {
    return this.keyframes.length === 0;
  }

  /** Value at `time`, holding the nearest edge keyframe outside the track's range. */
  evaluate(time: number): number {
    const kfs = this.keyframes;
    if (kfs.length === 0) {
      throw new Error("Track.evaluate() called with no keyframes — check isEmpty() first.");
    }
    if (kfs.length === 1 || time <= kfs[0].time) return kfs[0].value;
    if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;

    // Find the pair [a, b] straddling `time`. Tracks are typically small
    // (dozens of keyframes at most), so a linear scan is simpler and fast
    // enough — no need for a binary search here.
    let i = 0;
    while (i < kfs.length - 1 && kfs[i + 1].time < time) i++;
    const a = kfs[i];
    const b = kfs[i + 1];

    const span = b.time - a.time;
    const localT = span === 0 ? 1 : (time - a.time) / span;
    const easedT = applyEasing(localT, b.interpolation);
    return lerp(a.value, b.value, easedT);
  }
}

/**
 * Value of `keyframes` at `time`, or `fallback` if the list is empty.
 * A stateless convenience over Track for callers (store actions, the live
 * render loop) that just want one evaluation without holding a Track
 * instance — cheap since tracks are small (dozens of keyframes at most).
 */
export function evaluateKeyframes(keyframes: Keyframe[], time: number, fallback: number): number {
  if (keyframes.length === 0) return fallback;
  const track = new Track();
  track.setKeyframes(keyframes);
  return track.evaluate(time);
}
