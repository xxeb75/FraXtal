import { useEditorStore } from "../../store/editorStore";
import "./StatusBar.css";

function formatTimecode(t: number, fps: number): string {
  const h = Math.floor(t / 3600).toString().padStart(2, "0");
  const m = Math.floor((t % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(t % 60).toString().padStart(2, "0");
  const f = Math.floor((t % 1) * fps).toString().padStart(2, "0");
  return `${h}:${m}:${s}.${f}`;
}

// Bottom transport bar: play control + timecode + render settings at a
// glance. Render progress (Phase 16) replaces this readout while exporting.
export function StatusBar() {
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const togglePlaying = useEditorStore((s) => s.togglePlaying);
  const currentTime = useEditorStore((s) => s.currentTime);
  const fps = useEditorStore((s) => s.fps);
  const resolution = useEditorStore((s) => s.resolution);
  const duration = useEditorStore((s) => s.duration);

  return (
    <div className="status-bar">
      <button className="play-button" onClick={togglePlaying}>
        {isPlaying ? "❚❚" : "▶"}
      </button>
      <span className="status-item timecode">{formatTimecode(currentTime, fps)}</span>
      <span className="status-item">{fps} FPS</span>
      <span className="status-item">
        {resolution[0]}×{resolution[1]}
      </span>
      <span className="status-item">{formatTimecode(duration, fps).slice(0, 8)}</span>
    </div>
  );
}
