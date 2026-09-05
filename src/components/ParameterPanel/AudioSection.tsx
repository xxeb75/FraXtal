import { useState } from "react";
import { getFractalDefinition } from "../../engine/fractals/registry";
import { cameraParamKey, colorParamKey, fractalParamKey, paramDisplayLabel } from "../../engine/animation/paramKeys";
import { AUDIO_BAND_LABELS } from "../../engine/audio/AudioMapping";
import type { AudioMapping } from "../../engine/audio/AudioMapping";
import type { AudioBand } from "../../engine/audio/AudioAnalyzer";
import { loadLocalAudioFile, loadAudioFromUrl } from "../../engine/audio/loadAudio";
import { setActiveAudioBytes } from "../../engine/audio/activeAudioBytes";
import { useEditorStore } from "../../store/editorStore";

const AUDIO_BANDS: AudioBand[] = ["bass", "mid", "treble", "amplitude"];

/** Every quantity a mapping can drive: camera + the current fractal's own
 * animatable numbers + color — the same universe keyframes can already
 * target, so "audio-reactive" is just another way to move the same knobs. */
function audioTargets(fractalId: string): { id: string; label: string }[] {
  const camera = (["centerX", "centerY", "zoom", "rotation"] as const).map((f) => ({
    id: cameraParamKey(f),
    label: paramDisplayLabel(cameraParamKey(f)),
  }));
  const fractalParams = (getFractalDefinition(fractalId)?.parameters ?? [])
    .filter((p) => p.type === "number")
    .map((p) => ({ id: fractalParamKey(fractalId, p.id), label: paramDisplayLabel(fractalParamKey(fractalId, p.id)) }));
  const color = (["brightness", "contrast", "gamma", "paletteOffset", "paletteScale"] as const).map((f) => ({
    id: colorParamKey(f),
    label: paramDisplayLabel(colorParamKey(f)),
  }));
  return [...camera, ...fractalParams, ...color];
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function MappingRow({ mapping, targets }: { mapping: AudioMapping; targets: { id: string; label: string }[] }) {
  const updateAudioMapping = useEditorStore((s) => s.updateAudioMapping);
  const removeAudioMapping = useEditorStore((s) => s.removeAudioMapping);

  return (
    <div className="audio-mapping-row">
      <select
        className="audio-mapping-select"
        value={mapping.source}
        onChange={(e) => updateAudioMapping(mapping.id, { source: e.target.value as AudioBand })}
      >
        {AUDIO_BANDS.map((b) => (
          <option key={b} value={b}>
            {AUDIO_BAND_LABELS[b]}
          </option>
        ))}
      </select>
      <span className="audio-mapping-arrow">→</span>
      <select
        className="audio-mapping-select"
        value={mapping.targetParamId}
        onChange={(e) => updateAudioMapping(mapping.id, { targetParamId: e.target.value })}
      >
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      <input
        className="audio-mapping-amount"
        type="range"
        min={-2}
        max={2}
        step={0.01}
        value={mapping.amount}
        onChange={(e) => updateAudioMapping(mapping.id, { amount: Number(e.target.value) })}
        title={`Amount: ${mapping.amount.toFixed(2)}`}
      />
      <button className="audio-mapping-remove" onClick={() => removeAudioMapping(mapping.id)} aria-label="Remove mapping">
        ×
      </button>
    </div>
  );
}

// Spec §14, pulled forward per user priority: load a track (local file or a
// URL — YouTube via yt-dlp), analyze it into bass/mid/treble/amplitude time
// series, then map any of those onto any animatable param with an amount —
// "Bass → Zoom, Amount: 0.35". Purely additive on top of whatever keyframes
// already do, so it layers rather than fights hand-authored animation.
export function AudioSection() {
  const fractalId = useEditorStore((s) => s.selectedFractalId);
  const fileName = useEditorStore((s) => s.audioFileName);
  const analysis = useEditorStore((s) => s.audioAnalysis);
  const loading = useEditorStore((s) => s.audioLoading);
  const error = useEditorStore((s) => s.audioError);
  const mappings = useEditorStore((s) => s.audioMappings);
  const addAudioMapping = useEditorStore((s) => s.addAudioMapping);
  const clearAudio = useEditorStore((s) => s.clearAudio);

  const [url, setUrl] = useState("");
  const targets = audioTargets(fractalId);

  const handleAddMapping = () => {
    addAudioMapping({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      source: "bass",
      targetParamId: targets[0]?.id ?? cameraParamKey("zoom"),
      amount: 0.3,
    });
  };

  const handleLoadUrl = () => {
    if (!url.trim()) return;
    void loadAudioFromUrl(url.trim());
  };

  const handleClear = () => {
    setActiveAudioBytes(null);
    clearAudio();
  };

  return (
    <div className="audio-section">
      <div className="panel-title">AUDIO</div>

      {!fileName && (
        <>
          <button className="audio-load-button" onClick={() => void loadLocalAudioFile()} disabled={loading}>
            {loading ? "Analyzing…" : "Load File…"}
          </button>
          <div className="audio-url-row">
            <input
              className="audio-url-input"
              type="text"
              placeholder="Paste a YouTube (or other) link…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
            />
            <button className="audio-url-button" onClick={handleLoadUrl} disabled={loading || !url.trim()}>
              Load
            </button>
          </div>
          {error && <div className="audio-error">{error}</div>}
        </>
      )}

      {fileName && analysis && (
        <>
          <div className="audio-loaded-row">
            <span className="audio-file-name" title={fileName}>
              {fileName}
            </span>
            <span className="audio-duration">{formatDuration(analysis.duration)}</span>
            <button className="audio-clear-button" onClick={handleClear} title="Remove audio">
              ✕
            </button>
          </div>

          {mappings.map((m) => (
            <MappingRow key={m.id} mapping={m} targets={targets} />
          ))}

          <button className="audio-add-mapping" onClick={handleAddMapping}>
            + Add mapping
          </button>
        </>
      )}
    </div>
  );
}
