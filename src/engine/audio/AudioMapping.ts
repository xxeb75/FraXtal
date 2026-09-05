import type { AudioAnalysis, AudioBand } from "./AudioAnalyzer";
import { audioValueAt } from "./AudioAnalyzer";

/** "Bass → Zoom, Amount: 0.35" (spec §14) — one row of the reactive mapping. */
export interface AudioMapping {
  id: string;
  source: AudioBand;
  /** Qualified param id, same scheme as keyframes: "camera.zoom", "julia.cReal", "color.brightness". */
  targetParamId: string;
  amount: number;
}

export const AUDIO_BAND_LABELS: Record<AudioBand, string> = {
  bass: "Bass",
  mid: "Mid",
  treble: "Treble",
  amplitude: "Volume",
};

/**
 * Additive modulation offset for one target at time t: sums every mapping
 * that targets it, each scaled by its own amount. Zero mappings (or no
 * analysis loaded) → zero offset, so audio is a pure add-on that never
 * changes behavior when unused.
 */
export function audioOffsetFor(
  targetParamId: string,
  analysis: AudioAnalysis | null,
  mappings: AudioMapping[],
  time: number,
): number {
  if (!analysis || mappings.length === 0) return 0;
  let offset = 0;
  for (const m of mappings) {
    if (m.targetParamId !== targetParamId) continue;
    offset += audioValueAt(analysis, m.source, time) * m.amount;
  }
  return offset;
}
