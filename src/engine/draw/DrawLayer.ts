import { audioValueAt } from "../audio/AudioAnalyzer";
import type { AudioAnalysis } from "../audio/AudioAnalyzer";

// Freehand drawing that disintegrates to the beat (user request 2026-09-05):
// an overlay independent of the WebGPU fractal renderer entirely — plain 2D
// canvas drawing composited on top of whatever frame the fractal produced,
// live or exported. Every random-looking thing about a stroke (which way
// each point scatters, how fast) is rolled exactly once, the moment the
// stroke is finished (DrawCanvas.tsx), and stored as plain data on the
// point itself — resolveStroke() below is then a pure function of that
// stored data plus the current time, so scrubbing the timeline and the
// offline exporter can never draw a stroke differently than the live
// preview did (same contract as evaluateAnimatedFrame/resolveSequenceFrame
// elsewhere in this codebase).

/** A small, deliberately "electric" set (not the fractal PALETTE registry —
 * that's a whole gradient system for the fractal itself; this is six flat
 * swatches for a hand-drawn line) — FractalViewport.tsx's picker and the
 * store's default both read from this one list. */
export const DRAW_COLOR_PRESETS = ["#f97316", "#22d3ee", "#ec4899", "#facc15", "#a3e635", "#ffffff"];
export const DEFAULT_DRAW_COLOR = DRAW_COLOR_PRESETS[0];

export interface DrawPoint {
  /** Normalized viewport coordinates, 0..1 — resolution-independent so the
   * same stroke looks right whether it's previewed at window size or
   * exported at 4K. */
  x: number;
  y: number;
  /** Fixed "shatter" direction (not normalized to a unit vector — the raw
   * [-1,1] spread already gives enough variety) and speed, rolled once when
   * the point was captured. */
  shatterX: number;
  shatterY: number;
  shatterSpeed: number;
  /** A continuous small tremor on top of the kick-driven shatter — "more
   * electric, more alive" (user request 2026-09-05) even between hits, not
   * just a static line waiting for the next drum. Own phase and frequency
   * per point (both rolled once, like the shatter fields) so a stroke's
   * points don't all wobble in lockstep — that's what reads as arcing/
   * crackling rather than the whole line breathing as one rigid unit. */
  jitterPhase: number;
  jitterFreq: number;
}

export interface DrawStroke {
  id: string;
  points: DrawPoint[];
  color: string;
  /** Line width as a fraction of min(canvas width, height). */
  width: number;
  /** Timeline seconds (store's currentTime) at the moment the stroke was
   * finished — everything about its life (age, fade, shatter) is measured
   * from here, not wall-clock time, so it replays identically on export. */
  bornAt: number;
}

/** How long a finished stroke stays visible at all before fully fading —
 * past this it contributes nothing and can be dropped from the store. */
export const STROKE_LIFETIME_SECONDS = 10;
const SHATTER_AGE_RAMP_SECONDS = 0.25;
// "Plus fous" (2026-09-05 follow-up): a real punch, not a wobble — nearly
// double the original distance.
const SHATTER_DISTANCE = 0.09;
const SHATTER_FADE_AMOUNT = 0.6;
// The steady electric tremor (independent of the kick) plus how much harder
// it crackles on top of a hit.
const JITTER_AMPLITUDE = 0.006;
const JITTER_KICK_BOOST = 0.018;

export interface ResolvedDrawPoint {
  x: number;
  y: number;
  alpha: number;
}

/**
 * A stroke's rendered state at one instant: null once it's fully faded (or
 * hasn't been born yet — shouldn't happen for a stroke already in the
 * store, but scrubbing before its bornAt is a real case). Deliberately
 * stateless per-frame rather than accumulating scatter over time: the
 * scatter distance is `kickIntensity(t)` itself (scaled by how long the
 * stroke has existed), not an integral of every past hit — so a drum hit
 * visibly punches the curve outward and it settles back as the kick
 * envelope decays, reading as a pulse in time with the beat rather than a
 * one-way disintegration that only ever gets worse.
 */
export function resolveStroke(stroke: DrawStroke, time: number, kickIntensity: number): ResolvedDrawPoint[] | null {
  const age = time - stroke.bornAt;
  if (age < 0 || age >= STROKE_LIFETIME_SECONDS) return null;

  const baseOpacity = 1 - age / STROKE_LIFETIME_SECONDS;
  const ageRamp = Math.min(1, age / SHATTER_AGE_RAMP_SECONDS);
  const kick = Math.max(0, kickIntensity);
  const punch = kick * ageRamp;
  const alpha = Math.max(0, baseOpacity * (1 - kick * SHATTER_FADE_AMOUNT));
  const jitterAmount = (JITTER_AMPLITUDE + kick * JITTER_KICK_BOOST) * ageRamp;

  return stroke.points.map((p) => {
    const jx = Math.sin(time * p.jitterFreq + p.jitterPhase) * jitterAmount;
    const jy = Math.cos(time * p.jitterFreq * 1.3 + p.jitterPhase) * jitterAmount;
    return {
      x: p.x + p.shatterX * p.shatterSpeed * SHATTER_DISTANCE * punch + jx,
      y: p.y + p.shatterY * p.shatterSpeed * SHATTER_DISTANCE * punch + jy,
      alpha,
    };
  });
}

/** The subset of CanvasRenderingContext2D / OffscreenCanvasRenderingContext2D
 * this module actually uses — lets renderDrawLayer() take either one
 * without a DOM-lib-specific type, since the live overlay canvas and the
 * offline exporter's OffscreenCanvas satisfy the same shape. */
interface Canvas2DLike {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  stroke(): void;
  save(): void;
  restore(): void;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  globalAlpha: number;
  shadowBlur: number;
  shadowColor: string;
}

/** A neon-tube look: a soft wide halo, a tighter mid glow, then a bright
 * near-white core on top — the same "electric arc" trick as the layered
 * glow this session already used for Bars, just done in 2D canvas instead
 * of WGSL since this overlay never touches the fractal shader. */
const CORE_TINT = "#fff4e0";

/** One point per array entry, connected as a smooth curve (through-the-
 * midpoints technique: each raw point becomes a quadratic curve's control
 * point, its endpoint the midpoint to the next one) rather than straight
 * segments — "plus lisses" (2026-09-05 follow-up). Falls back to a single
 * line for a 2-point stroke, too short to need smoothing. */
function tracePath(ctx: Canvas2DLike, points: ResolvedDrawPoint[], width: number, height: number): void {
  ctx.beginPath();
  ctx.moveTo(points[0].x * width, points[0].y * height);
  if (points.length === 2) {
    ctx.lineTo(points[1].x * width, points[1].y * height);
    return;
  }
  for (let i = 1; i < points.length - 1; i++) {
    const cx = points[i].x * width;
    const cy = points[i].y * height;
    const midX = ((points[i].x + points[i + 1].x) / 2) * width;
    const midY = ((points[i].y + points[i + 1].y) / 2) * height;
    ctx.quadraticCurveTo(cx, cy, midX, midY);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x * width, last.y * height);
}

/**
 * Draws every still-alive stroke onto a 2D context at `time` — used
 * identically by the live viewport overlay (DrawCanvas.tsx, drawing onto a
 * transparent canvas over the fractal) and the offline exporter
 * (OfflineRenderer.ts, drawing onto a copy of the just-rendered fractal
 * frame before encoding), so a preview and the exported frame at the same
 * instant can never diverge. Does not clear the canvas itself — the two
 * callers have different ideas of what "underneath" already is (nothing vs.
 * the rendered fractal), so clearing/compositing that base is their job.
 */
export function renderDrawLayer(
  ctx: Canvas2DLike,
  strokes: DrawStroke[],
  time: number,
  audioAnalysis: AudioAnalysis | null,
  width: number,
  height: number,
): void {
  if (strokes.length === 0) return;
  const kickIntensity = audioAnalysis ? audioValueAt(audioAnalysis, "kick", time) : 0;
  const scale = Math.min(width, height);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    const resolved = resolveStroke(stroke, time, kickIntensity);
    if (!resolved || resolved.length < 2) continue;
    // Every point shares the same alpha at a given instant (resolveStroke's
    // fade/kick-dim terms are stroke-level, not per-point) — one uniform
    // value per stroke per frame, not something to blend across segments.
    const alpha = resolved[0].alpha;
    if (alpha <= 0.002) continue;

    const coreWidth = Math.max(1, stroke.width * scale);
    tracePath(ctx, resolved, width, height);

    // Outer halo — wide, soft, dim.
    ctx.strokeStyle = stroke.color;
    ctx.shadowColor = stroke.color;
    ctx.shadowBlur = coreWidth * 3;
    ctx.lineWidth = coreWidth * 5;
    ctx.globalAlpha = alpha * 0.28;
    ctx.stroke();

    // Mid glow — tighter, brighter.
    ctx.shadowBlur = coreWidth * 1.2;
    ctx.lineWidth = coreWidth * 2.2;
    ctx.globalAlpha = alpha * 0.55;
    ctx.stroke();

    // Core — crisp, near-white, the "hot" center of the arc.
    ctx.strokeStyle = CORE_TINT;
    ctx.shadowBlur = coreWidth * 0.6;
    ctx.lineWidth = coreWidth;
    ctx.globalAlpha = alpha;
    ctx.stroke();
  }
  ctx.restore();
}
