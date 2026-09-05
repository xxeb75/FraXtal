import { tempDir, join } from "@tauri-apps/api/path";
import { mkdir, remove, writeFile } from "@tauri-apps/plugin-fs";
import { Command } from "@tauri-apps/plugin-shell";
import { RenderQueue, type RenderJob, type RenderProgress } from "./RenderQueue";

export interface VideoExportJob extends Omit<RenderJob, "outputDir"> {
  /** Final .mp4 path (from a Save dialog) — the PNG sequence never touches this. */
  outputPath: string;
  /** Raw bytes of the loaded audio track, if any — muxed into the output so
   * the exported video actually has the music playing, not just reacting to it. */
  audioBytes?: Uint8Array | null;
}

/**
 * Renders the PNG sequence (RenderQueue) into a throwaway temp folder, then
 * hands it to the bundled `ffmpeg` sidecar (see tauri.conf.json's
 * bundle.externalBin — no system install required) to encode H.264 MP4 —
 * muxing in the loaded audio track when one is present — and cleans the
 * temp folder up afterward either way. The user only ever sees the
 * finished video file.
 */
export async function exportVideo(
  job: VideoExportJob,
  queue: RenderQueue,
  onProgress: (p: RenderProgress) => void,
): Promise<{ cancelled: boolean; frameCount: number }> {
  const base = await tempDir();
  const workDir = await join(base, `fraxtal-export-${Date.now()}`);
  await mkdir(workDir, { recursive: true });

  try {
    const result = await queue.run({ ...job, outputDir: workDir }, onProgress);
    if (result.cancelled || result.frameCount === 0) return result;

    // ffmpeg's own mux/encode has no per-frame progress we parse, and for a
    // long full-song export it can run for minutes — without this the
    // overlay just sits at "Frame N/N, 100%" the whole time, which reads as
    // hung rather than "still working" (spec: never leave the user
    // wondering whether an export is frozen).
    onProgress({ frame: result.frameCount, totalFrames: result.frameCount, phase: "encoding" });

    const pattern = await join(workDir, "frame_%05d.png");
    const args = ["-y", "-framerate", String(job.fps), "-i", pattern];

    let audioPath: string | null = null;
    if (job.audioBytes && job.audioBytes.length > 0) {
      audioPath = await join(workDir, "audio.mp3");
      await writeFile(audioPath, job.audioBytes);
      args.push("-i", audioPath);
    }

    // "veryfast" trades some compression efficiency for a much shorter
    // encode — right tradeoff for a tool about quick iteration on a party
    // visual, not squeezing out the smallest possible file.
    args.push("-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", String(job.fps));
    if (audioPath) {
      // -shortest: the video is exactly `duration` seconds regardless of
      // whether the track is longer or shorter than the timeline.
      args.push("-c:a", "aac", "-map", "0:v:0", "-map", "1:a:0", "-shortest");
    }
    args.push(job.outputPath);

    const output = await Command.sidecar("binaries/ffmpeg", args).execute();
    if (output.code !== 0) {
      throw new Error(`ffmpeg exited with code ${output.code}:\n${output.stderr}`);
    }

    return result;
  } finally {
    await remove(workDir, { recursive: true }).catch(() => {
      // Best-effort cleanup — a leftover temp folder isn't worth failing the export over.
    });
  }
}
