import { useEffect, useRef } from "react";
import { useEditorStore } from "../../store/editorStore";

const DRIFT_CORRECTION_THRESHOLD_S = 0.3;

/**
 * Invisible — just keeps an <audio> element roughly in sync with the
 * Timeline's own playhead clock while playing, so the user hears the track
 * that's driving the fractal (spec §14's whole point: "la fractale gigote
 * en rythme"). Deliberately doesn't force-seek every frame (that would
 * glitch the sound); it only nudges when drift crosses a small threshold.
 */
export function AudioPlayback() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const objectUrl = useEditorStore((s) => s.audioObjectUrl);
  const isPlaying = useEditorStore((s) => s.isPlaying);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!isPlaying) {
      audio.pause();
      return;
    }

    // Hitting Play right after loading (or right after switching tracks)
    // can land before the <audio> element has any data yet — seeking or
    // playing at that point silently does nothing (or throws) instead of
    // erroring loudly, which is exactly what "no sound the first time" was.
    // HAVE_CURRENT_DATA (2) is the first readyState where seek+play is reliable.
    const start = () => {
      try {
        audio.currentTime = useEditorStore.getState().currentTime;
      } catch {
        // Not seekable yet for some other reason — just play from wherever it is.
      }
      audio.play().catch(() => {
        // Autoplay can be blocked in some contexts — the visuals still
        // react from the pre-computed analysis regardless of audible playback.
      });
    };

    if (audio.readyState >= 2) {
      start();
    } else {
      audio.addEventListener("canplay", start, { once: true });
      return () => audio.removeEventListener("canplay", start);
    }
  }, [isPlaying, objectUrl]);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      const audio = audioRef.current;
      if (!audio || audio.readyState < 2) return;
      const target = useEditorStore.getState().currentTime;
      if (Math.abs(audio.currentTime - target) > DRIFT_CORRECTION_THRESHOLD_S) {
        audio.currentTime = target;
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isPlaying]);

  if (!objectUrl) return null;
  return <audio ref={audioRef} src={objectUrl} preload="auto" />;
}
