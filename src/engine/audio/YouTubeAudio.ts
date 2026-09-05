import { Command } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import { tempDir, join } from "@tauri-apps/api/path";
import { readFile, remove } from "@tauri-apps/plugin-fs";

/**
 * Extracts audio from a URL (YouTube or anything yt-dlp supports) into a
 * throwaway temp MP3, reads it back as bytes, and cleans up. Both yt-dlp
 * and ffmpeg are bundled sidecars (tauri.conf.json's bundle.externalBin —
 * no system install required); yt-dlp needs ffmpeg internally to do the
 * audio extraction, so we point it at our bundled ffmpeg explicitly via
 * --ffmpeg-location instead of relying on system PATH. Downloading from a
 * site is subject to that site's terms of service; this is a personal-use
 * convenience, not a bulk scraper.
 */
export async function downloadAudioFromUrl(url: string): Promise<Uint8Array> {
  const base = await tempDir();
  const outPath = await join(base, `fraxtal-audio-${Date.now()}.mp3`);
  const ffmpegPath = await invoke<string>("ffmpeg_sidecar_path");

  const args = [
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",
    "--no-playlist",
    "--ffmpeg-location",
    ffmpegPath,
    "-o",
    outPath,
    url,
  ];
  const result = await Command.sidecar("binaries/yt-dlp", args).execute();
  if (result.code !== 0) {
    throw new Error(`yt-dlp exited with code ${result.code}:\n${result.stderr}`);
  }

  try {
    return await readFile(outPath);
  } finally {
    await remove(outPath).catch(() => {
      // best-effort cleanup
    });
  }
}
