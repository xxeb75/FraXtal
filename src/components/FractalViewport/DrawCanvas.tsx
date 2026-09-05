import { useEffect, useRef } from "react";
import { useEditorStore } from "../../store/editorStore";
import { renderDrawLayer } from "../../engine/draw/DrawLayer";
import type { DrawPoint, DrawStroke } from "../../engine/draw/DrawLayer";

const STROKE_WIDTH = 0.004; // fraction of min(canvas width, height)

/**
 * Freehand drawing that disintegrates to the beat (user request 2026-09-05):
 * a transparent overlay canvas, entirely independent of the WebGPU fractal
 * canvas beneath it — plain 2D canvas drawing, no WGSL involved. Captures
 * pointer strokes only while Draw mode is on (FractalViewport's toggle);
 * once a stroke is released, its points are frozen into plain data — a
 * fixed "shatter" direction/speed rolled once, right here, never again — and
 * handed to the store. From that moment on rendering it (here, or in the
 * offline exporter) is a pure function of that stored data plus the current
 * time (engine/draw/DrawLayer.ts's resolveStroke), so replaying the timeline
 * or exporting a video can never draw it differently than this preview did.
 */
export function DrawCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawMode = useEditorStore((s) => s.drawMode);
  const drawColor = useEditorStore((s) => s.drawColor);
  const addDrawStroke = useEditorStore((s) => s.addDrawStroke);
  // Component-local, not store state — the in-progress stroke doesn't exist
  // as a "real" (born, disintegrating) stroke until the pointer lifts.
  const activeStroke = useRef<DrawPoint[] | null>(null);

  // Backing-store sizing, same dpr-aware pattern as FractalViewport's own canvas.
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

  // Redraw loop: every committed stroke (store) plus whatever's mid-drag
  // right now — runs regardless of drawMode so strokes keep animating/
  // fading after Draw mode is switched back off, instead of freezing.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let rafId = 0;
    let disposed = false;

    const loop = () => {
      if (disposed) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const { drawStrokes, currentTime, audioAnalysis, drawColor: liveColor } = useEditorStore.getState();
      renderDrawLayer(ctx, drawStrokes, currentTime, audioAnalysis, canvas.width, canvas.height);

      const pts = activeStroke.current;
      if (pts && pts.length > 1) {
        // Not "born" yet — drawn as a plain clean line, no shatter, so the
        // act of drawing always feels immediate; the effect only starts
        // once the stroke is released. Reads the store directly (not the
        // `drawColor` prop from render scope) since this closure is set up
        // once and would otherwise never see a color change made mid-stroke.
        ctx.save();
        ctx.strokeStyle = liveColor;
        ctx.lineWidth = Math.max(1, STROKE_WIDTH * Math.min(canvas.width, canvas.height));
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(pts[0].x * canvas.width, pts[0].y * canvas.height);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * canvas.width, pts[i].y * canvas.height);
        ctx.stroke();
        ctx.restore();
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
    };
  }, []);

  const toNormalized = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawMode) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const { x, y } = toNormalized(e);
    // Shatter/jitter fields are meaningless here — this point is only ever
    // drawn as the plain in-progress preview line (see the render loop
    // above), never through resolveStroke, until finishStroke() rolls its
    // real values.
    activeStroke.current = [{ x, y, shatterX: 0, shatterY: 0, shatterSpeed: 0, jitterPhase: 0, jitterFreq: 0 }];
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawMode || !activeStroke.current) return;
    const { x, y } = toNormalized(e);
    activeStroke.current.push({ x, y, shatterX: 0, shatterY: 0, shatterSpeed: 0, jitterPhase: 0, jitterFreq: 0 });
  };

  const finishStroke = () => {
    const pts = activeStroke.current;
    activeStroke.current = null;
    if (!pts || pts.length < 2) return;

    const stroke: DrawStroke = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      color: drawColor,
      width: STROKE_WIDTH,
      bornAt: useEditorStore.getState().currentTime,
      // Rolled once, right now, never again — see the module doc comment.
      points: pts.map((p) => ({
        x: p.x,
        y: p.y,
        shatterX: Math.random() * 2 - 1,
        shatterY: Math.random() * 2 - 1,
        shatterSpeed: 0.5 + Math.random(),
        jitterPhase: Math.random() * Math.PI * 2,
        jitterFreq: 4 + Math.random() * 5, // rad/s — independent per point, not a synced pulse
      })),
    };
    addDrawStroke(stroke);
  };

  return (
    <canvas
      ref={canvasRef}
      className={drawMode ? "draw-canvas draw-canvas-active" : "draw-canvas"}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
    />
  );
}
