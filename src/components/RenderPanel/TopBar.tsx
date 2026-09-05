import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import { randomizeWithMotion } from "../../engine/random/randomize";
import { saveProjectAs, openProject } from "../../project/FileIO";
import { buildProjectFromStore, applyProjectToStore } from "../../project/Project";
import { RenderQueue } from "../../export/RenderQueue";
import { exportVideo } from "../../export/VideoExporter";
import { setActiveRenderQueue } from "../../export/activeRenderQueue";
import { getActiveAudioBytes } from "../../engine/audio/activeAudioBytes";
import { sequenceTotalDuration } from "../../engine/sequence/Sequence";
import type { FractalRenderParams } from "../../engine/fractals/defaults";
import type { ColorSettings } from "../../engine/renderer/FrameRenderer";
import { useEditorStore } from "../../store/editorStore";
import "./TopBar.css";

// SAVE/OPEN (Phase 14): a .fractal file is just the store's state as JSON,
// fully reproducible. EXPORT (Phase 15+16) renders the full timeline
// offline, frame by frame, then hands the sequence to the bundled `ffmpeg`
// sidecar (tauri.conf.json's bundle.externalBin — no system install needed)
// to produce a single MP4 — the frames themselves are a throwaway temp
// folder, never shown to the user. RANDOMIZE
// lays down a full seeded camera + fractal + color morph across the
// timeline in one click (§11) — it's the closest thing this app has to its
// own identity, so it gets the loud button; everything else stays quiet.
const FIRST_LAUNCH_STORAGE_KEY = "fraxtal-first-launch-seen";
const FIRST_LAUNCH_SPOTLIGHT_MS = 5000;

export function TopBar() {
  const lastSeed = useEditorStore((s) => s.lastSeed);
  const togglePresetBrowser = useEditorStore((s) => s.togglePresetBrowser);
  const undoSnapshot = useEditorStore((s) => s.undoSnapshot);
  const [status, setStatus] = useState<string | null>(null);

  // A quiet, one-time spotlight on the two actions that best answer "what
  // do I even do here" — impeccable critique (2026-09-05) found a
  // first-timer lands on jargon sliders with RANDOMIZE/PRESETS visually
  // equal to Open/Save/Export among 9 buttons. Never comes back once seen
  // (same pattern as the viewport's nav hint), and clears itself early on
  // the first real interaction with either button.
  const [spotlightFirstLaunch, setSpotlightFirstLaunch] = useState(() => {
    try {
      return localStorage.getItem(FIRST_LAUNCH_STORAGE_KEY) !== "true";
    } catch {
      return false;
    }
  });
  const dismissSpotlight = () => {
    setSpotlightFirstLaunch(false);
    try {
      localStorage.setItem(FIRST_LAUNCH_STORAGE_KEY, "true");
    } catch {
      // Private/blocked storage — the spotlight just reappears next launch, harmless.
    }
  };
  useEffect(() => {
    if (!spotlightFirstLaunch) return;
    const timer = setTimeout(dismissSpotlight, FIRST_LAUNCH_SPOTLIGHT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotlightFirstLaunch]);

  const flashStatus = (text: string) => {
    setStatus(text);
    setTimeout(() => setStatus(null), 2500);
  };

  const handleUndo = () => {
    const s = useEditorStore.getState();
    if (!s.undoSnapshot) return;
    applyProjectToStore(s.undoSnapshot);
    s.setUndoSnapshot(null);
    flashStatus("Undone");
  };

  // Ctrl/Cmd+Z undoes the last RANDOMIZE or PRESET apply — the one-step
  // safety net that lets those stay single-click instead of gating them
  // behind a confirmation dialog.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRandomize = () => {
    if (spotlightFirstLaunch) dismissSpotlight();
    const s = useEditorStore.getState();
    s.setUndoSnapshot(buildProjectFromStore());

    const seed = Math.floor(Math.random() * 1_000_000_000);
    const { base, keyframesByParam } = randomizeWithMotion(seed, s.selectedFractalId, s.duration);

    s.setLastSeed(seed);
    s.requestCameraChange(base.camera);
    for (const [id, value] of Object.entries(base.params)) {
      s.setParam(s.selectedFractalId, id as keyof FractalRenderParams, value);
    }
    for (const [field, value] of Object.entries(base.color) as [keyof ColorSettings, number][]) {
      s.setColorField(field, value);
    }
    for (const [paramId, keyframes] of Object.entries(keyframesByParam)) {
      s.setKeyframesForParam(paramId, keyframes);
    }
  };

  const handleSave = async () => {
    try {
      const path = await saveProjectAs();
      if (path) flashStatus("Saved");
    } catch (err) {
      console.error("Save failed:", err);
      flashStatus("Save failed");
    }
  };

  const handleOpen = async () => {
    try {
      const path = await openProject();
      if (path) flashStatus("Opened");
    } catch (err) {
      console.error("Open failed:", err);
      flashStatus("Open failed — not a valid .fractal file?");
    }
  };

  const handleExport = async () => {
    const outputPath = await saveFileDialog({
      filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
      defaultPath: "composition.mp4",
    });
    if (!outputPath) return;

    const s = useEditorStore.getState();
    // A playing sequence (PresetBrowser's "YOUR SEQUENCE" builder) owns the
    // frame the same way it does in the live viewport — export renders the
    // whole chained set, not whatever single preset happens to still be
    // sitting in selectedFractalId underneath it.
    const isSequence = s.sequenceActive && s.sequence.length > 0;
    const duration = isSequence ? sequenceTotalDuration(s.sequence) : s.duration;
    const queue = new RenderQueue();
    setActiveRenderQueue(queue);
    s.setRenderProgress({ frame: 0, totalFrames: Math.max(1, Math.round(duration * s.fps)) });

    try {
      const result = await exportVideo(
        {
          fractalId: s.selectedFractalId,
          camera: s.camera,
          params: s.paramsByFractal[s.selectedFractalId],
          keyframesByParam: s.keyframesByParam,
          color: s.color,
          duration,
          fps: s.fps,
          resolution: s.resolution,
          outputPath,
          audioAnalysis: s.audioAnalysis,
          audioMappings: s.audioMappings,
          audioBytes: getActiveAudioBytes(),
          layerB:
            s.layerBFractalId && s.layerBFractalId !== s.selectedFractalId
              ? { fractalId: s.layerBFractalId, params: s.paramsByFractal[s.layerBFractalId] }
              : null,
          sequence: isSequence ? { steps: s.sequence, transitionSeconds: s.sequenceTransitionSeconds } : undefined,
          drawStrokes: s.drawStrokes,
        },
        queue,
        (progress) => useEditorStore.getState().setRenderProgress(progress),
      );
      flashStatus(result.cancelled ? `Cancelled at frame ${result.frameCount}` : "Video exported");
    } catch (err) {
      console.error("Export failed:", err);
      // ffmpeg ships bundled with the app (no system install to blame), so
      // surface the real failure instead of guessing at one — the full
      // detail is already in the console for anyone who needs it.
      const detail = err instanceof Error ? err.message.split("\n")[0] : null;
      flashStatus(detail ? `Export failed — ${detail}` : "Export failed");
    } finally {
      setActiveRenderQueue(null);
      useEditorStore.getState().setRenderProgress(null);
    }
  };

  return (
    <div className="top-bar">
      <span className="app-title">FraXtal</span>
      {status && <span className="top-bar-status">{status}</span>}
      <div className="top-bar-actions">
        {undoSnapshot && (
          <button className="undo-button" onClick={handleUndo} title="Undo (Ctrl+Z)">
            ↶ UNDO
          </button>
        )}
        <button
          className={spotlightFirstLaunch ? "randomize-button spotlight" : "randomize-button"}
          onClick={handleRandomize}
          title={`Last seed: ${lastSeed}`}
          aria-label={`Randomize (last seed: ${lastSeed})`}
        >
          ✦ RANDOMIZE
        </button>
        <button
          className={spotlightFirstLaunch ? "presets-button spotlight" : "presets-button"}
          onClick={() => {
            if (spotlightFirstLaunch) dismissSpotlight();
            togglePresetBrowser();
          }}
        >
          PRESETS
        </button>
        <button className="file-button" onClick={handleOpen}>
          OPEN
        </button>
        <button className="file-button" onClick={handleSave}>
          SAVE
        </button>
        <button className="file-button" onClick={handleExport}>
          EXPORT
        </button>
        <button
          className="minimize-button"
          onClick={() => getCurrentWindow().minimize()}
          title="Minimize"
          aria-label="Minimize"
        >
          ─
        </button>
        <button
          className="close-button"
          onClick={() => getCurrentWindow().close()}
          title="Quit"
          aria-label="Quit"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
