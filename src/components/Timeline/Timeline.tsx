import { useEffect, useRef } from "react";
import { paramDisplayLabel } from "../../engine/animation/paramKeys";
import { buildProjectFromStore } from "../../project/Project";
import { useEditorStore } from "../../store/editorStore";
import "./Timeline.css";

function formatTime(t: number): string {
  const m = Math.floor(t / 60).toString().padStart(2, "0");
  const s = Math.floor(t % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** One parameter's keyframe lane: dots along a time axis, draggable, double-click to delete. */
function TrackLane({ paramId, duration }: { paramId: string; duration: number }) {
  const keyframes = useEditorStore((s) => s.keyframesByParam[paramId]) ?? [];
  const removeKeyframe = useEditorStore((s) => s.removeKeyframe);
  const moveKeyframe = useEditorStore((s) => s.moveKeyframe);
  const laneRef = useRef<HTMLDivElement>(null);
  const dragTime = useRef<number | null>(null);
  const pendingMoveRafRef = useRef<number | null>(null);
  const latestClientXRef = useRef(0);

  const timeFromClientX = (clientX: number): number => {
    const rect = laneRef.current!.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * duration * 100) / 100;
  };

  const handlePointerDown = (kfTime: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer not "active" per the browser — drag still degrades gracefully
    }
    dragTime.current = kfTime;
  };

  // Same rAF-batching as the main playhead: moveKeyframe triggers a store
  // update (this lane + the ● indicators re-render), which shouldn't run
  // once per raw pointermove when the mouse can poll far faster than 60Hz.
  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragTime.current === null) return;
    latestClientXRef.current = e.clientX;
    if (pendingMoveRafRef.current !== null) return;
    pendingMoveRafRef.current = requestAnimationFrame(() => {
      pendingMoveRafRef.current = null;
      if (dragTime.current === null) return;
      const newTime = timeFromClientX(latestClientXRef.current);
      if (newTime !== dragTime.current) {
        moveKeyframe(paramId, dragTime.current, newTime);
        dragTime.current = newTime;
      }
    });
  };

  const handlePointerUp = () => {
    dragTime.current = null;
  };

  useEffect(
    () => () => {
      if (pendingMoveRafRef.current !== null) cancelAnimationFrame(pendingMoveRafRef.current);
    },
    [],
  );

  return (
    <div className="timeline-lane-row">
      <span className="timeline-lane-label" title={paramId}>
        {paramDisplayLabel(paramId)}
      </span>
      <div className="timeline-lane" ref={laneRef}>
        {keyframes.map((k) => (
          <button
            key={k.time}
            type="button"
            className="timeline-kf"
            style={{ left: `${duration > 0 ? (k.time / duration) * 100 : 0}%` }}
            onPointerDown={handlePointerDown(k.time)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onDoubleClick={() => removeKeyframe(paramId, k.time)}
            title={`t=${k.time.toFixed(2)}s — double-click to delete`}
          />
        ))}
      </div>
    </div>
  );
}

// Scrubbable time bar plus one lane per animated parameter. Playback,
// scrubbing, and keyframe editing all write straight into the store — the
// live viewport (Phase 10) reads it back the same way the offline renderer
// eventually will.
export function Timeline() {
  const currentTime = useEditorStore((s) => s.currentTime);
  const duration = useEditorStore((s) => s.duration);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setDuration = useEditorStore((s) => s.setDuration);
  const keyframesByParam = useEditorStore((s) => s.keyframesByParam);
  const clearAllKeyframes = useEditorStore((s) => s.clearAllKeyframes);
  const setUndoSnapshot = useEditorStore((s) => s.setUndoSnapshot);

  const animatedParamIds = Object.keys(keyframesByParam).filter((id) => keyframesByParam[id].length > 0);

  // One click to wipe every lane at once — the per-param "animated ✕" badge
  // (ParameterPanel.tsx) clears one parameter; this is its whole-timeline
  // counterpart, e.g. after RANDOMIZE or a loaded track's auto-seeded
  // "infinite fall" (loadAudio.ts) leave more motion than you want to keep.
  // Same one-step Ctrl+Z safety net as Randomize/Preset/Reset View — this is
  // just as destructive as those, so it gets the same undo snapshot first.
  const handleClearKeyframes = () => {
    setUndoSnapshot(buildProjectFromStore());
    clearAllKeyframes();
  };
  const progress = duration > 0 ? currentTime / duration : 0;

  // Playback: advances currentTime by real elapsed time while isPlaying,
  // looping back to 0 at the end (spec's "boucle" behavior).
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const s = useEditorStore.getState();
      const t = s.duration > 0 ? (s.currentTime + dt) % s.duration : 0;
      setCurrentTime(t);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, setCurrentTime]);

  // Track's pixel geometry, cached at drag start (and kept fresh via
  // ResizeObserver) instead of re-measured on every pointermove — reading
  // getBoundingClientRect() that often forces layout and is exactly what
  // was making the scrub feel janky instead of buttery.
  const trackRef = useRef<HTMLDivElement>(null);
  const trackRectRef = useRef({ left: 0, width: 1 });

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      trackRectRef.current = { left: r.left, width: r.width || 1 };
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The real jank fix: a native pointermove can fire far faster than React
  // can usefully re-render (a fast mouse polls at 125–1000Hz; React commits
  // triggered by a store update on every single one of those events pile up
  // behind the WebGPU frame that's also competing for the main thread).
  // So the visual playhead position is painted directly to the DOM on every
  // native event (cheap, no React involved), while the store — needed for
  // the render loop and for anything else that reads currentTime — is only
  // committed once per animation frame via rAF-batching.
  const playheadRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const pendingTimeRef = useRef<number | null>(null);
  const scrubRafRef = useRef<number | null>(null);

  const paintProgress = (ratio: number) => {
    const width = trackRectRef.current.width;
    if (playheadRef.current) playheadRef.current.style.transform = `translateX(${ratio * width}px)`;
    if (fillRef.current) fillRef.current.style.transform = `translateY(-50%) scaleX(${ratio})`;
  };

  const scheduleCommit = () => {
    if (scrubRafRef.current !== null) return;
    scrubRafRef.current = requestAnimationFrame(() => {
      scrubRafRef.current = null;
      if (pendingTimeRef.current !== null) {
        setCurrentTime(pendingTimeRef.current);
        pendingTimeRef.current = null;
      }
    });
  };

  const scrubToClientX = (clientX: number) => {
    const { left, width } = trackRectRef.current;
    const ratio = Math.min(1, Math.max(0, (clientX - left) / width));
    paintProgress(ratio);
    pendingTimeRef.current = ratio * duration;
    scheduleCommit();
  };

  useEffect(() => () => {
    if (scrubRafRef.current !== null) cancelAnimationFrame(scrubRafRef.current);
  }, []);

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Pointer capture can throw for a pointer the browser doesn't consider
    // "active" (rare edge cases); the drag still degrades to normal bubbling.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignored — see comment above
    }
    const r = e.currentTarget.getBoundingClientRect();
    trackRectRef.current = { left: r.left, width: r.width || 1 };
    scrubToClientX(e.clientX);
  };

  const handleTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    scrubToClientX(e.clientX);
  };

  // GPU-compositor-only positioning (transform, not left/width) so dragging
  // never triggers layout. Reflects React state (`progress`) except mid-drag,
  // where the refs above have already painted ahead of the next re-render.
  const trackWidth = trackRectRef.current.width;
  const playheadX = progress * trackWidth;

  return (
    <div className="timeline">
      <div className="timeline-scrub-row">
        <span className="timeline-time">{formatTime(0)}</span>
        <div
          ref={trackRef}
          className="timeline-track"
          onPointerDown={handleTrackPointerDown}
          onPointerMove={handleTrackPointerMove}
        >
          <div ref={fillRef} className="timeline-fill" style={{ transform: `translateY(-50%) scaleX(${progress})` }} />
          <div ref={playheadRef} className="timeline-playhead" style={{ transform: `translateX(${playheadX}px)` }}>
            <div className="timeline-playhead-dot" />
          </div>
        </div>
        <span className="timeline-time">{formatTime(duration)}</span>
        <input
          className="duration-input"
          type="number"
          min={1}
          step={1}
          value={duration}
          onChange={(e) => setDuration(Math.max(1, Number(e.target.value)))}
          title="Duration (seconds)"
        />
      </div>

      {animatedParamIds.length > 0 && (
        <>
          <div className="timeline-lanes-head">
            <span className="timeline-lanes-count">{animatedParamIds.length} animated parameter{animatedParamIds.length > 1 ? "s" : ""}</span>
            <button
              type="button"
              className="clear-keyframes-button"
              onClick={handleClearKeyframes}
              title="Remove every keyframe on every parameter (Ctrl+Z to undo)"
            >
              🗑 Clear Keyframes
            </button>
          </div>
          <div className="timeline-lanes">
            {animatedParamIds.map((id) => (
              <TrackLane key={id} paramId={id} duration={duration} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
