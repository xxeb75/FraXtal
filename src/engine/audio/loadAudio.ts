import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { analyzeAudioFile } from "./AudioAnalyzer";
import { downloadAudioFromUrl } from "./YouTubeAudio";
import { setActiveAudioBytes } from "./activeAudioBytes";
import { cameraParamKey, colorParamKey, fractalParamKey } from "../animation/paramKeys";
import type { AudioMapping } from "./AudioMapping";
import type { Keyframe } from "../../types/project";
import { FRACTAL_ZOOM_TARGET } from "../fractals/defaults";
import { useEditorStore } from "../../store/editorStore";

const AUDIO_FILE_FILTER = [{ name: "Audio", extensions: ["mp3", "wav", "flac", "m4a", "ogg"] }];

// A camera coordinate is stored as one f32 in the shader (screenToComplex
// adds the per-pixel offset straight onto it). f32 only carries ~7 decimal
// digits, so once the visible span (4/zoom) shrinks to somewhere around the
// coordinate's own float precision, neighboring pixels round to the exact
// same value — the dive visibly stalls ("same image, barely moving") well
// before that reads as a deliberate slowdown. Genuinely lifting that wall
// needs double-precision arithmetic through the whole shader iteration, not
// just the camera math — out of scope here. So instead of pushing one point
// past where it can render, each dive only goes as deep as it can stay
// sharp, then *cuts* to a fresh point and dives again — the fall never
// runs out of new structure to show, it just keeps finding more.
const ZOOM_SEGMENT_SECONDS = 9;
const ZOOM_SEGMENT_DEPTH = 2700;

/** Fisher-Yates — used to shuffle which boundary point each dive cuts to
 * next, so the sequence isn't predictable after the first couple of cuts
 * (and differs between loads/relaunches, one load's fixed order otherwise
 * being memorizable within a single track's length). */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// A fractal boundary is dense with detail near any of its own points — that
// IS what "fractal" means — so nudging a proven, richly-detailed coordinate
// by a small amount is a safe way to get real variety between cuts without
// gambling on an unverified coordinate landing in empty territory.
function nearbyPoints(
  base: { centerX: number; centerY: number },
  deltas: [number, number][],
): { centerX: number; centerY: number }[] {
  return [base, ...deltas.map(([dx, dy]) => ({ centerX: base.centerX + dx, centerY: base.centerY + dy }))];
}

const ZOOM_CYCLE_POINTS: Record<string, { centerX: number; centerY: number }[]> = {
  mandelbrot: nearbyPoints(FRACTAL_ZOOM_TARGET.mandelbrot, [
    [0.0021, -0.0013],
    [-0.0034, 0.0022],
    [0.0009, 0.0031],
    [-0.0017, -0.0026],
    [0.0038, 0.0008],
    [-0.0006, 0.0037],
    [0.0025, 0.0029],
    [-0.0041, -0.0011],
  ]),
  "burning-ship": nearbyPoints(FRACTAL_ZOOM_TARGET["burning-ship"], [
    [0.015, -0.008],
    [-0.02, 0.012],
    [0.008, 0.021],
    [0.026, 0.006],
    [-0.011, -0.019],
    [0.017, 0.028],
  ]),
};

/**
 * Chains several short dives instead of one long one: each segment holds a
 * fixed center, ramps zoom 1 → ZOOM_SEGMENT_DEPTH with "exponential"
 * interpolation (a genuinely constant *rate* of zoom, unlike a linear
 * keyframe which front-loads almost all the visible change into the first
 * couple of seconds), then the next segment's own [center, zoom=1] pair
 * lands at the exact same timestamp — Track.evaluate() treats a zero-width
 * gap as an instant snap to the later value, so that reads as a hard cut to
 * a fresh point rather than a pan or a reset-and-pause.
 */
function buildZoomCycleKeyframes(
  fractalId: string,
  duration: number,
): { zoom: Keyframe[]; centerX: Keyframe[]; centerY: Keyframe[] } {
  const pool = ZOOM_CYCLE_POINTS[fractalId] ?? [FRACTAL_ZOOM_TARGET[fractalId] ?? { centerX: 0, centerY: 0 }];
  const segmentCount = Math.max(1, Math.round(duration / ZOOM_SEGMENT_SECONDS));
  // Re-shuffle every time the pool is exhausted rather than one shuffle
  // repeated in a loop, so a long track doesn't fall into an audible cycle.
  const points = Array.from({ length: Math.ceil(segmentCount / pool.length) }, () => shuffled(pool)).flat();
  const segmentLength = duration / segmentCount;

  const zoom: Keyframe[] = [];
  const centerX: Keyframe[] = [];
  const centerY: Keyframe[] = [];

  for (let i = 0; i < segmentCount; i++) {
    const start = i * segmentLength;
    const end = (i + 1) * segmentLength;
    const point = points[i];

    zoom.push({ time: start, value: 1, interpolation: "linear" });
    zoom.push({ time: end, value: ZOOM_SEGMENT_DEPTH, interpolation: "exponential" });
    // Constant across the segment (same value at both ends), then the next
    // segment's own start-of-segment point at this same timestamp is what
    // actually produces the cut.
    centerX.push({ time: start, value: point.centerX, interpolation: "linear" });
    centerX.push({ time: end, value: point.centerX, interpolation: "linear" });
    centerY.push({ time: start, value: point.centerY, interpolation: "linear" });
    centerY.push({ time: end, value: point.centerY, interpolation: "linear" });
  }

  return { zoom, centerX, centerY };
}

/** Evenly spread `values` across [0, duration] with `interpolation` between
 * them — the shared shape behind every "keeps drifting on its own, doesn't
 * need audio to move" baseline track below. */
function spreadKeyframes(duration: number, values: number[], interpolation: Keyframe["interpolation"]): Keyframe[] {
  if (values.length === 1) return [{ time: 0, value: values[0], interpolation }];
  return values.map((value, i) => ({ time: (duration * i) / (values.length - 1), value, interpolation }));
}

/**
 * A handful of fixed waypoints with easing between them still reads as a
 * machine hitting marks on a schedule — arrives, settles, waits, moves on.
 * A living thing's motion doesn't have a schedule: it's several rhythms
 * overlapping at once (breathing, pulse, smaller tremors), none of them
 * synced to the others, so it never quite repeats and never quite stops
 * either. Summing a few sine waves at mutually-prime-ish periods (so their
 * combined pattern doesn't noticeably repeat within a normal track length)
 * approximates that — sampled densely and linear-interpolated between
 * samples so the curve itself stays smooth, not just its waypoints.
 */
function organicKeyframes(
  duration: number,
  base: number,
  amplitude: number,
  periodsSeconds: number[],
  samplesPerSecond = 1,
): Keyframe[] {
  const steps = Math.max(2, Math.round(duration * samplesPerSecond));
  // A random phase per load (not per-fractal-fixed) means reloading the
  // same track — or loading a different one — doesn't retrace the exact
  // same shape journey, part of what makes it feel alive rather than wound
  // up and replayed.
  const phaseSeed = Math.random() * Math.PI * 2;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = (duration * i) / steps;
    const wobble = periodsSeconds.reduce(
      (sum, period, idx) => sum + Math.sin((2 * Math.PI * t) / period + idx * 1.7 + phaseSeed) / (idx + 1),
      0,
    );
    // Harmonic sum above can reach a bit past ±1 (e.g. periods.length=3 →
    // up to 1 + 1/2 + 1/3 ≈ 1.83) — normalize so `amplitude` is an honest
    // bound on the swing, not just its first harmonic.
    const norm = periodsSeconds.reduce((sum, _, idx) => sum + 1 / (idx + 1), 0);
    return { time: t, value: base + amplitude * (wobble / norm), interpolation: "linear" as const };
  });
}

// A tasteful "just works" starting point (spec §14's own example: Bass →
// Zoom, Mid → Rotation, Amplitude → Brightness) — applied automatically the
// first time a track loads, so the fractal reacts immediately without the
// user having to configure anything first. Amounts are tuned for the
// default camera (zoom ≈ 1); still editable/removable afterward.
//
// Zoom/rotation/color move the *view* of the fractal, not the fractal
// itself — for it to actually change shape in rhythm, something structural
// has to move too: Julia's C constant (its whole identity) or the escape
// power (2 → a completely different silhouette), whichever the loaded
// fractal actually has.
export function defaultMappings(fractalId: string): AudioMapping[] {
  const mk = (source: AudioMapping["source"], targetParamId: string, amount: number): AudioMapping => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    source,
    targetParamId,
    amount,
  });

  const mappings = [
    mk("bass", cameraParamKey("zoom"), 10),
    mk("amplitude", cameraParamKey("zoom"), 4),
    mk("mid", cameraParamKey("rotation"), 4.5),
    mk("treble", colorParamKey("paletteOffset"), 1.8),
    mk("amplitude", colorParamKey("brightness"), 1.4),
    mk("treble", colorParamKey("brightness"), 0.9),
    // paletteId isn't just a hue shift like paletteOffset — palette()
    // fractionally blends between two whole *families* (fire/ocean/toxic/…,
    // common.wgsl), so bass driving it hard snaps the whole color identity
    // on a hit instead of just sliding the same hue around. A punchier,
    // more "drop" kind of spectacle than a smooth cycle can give.
    mk("bass", colorParamKey("paletteId"), 3),
    // contrast isn't audio-reactive by default at all yet — a bass hit
    // crushing blacks/blowing highlights for an instant reads as a flash,
    // the same trick strobing VJ visuals use to sell impact on the beat.
    mk("bass", colorParamKey("contrast"), 0.7),
  ];

  if (fractalId === "julia") {
    // cReal/cImag are clamped to their [-2, 2] slider range downstream
    // (FrameRenderer's clampToParamRange) — pushing the amount past what
    // the base value + swing can reach just means it pins at the bound on
    // loud hits instead of overshooting into nonsense, so this is safe to
    // push hard for a "slams into shape" feel rather than a gentle drift.
    // Two bands stacked on each of cReal/cImag (audioOffsetFor sums every
    // mapping targeting the same param) instead of one gives the constant
    // — the set's whole identity — a busier, less one-note drift. Adding
    // power as a third morphing axis means the silhouette itself (not just
    // C) reshapes with the beat instead of only the C-driven family of
    // Julia sets.
    mappings.push(mk("treble", fractalParamKey(fractalId, "cReal"), 3.0));
    mappings.push(mk("bass", fractalParamKey(fractalId, "cReal"), 1.8));
    mappings.push(mk("mid", fractalParamKey(fractalId, "cImag"), 2.2));
    mappings.push(mk("amplitude", fractalParamKey(fractalId, "cImag"), 1.4));
    mappings.push(mk("treble", fractalParamKey(fractalId, "power"), 3.5));
  } else if (fractalId === "mandelbrot" || fractalId === "burning-ship") {
    // Same idea as Julia's stacked C: three bands feeding the one
    // structural knob these fractals have (no free C constant, only the
    // escape exponent) makes its swing more chaotic/organic than a single
    // band ever could, instead of a clean one-band pulse.
    mappings.push(mk("bass", fractalParamKey(fractalId, "power"), 7));
    mappings.push(mk("mid", fractalParamKey(fractalId, "power"), 3));
    mappings.push(mk("treble", fractalParamKey(fractalId, "power"), 2));
  } else if (fractalId === "feast") {
    // Feast's "Iterations/Bailout/Power" sliders are relabeled Layers/
    // Frequency/Distortion (registry.ts) — driving them from the music is
    // what makes the plasma field and the oscilloscope trace (feast.wgsl)
    // actually move with the beat instead of sitting at their static
    // manual value forever.
    mappings.push(mk("bass", fractalParamKey(fractalId, "bailout"), 8)); // wave frequency
    mappings.push(mk("treble", fractalParamKey(fractalId, "power"), 4)); // warp + scope trace height
    mappings.push(mk("amplitude", fractalParamKey(fractalId, "iterations"), 400)); // layer count
  } else if (fractalId === "vortex") {
    // Vortex's own sliders are relabeled Segments/Speed/Twist (registry.ts) —
    // bass kicking the tunnel's rush speed and treble snapping the mirror
    // count are what make it feel like it's racing to the beat instead of a
    // fixed corridor with color moving through it.
    mappings.push(mk("bass", fractalParamKey(fractalId, "bailout"), 10)); // rush speed
    mappings.push(mk("treble", fractalParamKey(fractalId, "iterations"), 500)); // mirror segment count
    mappings.push(mk("mid", fractalParamKey(fractalId, "power"), 3)); // spiral twist
  } else if (fractalId === "bars") {
    // Bars' own sliders are relabeled Bars/Reflection/Curve (registry.ts).
    // Each column's height already comes straight from the real spectrum
    // (bars.wgsl) — these are the meta-level reactions on top: the floor
    // reflection blooming on loud passages, and the wall-curve snapping
    // sharper on bass hits.
    mappings.push(mk("amplitude", fractalParamKey(fractalId, "bailout"), 25)); // reflection strength
    mappings.push(mk("bass", fractalParamKey(fractalId, "power"), 3)); // edge curve
    mappings.push(mk("treble", fractalParamKey(fractalId, "iterations"), 300)); // bar count
  }

  return mappings;
}

async function finishLoading(bytes: Uint8Array, fileName: string): Promise<void> {
  const s = useEditorStore.getState();
  const objectUrl = setActiveAudioBytes(bytes);
  const analysis = await analyzeAudioFile(bytes);
  s.setAudioLoaded(fileName, objectUrl, analysis);
  // The composition's duration was a 30s placeholder — a loaded track's
  // full length is what the user actually wants to react to and export,
  // not just its first 30 seconds.
  s.setDuration(Math.max(1, Math.round(analysis.duration)));
  if (useEditorStore.getState().audioMappings.length === 0) {
    for (const m of defaultMappings(s.selectedFractalId)) s.addAudioMapping(m);
  }
  // A track loaded with no preset applied otherwise just sits at zoom ≈ 1
  // forever, wobbling in place from the audio offset — not the hypnotic
  // "always diving deeper" feel the app is going for. Auto-seed a constant-
  // rate zoom dive across the whole track (same idea as the "Infinite Zoom"
  // preset), so that's the baseline experience rather than something you
  // only get by opening PRESETS. Only when nothing has already put a zoom
  // keyframe there — a preset's own dive, or the user's own hand-authored
  // one, always wins over this default.
  const st = useEditorStore.getState();
  const fractalId = s.selectedFractalId;
  // Feast (feast.wgsl) is always moving on its own — a real elapsed-time
  // uniform drives its plasma field and glow blobs regardless of any camera
  // or keyframe state — so the elaborate "infinite fall" camera dive built
  // for the escape-time fractals below (which have no motion of their own
  // without it) would just scale a periodic field in and out for no real
  // gain. Its own audio mappings above are enough.
  if (fractalId !== "feast" && (st.keyframesByParam[cameraParamKey("zoom")]?.length ?? 0) === 0) {
    // "An infinite fall through shapes and colors": cut-and-dive through
    // several boundary points instead of one dive that eventually stalls on
    // precision (see buildZoomCycleKeyframes), a color hue that keeps
    // slowly turning underneath the audio pulses instead of only reacting
    // to them, and — for the fractals that have a free structural constant
    // — a slow baseline drift on top of the same audio-reactive morphing
    // (spec §14), so there's always some shape movement even through a
    // quiet passage. Only when nothing's already keyframed the zoom — a
    // preset's own dive, or hand-authored work, always wins over this
    // default.
    // Bars (bars.wgsl) never reads zoom, rotation, or center — it's a flat
    // fake-3D equalizer, not a camera looking at anything — so the zoom-
    // cycle-and-dive/constant-spin machinery below would just be inert
    // keyframes. Its bars already move plenty from the real spectrum data;
    // only the color drift beneath still applies to it.
    if (fractalId !== "bars") {
      const target = FRACTAL_ZOOM_TARGET[fractalId];
      const cycle = buildZoomCycleKeyframes(fractalId, st.duration);
      if (target) {
        s.requestCameraChange({ ...target, zoom: 1, rotation: st.camera.rotation });
      }
      s.setKeyframesForParam(cameraParamKey("zoom"), cycle.zoom);
      if (cycle.centerX.length > 0) {
        s.setKeyframesForParam(cameraParamKey("centerX"), cycle.centerX);
        s.setKeyframesForParam(cameraParamKey("centerY"), cycle.centerY);
      }

      // A constant spin underneath the audio-jolted rotation — the "camera
      // drifting through space" layer real deep-zoom VJ videos use to sell
      // the fall, distinct from the audio's sharper rotation kicks (linear =
      // constant angular velocity, no easing to fight the audio's own jitter
      // on the same param). Direction is randomized per load — which way it
      // spins isn't something to telegraph in advance.
      const ROTATION_SECONDS_PER_TURN = 22;
      const spinDirection = Math.random() < 0.5 ? 1 : -1;
      s.setKeyframesForParam(
        cameraParamKey("rotation"),
        spreadKeyframes(
          st.duration,
          [0, spinDirection * (st.duration / ROTATION_SECONDS_PER_TURN) * 2 * Math.PI],
          "linear",
        ),
      );
    }

    s.setKeyframesForParam(
      colorParamKey("paletteOffset"),
      spreadKeyframes(st.duration, [0, st.duration / 4], "linear"),
    );

    if (fractalId === "julia") {
      s.setKeyframesForParam(
        fractalParamKey(fractalId, "cReal"),
        organicKeyframes(st.duration, -0.5, 0.65, [6, 9, 14]),
      );
      s.setKeyframesForParam(
        fractalParamKey(fractalId, "cImag"),
        organicKeyframes(st.duration, 0.1, 0.5, [7, 10, 15]),
      );
    } else if (fractalId === "mandelbrot" || fractalId === "burning-ship") {
      s.setKeyframesForParam(
        fractalParamKey(fractalId, "power"),
        organicKeyframes(st.duration, 4.5, 2.3, [6, 9, 14]),
      );
    }
  }
}

/** Opens a native file picker for a local MP3/WAV/FLAC/M4A/OGG and analyzes it. */
export async function loadLocalAudioFile(): Promise<void> {
  const path = await open({ filters: AUDIO_FILE_FILTER, multiple: false });
  if (!path || Array.isArray(path)) return;

  const s = useEditorStore.getState();
  s.setAudioLoading(true);
  try {
    const bytes = await readFile(path);
    const fileName = path.split(/[\\/]/).pop() ?? path;
    await finishLoading(bytes, fileName);
  } catch (err) {
    console.error("Audio load failed:", err);
    s.setAudioError(err instanceof Error ? err.message : String(err));
  }
}

/** Downloads audio from a URL (YouTube or anything yt-dlp supports) and analyzes it. */
export async function loadAudioFromUrl(url: string): Promise<void> {
  const s = useEditorStore.getState();
  s.setAudioLoading(true);
  try {
    const bytes = await downloadAudioFromUrl(url);
    await finishLoading(bytes, url);
  } catch (err) {
    console.error("Audio download failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    s.setAudioError(describeDownloadError(message));
  }
}

/** yt-dlp breaks against YouTube fairly often as they change their player
 * internals — a 403 almost always means the installed yt-dlp is stale, not
 * that the link/track is unavailable. Point at the actual fix. */
function describeDownloadError(message: string): string {
  if (message.includes("yt-dlp") && (message.includes("not found") || message.includes("not recognized"))) {
    return "Download failed — is yt-dlp installed?";
  }
  if (message.includes("403") || message.toLowerCase().includes("forbidden")) {
    return "Download failed (403) — yt-dlp is likely out of date. Run: yt-dlp -U";
  }
  return message;
}
