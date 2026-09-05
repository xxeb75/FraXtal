import type { Keyframe } from "../../types/project";
import { Track } from "./Track";

/**
 * Owns every parameter's keyframe track and answers "what is parameter X
 * worth at time T?" — nothing else. Framework-free by design: the timeline
 * UI (Phase 9) writes keyframes into it, the live viewport (Phase 10) reads
 * from it every frame, and the offline exporter (Phase 15) will read from
 * the exact same instance frame-by-frame. Preview and final render can only
 * stay identical if both paths call the same evaluate().
 *
 * A parameter with no keyframes simply isn't animated — evaluate() returns
 * the caller-supplied fallback (its current static value) in that case, so
 * turning animation on/off for a parameter is just adding/clearing its track.
 */
export class AnimationEngine {
  private tracks = new Map<string, Track>();

  private getOrCreateTrack(parameterId: string): Track {
    let track = this.tracks.get(parameterId);
    if (!track) {
      track = new Track();
      this.tracks.set(parameterId, track);
    }
    return track;
  }

  setKeyframes(parameterId: string, keyframes: Keyframe[]): void {
    this.getOrCreateTrack(parameterId).setKeyframes(keyframes);
  }

  getKeyframes(parameterId: string): Keyframe[] {
    return this.tracks.get(parameterId)?.getKeyframes() ?? [];
  }

  addKeyframe(parameterId: string, keyframe: Keyframe): void {
    this.getOrCreateTrack(parameterId).addKeyframe(keyframe);
  }

  removeKeyframe(parameterId: string, time: number): void {
    this.tracks.get(parameterId)?.removeKeyframe(time);
  }

  clearTrack(parameterId: string): void {
    this.tracks.delete(parameterId);
  }

  isAnimated(parameterId: string): boolean {
    const track = this.tracks.get(parameterId);
    return !!track && !track.isEmpty();
  }

  /** Value of `parameterId` at `time`, or `fallback` if it isn't animated. */
  evaluate(parameterId: string, time: number, fallback: number): number {
    const track = this.tracks.get(parameterId);
    if (!track || track.isEmpty()) return fallback;
    return track.evaluate(time);
  }

  /**
   * Evaluates a whole set of parameters at once — the shape a render frame
   * actually needs. `fallbacks` supplies the current static value for every
   * parameter id, animated or not, so the result always has every key.
   */
  evaluateAll(fallbacks: Record<string, number>, time: number): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [parameterId, fallback] of Object.entries(fallbacks)) {
      result[parameterId] = this.evaluate(parameterId, time, fallback);
    }
    return result;
  }
}
