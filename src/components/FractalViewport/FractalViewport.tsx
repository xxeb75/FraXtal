import { useEffect, useRef, useState } from "react";
import { Camera } from "../../engine/camera/Camera";
import { FRACTAL_DEFAULT_CAMERA } from "../../engine/fractals/defaults";
import { evaluateAnimatedFrame } from "../../engine/renderer/FrameRenderer";
import { resolveSequenceFrame } from "../../engine/sequence/Sequence";
import { DrawCanvas } from "./DrawCanvas";
import { DRAW_COLOR_PRESETS } from "../../engine/draw/DrawLayer";
import { waveformWindowAt, spectrumWindowAt } from "../../engine/audio/AudioAnalyzer";
import { WebGPURenderer } from "../../engine/renderer/WebGPURenderer";
import { buildProjectFromStore } from "../../project/Project";
import { useEditorStore } from "../../store/editorStore";
import "./FractalViewport.css";

const ZOOM_WHEEL_SENSITIVITY = 0.0015;
const ZOOM_DOUBLE_CLICK_FACTOR = 0.35;
const DRAG_THRESHOLD_PX = 4;
const NAV_HINT_STORAGE_KEY = "fraxtal-nav-hint-seen";
const NAV_HINT_AUTO_HIDE_MS = 6000;

/**
 * Hosts the canvas and drives the WebGPU render loop directly — the loop
 * reads the Camera instance by reference every frame instead of through
 * React state, so panning/zooming never triggers a React re-render.
 * Interaction results are mirrored into the store afterwards, for panels
 * that need to display or serialize camera state.
 */
export function FractalViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef(new Camera());
  const [gpuError, setGpuError] = useState<string | null>(null);

  // A quiet, one-time nudge — "scroll to zoom, drag to pan" — instead of a
  // blocking tutorial. Dismisses itself on the first real navigation
  // gesture or after a few seconds either way, and never comes back once
  // seen (spec §20: essentials visible, nothing forced on the user).
  const [showNavHint, setShowNavHint] = useState(() => {
    try {
      return localStorage.getItem(NAV_HINT_STORAGE_KEY) !== "true";
    } catch {
      return true;
    }
  });
  const dismissNavHint = () => {
    setShowNavHint(false);
    try {
      localStorage.setItem(NAV_HINT_STORAGE_KEY, "true");
    } catch {
      // Private/blocked storage — the hint just reappears next launch, harmless.
    }
  };
  useEffect(() => {
    if (!showNavHint) return;
    const timer = setTimeout(dismissNavHint, NAV_HINT_AUTO_HIDE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNavHint]);

  const setCamera = useEditorStore((s) => s.setCamera);

  const syncCameraToStore = () => setCamera(cameraRef.current.getState());

  // Render loop: init WebGPU once, then render every frame using whatever
  // fractal is currently selected (read live from the store, no subscription
  // needed since this isn't reactive UI).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let ready = false;
    let rafId = 0;
    const renderer = new WebGPURenderer();

    renderer
      .init(canvas)
      .then(() => {
        ready = true;
      })
      .catch((err: unknown) => {
        console.error("WebGPU init failed:", err);
        setGpuError(err instanceof Error ? err.message : String(err));
      });

    const loop = () => {
      if (disposed) return;
      // A render error (bad uniform, unregistered fractal id mid-HMR, device
      // loss) must never permanently freeze the loop — always reschedule.
      try {
        // An offline export owns its own GPU device concurrently with this
        // one — on modest/integrated GPUs, both submitting work every frame
        // causes contention that shows up as slowness or driver instability.
        // Go idle for the live preview while an export is running; it
        // resumes the instant renderProgress clears.
        const isExporting = useEditorStore.getState().renderProgress !== null;
        if (ready && !isExporting && canvas.width > 0 && canvas.height > 0) {
          const state = useEditorStore.getState();
          const {
            selectedFractalId: fractalId,
            layerBFractalId,
            color,
            paramsByFractal,
            keyframesByParam,
            currentTime,
            audioAnalysis,
            audioMappings,
            sequenceActive,
            sequence,
            sequenceTransitionSeconds,
          } = state;

          // Sequence mode (HeavyM-inspired scene chaining, engine/sequence/Sequence.ts)
          // fully owns the frame — each scene is its own preset with its own
          // camera/color/keyframes, resolved (and possibly crossfaded into the
          // next one) from currentTime alone. Falls through to the normal
          // single-fractal path if the sequence is empty rather than showing
          // a blank frame.
          const resolvedSequence = sequenceActive
            ? resolveSequenceFrame(sequence, currentTime, sequenceTransitionSeconds, canvas.width, canvas.height, audioAnalysis)
            : null;

          if (resolvedSequence) {
            renderer.renderComposite(resolvedSequence.layerA, resolvedSequence.layerB, resolvedSequence.crossfade);
          } else {
            const cameraState = cameraRef.current.getState();
            const buildLayer = (id: string) => {
              const uniforms = evaluateAnimatedFrame(
                id,
                cameraState,
                paramsByFractal[id],
                keyframesByParam,
                currentTime,
                canvas.width,
                canvas.height,
                color,
                audioAnalysis,
                audioMappings,
              );
              return {
                fractalId: id,
                uniforms,
                waveform: id === "feast" && audioAnalysis ? waveformWindowAt(audioAnalysis, currentTime) : undefined,
                spectrum: id === "bars" && audioAnalysis ? spectrumWindowAt(audioAnalysis, currentTime) : undefined,
              };
            };
            const layerA = buildLayer(fractalId);
            const layerB = layerBFractalId && layerBFractalId !== fractalId ? buildLayer(layerBFractalId) : null;
            renderer.renderComposite(layerA, layerB);
          }
        }
      } catch (err) {
        console.error("Render loop error:", err);
        setGpuError(err instanceof Error ? err.message : String(err));
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      renderer.dispose();
    };
  }, []);

  // Canvas backing-store sizing, independent of the WebGPU lifecycle above.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // Reset camera — "R" key (cahier des charges navigation spec) and the
  // visible RESET VIEW button both go through this, so a lost/disoriented
  // user always has an obvious way back regardless of whether they know
  // the shortcut. Resetting the Camera instance alone isn't enough when a
  // camera param is keyframed (hand-authored, a preset, or the automatic
  // "infinite fall" a loaded track seeds — loadAudio.ts): evaluateAnimatedFrame()
  // prefers the keyframe curve over the manual value every frame, so the
  // reset would be silently overridden a frame later and look like it did
  // nothing. That default fall also keyframes the fractal's shape and the
  // palette, not just the camera — clearing camera keyframes alone left
  // those still morphing underneath, which read as "reset did nothing"
  // just as much as a camera snapping back would have. Clearing every
  // keyframe (same operation PRESETS already does before applying its own)
  // makes Reset View an unconditional "stop and show me the whole thing"
  // rather than a partial one. That's still destructive though — impeccable
  // critique (2026-09-05, re-run) caught that unlike Randomize and Preset
  // apply, this wasn't snapshotting first, so a single keypress could wipe
  // an entire hand-built animation with no way back. Same one-step safety
  // net as those two now.
  const handleResetView = () => {
    const s = useEditorStore.getState();
    s.setUndoSnapshot(buildProjectFromStore());
    const fractalId = s.selectedFractalId;
    cameraRef.current.reset(FRACTAL_DEFAULT_CAMERA[fractalId] ?? FRACTAL_DEFAULT_CAMERA.mandelbrot);
    syncCameraToStore();
    s.clearAllKeyframes();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey) {
        handleResetView();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching fractal families resets the camera — each fractal's
  // interesting structure lives at a different location, so keeping the
  // previous framing would usually just show an empty (or interior) plane.
  const selectedFractalId = useEditorStore((s) => s.selectedFractalId);
  const isFirstFractalRender = useRef(true);
  useEffect(() => {
    if (isFirstFractalRender.current) {
      isFirstFractalRender.current = false;
      return;
    }
    cameraRef.current.reset(FRACTAL_DEFAULT_CAMERA[selectedFractalId] ?? FRACTAL_DEFAULT_CAMERA.mandelbrot);
    syncCameraToStore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFractalId]);

  // One-shot external camera commands (RANDOMIZE today, "load project"
  // later) apply here — the only place allowed to mutate the live Camera
  // instance's state directly, keeping ownership of it in this component.
  const cameraCommand = useEditorStore((s) => s.cameraCommand);
  const clearCameraCommand = useEditorStore((s) => s.clearCameraCommand);
  useEffect(() => {
    if (!cameraCommand) return;
    cameraRef.current.setState(cameraCommand);
    syncCameraToStore();
    clearCameraCommand();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraCommand]);

  const dragState = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { x: e.clientX, y: e.clientY, moved: false };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragState.current;
    // Each scene in a playing sequence owns its own camera (its preset's) —
    // dragging here would fight it every frame and silently do nothing
    // visible, the exact "control has no effect" trap the AnimatedBadge
    // work elsewhere this project already exists to avoid.
    if (!drag || useEditorStore.getState().sequenceActive) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
      drag.moved = true;
    }
    if (drag.moved) {
      const rect = e.currentTarget.getBoundingClientRect();
      cameraRef.current.pan(dx, dy, rect.width, rect.height);
      drag.x = e.clientX;
      drag.y = e.clientY;
      syncCameraToStore();
      if (showNavHint) dismissNavHint();
    }
  };

  // A plain click (no drag) intentionally does nothing to the camera — it
  // used to silently recenter, which was the direct cause of users getting
  // disoriented mid-zoom with no idea what had just moved. Drag to pan,
  // scroll to zoom, double-click to zoom in fast: three gestures, all with
  // continuous visual feedback while they happen.
  const handlePointerUp = () => {
    dragState.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (useEditorStore.getState().sequenceActive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * ZOOM_WHEEL_SENSITIVITY);
    cameraRef.current.zoomAt(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, factor);
    syncCameraToStore();
    if (showNavHint) dismissNavHint();
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (useEditorStore.getState().sequenceActive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    cameraRef.current.zoomAt(
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
      1 / ZOOM_DOUBLE_CLICK_FACTOR,
    );
    syncCameraToStore();
    if (showNavHint) dismissNavHint();
  };

  // Sequence mode replaces the whole frame with the scene chain (see the
  // render loop above) and disables camera dragging per-scene, both silent
  // otherwise — this is the one visible sign it's happening, plus the only
  // way back to normal playback besides re-opening PRESETS.
  const sequenceActive = useEditorStore((s) => s.sequenceActive);
  const setSequenceActive = useEditorStore((s) => s.setSequenceActive);

  // Live drawing that disintegrates to the beat (user request 2026-09-05) —
  // DrawCanvas.tsx owns capture/render, this just wires the toggle + a way
  // to wipe it. Draw mode intentionally doesn't fight camera pan/zoom: the
  // overlay canvas only starts intercepting pointer events once it's on
  // (see FractalViewport.css's .draw-canvas-active rule), so the two never
  // compete for the same drag gesture.
  const drawMode = useEditorStore((s) => s.drawMode);
  const setDrawMode = useEditorStore((s) => s.setDrawMode);
  const drawTool = useEditorStore((s) => s.drawTool);
  const setDrawTool = useEditorStore((s) => s.setDrawTool);
  const drawColor = useEditorStore((s) => s.drawColor);
  const setDrawColor = useEditorStore((s) => s.setDrawColor);
  const drawStrokeCount = useEditorStore((s) => s.drawStrokes.length);
  const clearDrawStrokes = useEditorStore((s) => s.clearDrawStrokes);

  // Draw/Text act as one mutually-exclusive pair: clicking the tool that's
  // already active turns drawing off entirely; clicking the other one turns
  // drawing on (if it wasn't) and switches to it — so there's always exactly
  // zero or one active tool, never two, without a separate on/off control.
  const selectDrawTool = (tool: "stroke" | "text") => {
    if (drawMode && drawTool === tool) {
      setDrawMode(false);
    } else {
      setDrawMode(true);
      setDrawTool(tool);
    }
  };

  return (
    <div className="fractal-viewport">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
      />
      <DrawCanvas />
      <div className="draw-controls">
        <button
          className={drawMode && drawTool === "stroke" ? "draw-toggle-button draw-toggle-active" : "draw-toggle-button"}
          onClick={() => selectDrawTool("stroke")}
          title="Draw on the viewport — each stroke shatters and fades in time with the kick drum"
          aria-pressed={drawMode && drawTool === "stroke"}
        >
          ✏ {drawMode && drawTool === "stroke" ? "Drawing…" : "Draw"}
        </button>
        <button
          className={drawMode && drawTool === "text" ? "draw-toggle-button draw-toggle-active" : "draw-toggle-button"}
          onClick={() => selectDrawTool("text")}
          title="Type text on the viewport — it shatters and fades the same way a drawn stroke does"
          aria-pressed={drawMode && drawTool === "text"}
        >
          🔤 Text
        </button>
        {drawStrokeCount > 0 && (
          <button className="draw-clear-button" onClick={clearDrawStrokes} title="Remove everything drawn or typed">
            🗑
          </button>
        )}
        {drawMode && (
          // Only while actually drawing — a color picker has nothing to do
          // once Draw mode is off, same reasoning as hiding RESET VIEW
          // during a sequence: a control with no live effect is worse than
          // no control. Picking a swatch only affects strokes drawn from
          // here on, not the ones already on screen.
          <div className="draw-color-swatches" role="group" aria-label="Draw color">
            {DRAW_COLOR_PRESETS.map((c) => (
              <button
                key={c}
                className={c === drawColor ? "draw-color-swatch draw-color-swatch-active" : "draw-color-swatch"}
                style={{ background: c }}
                onClick={() => setDrawColor(c)}
                title={c}
                aria-label={`Draw in ${c}`}
                aria-pressed={c === drawColor}
              />
            ))}
          </div>
        )}
      </div>
      {!sequenceActive && (
        <button className="reset-view-button" onClick={handleResetView} title="Reset camera (R)">
          RESET VIEW
        </button>
      )}
      {sequenceActive && (
        <button
          className="sequence-mode-badge"
          onClick={() => setSequenceActive(false)}
          title="Playing a sequence of scenes — each has its own camera. Click to stop and return to the single preset."
        >
          ▶ SEQUENCE — click to stop
        </button>
      )}
      <div className={showNavHint ? "nav-hint" : "nav-hint nav-hint-hidden"}>scroll to zoom · drag to pan</div>
      {gpuError && (
        <div className="viewport-error">
          <strong>WebGPU unavailable</strong>
          <span>{gpuError}</span>
        </div>
      )}
    </div>
  );
}
