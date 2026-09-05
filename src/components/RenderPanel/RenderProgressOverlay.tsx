import { cancelActiveRenderQueue } from "../../export/activeRenderQueue";
import { useEditorStore } from "../../store/editorStore";
import "./RenderProgressOverlay.css";

// Matches the cahier des charges mockup: RENDERING / Frame N / total / % /
// progress bar. Shown while an offline export (Phase 15) is running; the
// live viewport keeps working underneath (spec §17 — preview stays usable
// during a render).
export function RenderProgressOverlay() {
  const progress = useEditorStore((s) => s.renderProgress);
  if (!progress) return null;

  const pct = progress.totalFrames > 0 ? (progress.frame / progress.totalFrames) * 100 : 0;
  const isEncoding = progress.phase === "encoding";

  return (
    <div className="render-overlay">
      <div className="render-panel">
        <div className="render-title">{isEncoding ? "ENCODING VIDEO" : "RENDERING"}</div>
        <div className="render-frame-count">
          {isEncoding ? "Muxing frames + audio with ffmpeg…" : `Frame ${progress.frame} / ${progress.totalFrames}`}
        </div>
        <div className="render-bar-track">
          <div
            className={isEncoding ? "render-bar-fill render-bar-fill-indeterminate" : "render-bar-fill"}
            style={isEncoding ? undefined : { transform: `scaleX(${pct / 100})` }}
          />
        </div>
        {!isEncoding && <div className="render-pct">{pct.toFixed(1)}%</div>}
        {isEncoding && (
          <div className="render-pct render-pct-note">
            A long export can take several minutes here — this isn't stuck.
          </div>
        )}
        {!isEncoding && (
          <button className="render-cancel" onClick={cancelActiveRenderQueue}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
