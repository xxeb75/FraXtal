import { writeFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { OfflineRenderer, type OfflineFrameRequest } from "./OfflineRenderer";
import { resolveSequenceFrame, type SequenceStep } from "../engine/sequence/Sequence";

export interface RenderJob extends OfflineFrameRequest {
  duration: number;
  fps: number;
  resolution: [number, number];
  outputDir: string;
  // When set, every frame comes from resolveSequenceFrame() instead of the
  // single fractalId/camera/params/keyframesByParam/layerB above — those
  // stay required by OfflineFrameRequest but are simply unused in that case.
  // TopBar.tsx always has *some* current single-scene state to pass
  // regardless of whether Sequence mode is active, so this is a plain
  // optional add-on rather than a second job shape callers have to branch on.
  sequence?: { steps: SequenceStep[]; transitionSeconds: number };
}

export interface RenderProgress {
  frame: number;
  totalFrames: number;
  /** "rendering" (the default) while frames are being drawn one by one;
   * "encoding" once every frame is done and ffmpeg has taken over muxing
   * them into the final video — a step with no per-frame progress of its
   * own, so without a distinct phase the overlay looks frozen at 100% for
   * however long that takes (which for a long, full-song export can be
   * several minutes) instead of showing it's still doing something. */
  phase?: "rendering" | "encoding";
}

const FRAME_TIMEOUT_MS = 20_000;

/** Races a promise against a timeout so a stuck GPU call fails loudly
 * instead of hanging the export (and the whole app) forever. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Computes frame 0, 1, 2, … N independently of the timeline UI or the live
 * viewport (spec §16): time = frameIndex / fps, evaluate, render, write —
 * one PNG per frame into outputDir. Cancellable mid-run. VideoExporter.ts
 * (Phase 16) feeds this same numbered PNG sequence into FFmpeg rather than
 * duplicating the frame-computation logic — this class doesn't know or
 * care whether its output ends up as loose files or gets encoded.
 */
export class RenderQueue {
  private cancelled = false;

  cancel(): void {
    this.cancelled = true;
  }

  async run(job: RenderJob, onProgress: (p: RenderProgress) => void): Promise<{ cancelled: boolean; frameCount: number }> {
    const totalFrames = Math.max(1, Math.round(job.duration * job.fps));
    const offline = new OfflineRenderer(job.resolution[0], job.resolution[1]);
    await offline.init();

    try {
      for (let frame = 0; frame < totalFrames; frame++) {
        if (this.cancelled) return { cancelled: true, frameCount: frame };

        const time = frame / job.fps;
        let png: Uint8Array;
        if (job.sequence) {
          const resolved = resolveSequenceFrame(
            job.sequence.steps,
            time,
            job.sequence.transitionSeconds,
            job.resolution[0],
            job.resolution[1],
            job.audioAnalysis ?? null,
          );
          if (!resolved) throw new Error("Sequence has no valid scenes to render.");
          png = await withTimeout(
            offline.renderLayers(resolved.layerA, resolved.layerB, resolved.crossfade, time, job.drawStrokes, job.audioAnalysis ?? null),
            FRAME_TIMEOUT_MS,
            `Frame ${frame}`,
          );
        } else {
          png = await withTimeout(offline.renderFrame(job, time), FRAME_TIMEOUT_MS, `Frame ${frame}`);
        }
        const filename = `frame_${String(frame).padStart(5, "0")}.png`;
        await writeFile(await join(job.outputDir, filename), png);

        onProgress({ frame: frame + 1, totalFrames });
      }
      return { cancelled: false, frameCount: totalFrames };
    } finally {
      offline.dispose();
    }
  }
}
