/**
 * Pre-analyzes a whole audio file into a fixed-rate time series of band
 * energies (bass/mid/treble) and overall amplitude — not a live/real-time
 * analyser. That's deliberate: the offline exporter (Phase 15/16) needs to
 * ask "what was the bass doing at t=12.4s" for an arbitrary frame, on demand
 * and deterministically, the same way it asks AnimationEngine for any other
 * parameter's value at time t. A live AnalyserNode tied to real playback
 * can't answer that; a pre-computed array can.
 */
export interface AudioAnalysis {
  duration: number;
  /** Analysis frames per second (independent of the video's fps or the audio's sample rate). */
  frameRate: number;
  bass: number[];
  mid: number[];
  treble: number[];
  amplitude: number[];
  /** Sharp, short-lived pulses on sudden jumps in low-end energy — a kick
   * drum's signature — as distinct from `bass`'s smooth level-following,
   * which also responds to a held bass note the same way it responds to a
   * kick. Punchy fast-attack/fast-release envelope over a same-vs-previous-
   * frame onset, not a level. */
  kick: number[];
  /** Flat array of `frameCount * waveformSamplesPerFrame` values in [-1, 1] —
   * a decimated snapshot of the actual time-domain waveform at each analysis
   * frame (Feast's oscilloscope, AudioAnalyzer.ts's own header rationale:
   * deterministic and time-addressable, unlike a live AnalyserNode). */
  waveform: Float32Array;
  waveformSamplesPerFrame: number;
  /** Flat array of `frameCount * spectrumBinsPerFrame` values in [0, 1] — a
   * log-spaced-frequency snapshot of the real FFT spectrum at each analysis
   * frame (Bars' equalizer columns), same determinism rationale as waveform. */
  spectrum: Float32Array;
  spectrumBinsPerFrame: number;
}

export type AudioBand = "bass" | "mid" | "treble" | "amplitude" | "kick";

const BASS_HZ: [number, number] = [20, 250];
const MID_HZ: [number, number] = [250, 2000];
const TREBLE_HZ: [number, number] = [2000, 8000];
const WAVEFORM_SAMPLES_PER_FRAME = 64;
const SPECTRUM_BINS_PER_FRAME = 32;
const SPECTRUM_MIN_HZ = 30;

function averageBinRange(data: Uint8Array, lo: number, hi: number): number {
  let sum = 0;
  const count = hi - lo + 1;
  for (let i = lo; i <= hi; i++) sum += data[i];
  return count > 0 ? sum / count / 255 : 0;
}

function rmsAmplitude(data: Uint8Array): number {
  let sumSq = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sumSq += v * v;
  }
  return Math.sqrt(sumSq / data.length);
}

/** Rescales a band to 0..1 relative to its own peak — a quiet/mastered-low
 * track still drives visible motion, since "how loud is bass at this
 * instant relative to this track's own loudest bass" is what matters, not
 * an absolute FFT magnitude. */
function normalizeToPeak(values: number[]): number[] {
  const peak = Math.max(...values, 1e-6);
  return values.map((v) => v / peak);
}

/**
 * Fast-attack/slow-release envelope follower — the standard trick behind
 * every music visualizer's "pulse and fade" look. Without this, raw
 * per-frame FFT magnitude is jittery and reads as noise rather than rhythm;
 * this is what turns it into something that feels organic instead of twitchy.
 */
function envelopeSmooth(values: number[], attack: number, release: number): number[] {
  const out = new Array<number>(values.length);
  let env = values[0] ?? 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const coef = v > env ? attack : release;
    env += (v - env) * coef;
    out[i] = env;
  }
  return out;
}

function shapeForVisuals(values: number[]): number[] {
  return envelopeSmooth(normalizeToPeak(values), 0.85, 0.42);
}

/** A hit, not a level: rectified frame-to-frame increase in the raw signal
 * (so a sustained bass note that isn't getting louder produces ~nothing,
 * while a kick's sudden onset produces a spike), normalized to its own
 * peak, then a near-instant attack with a quick release so each hit reads
 * as one sharp, self-resetting flash instead of blending into a smooth
 * level like `bass` does. This is what makes drum hits feel like *hits*. */
function onsetPulse(raw: number[]): number[] {
  const diffs = raw.map((v, i) => Math.max(0, v - (raw[i - 1] ?? v)));
  return envelopeSmooth(normalizeToPeak(diffs), 0.97, 0.55);
}

/** Picks `count` evenly-spaced samples out of the raw 0..255 time-domain
 * buffer and recenters them to [-1, 1] — a real (if decimated) snapshot of
 * the waveform's shape at this instant, not a synthesized stand-in for it. */
function decimateWaveform(data: Uint8Array, count: number): Float32Array {
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const srcIndex = Math.min(data.length - 1, Math.floor((i / count) * data.length));
    out[i] = (data[srcIndex] - 128) / 128;
  }
  return out;
}

/** Bins the raw 0..255 frequency-magnitude buffer into `count` log-spaced
 * bands (ear-perceived pitch is roughly logarithmic, so equal-width linear
 * bins would waste most bars on empty high-frequency air) and normalizes to
 * [0, 1] — a real (if coarsened) snapshot of the spectrum, like
 * decimateWaveform() is for the time-domain signal. */
function decimateSpectrumLog(data: Uint8Array, count: number, binHz: number, nyquist: number): Float32Array {
  const out = new Float32Array(count);
  const minHz = Math.min(SPECTRUM_MIN_HZ, nyquist * 0.5);
  const logMin = Math.log(minHz);
  const logMax = Math.log(nyquist);
  for (let i = 0; i < count; i++) {
    const loHz = Math.exp(logMin + ((logMax - logMin) * i) / count);
    const hiHz = Math.exp(logMin + ((logMax - logMin) * (i + 1)) / count);
    const loBin = Math.max(0, Math.min(data.length - 1, Math.floor(loHz / binHz)));
    const hiBin = Math.max(loBin, Math.min(data.length - 1, Math.floor(hiHz / binHz)));
    let sum = 0;
    for (let b = loBin; b <= hiBin; b++) sum += data[b];
    out[i] = sum / (hiBin - loBin + 1) / 255;
  }
  return out;
}

/**
 * Decodes `bytes` (a whole MP3/WAV/FLAC file) and analyzes it at `frameRate`
 * samples per second using an OfflineAudioContext + AnalyserNode, stepped
 * frame-by-frame via suspend/resume — real FFT-based frequency data, but
 * computed ahead of time rather than during playback.
 */
export async function analyzeAudioFile(bytes: Uint8Array, frameRate = 30): Promise<AudioAnalysis> {
  const decodeCtx = new AudioContext();
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
  } finally {
    await decodeCtx.close();
  }

  const duration = audioBuffer.duration;
  const sampleRate = audioBuffer.sampleRate;
  const frameCount = Math.max(1, Math.ceil(duration * frameRate));

  const offlineCtx = new OfflineAudioContext(1, Math.ceil(sampleRate * duration) + 1, sampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  const analyser = offlineCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0; // raw per-instant values — easing/smoothing is the mapping's job, not ours
  source.connect(analyser);
  analyser.connect(offlineCtx.destination);
  source.start(0);

  const nyquist = sampleRate / 2;
  const binHz = nyquist / analyser.frequencyBinCount;
  const toBin = (hz: number) => Math.max(0, Math.min(analyser.frequencyBinCount - 1, Math.round(hz / binHz)));
  const bassBin = [toBin(BASS_HZ[0]), toBin(BASS_HZ[1])];
  const midBin = [toBin(MID_HZ[0]), toBin(MID_HZ[1])];
  const trebleBin = [toBin(TREBLE_HZ[0]), toBin(TREBLE_HZ[1])];

  const bass = new Array<number>(frameCount).fill(0);
  const mid = new Array<number>(frameCount).fill(0);
  const treble = new Array<number>(frameCount).fill(0);
  const amplitude = new Array<number>(frameCount).fill(0);
  const waveform = new Float32Array(frameCount * WAVEFORM_SAMPLES_PER_FRAME);
  const spectrum = new Float32Array(frameCount * SPECTRUM_BINS_PER_FRAME);

  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const timeData = new Uint8Array(analyser.fftSize);

  for (let i = 0; i < frameCount; i++) {
    const t = Math.min(i / frameRate, Math.max(0, duration - 1e-4));
    // All suspend points are scheduled up front, each resolving as
    // rendering reaches it; startRendering() below drives them all.
    offlineCtx.suspend(t).then(() => {
      analyser.getByteFrequencyData(freqData);
      analyser.getByteTimeDomainData(timeData);
      bass[i] = averageBinRange(freqData, bassBin[0], bassBin[1]);
      mid[i] = averageBinRange(freqData, midBin[0], midBin[1]);
      treble[i] = averageBinRange(freqData, trebleBin[0], trebleBin[1]);
      amplitude[i] = rmsAmplitude(timeData);
      waveform.set(decimateWaveform(timeData, WAVEFORM_SAMPLES_PER_FRAME), i * WAVEFORM_SAMPLES_PER_FRAME);
      spectrum.set(decimateSpectrumLog(freqData, SPECTRUM_BINS_PER_FRAME, binHz, nyquist), i * SPECTRUM_BINS_PER_FRAME);
      offlineCtx.resume();
    });
  }

  await offlineCtx.startRendering();

  return {
    duration,
    frameRate,
    bass: shapeForVisuals(bass),
    mid: shapeForVisuals(mid),
    treble: shapeForVisuals(treble),
    amplitude: shapeForVisuals(amplitude),
    kick: onsetPulse(bass),
    waveform,
    waveformSamplesPerFrame: WAVEFORM_SAMPLES_PER_FRAME,
    spectrum,
    spectrumBinsPerFrame: SPECTRUM_BINS_PER_FRAME,
  };
}

/** Value of one band at an arbitrary time, linearly interpolated between the
 * two nearest analysis frames and held at the edges — same shape as
 * Track.evaluate(), so audio behaves like any other time-sampled source. */
export function audioValueAt(analysis: AudioAnalysis, band: AudioBand, time: number): number {
  const series = analysis[band];
  if (series.length === 0) return 0;
  if (series.length === 1 || time <= 0) return series[0];

  const lastTime = (series.length - 1) / analysis.frameRate;
  if (time >= lastTime) return series[series.length - 1];

  const posF = time * analysis.frameRate;
  const i0 = Math.floor(posF);
  const i1 = Math.min(series.length - 1, i0 + 1);
  const t = posF - i0;
  return series[i0] + (series[i1] - series[i0]) * t;
}

/** The waveform snapshot closest to `time` — the nearest analysis frame's
 * samples, not interpolated between frames (an oscilloscope trace is
 * already jagged by nature; snapping to the nearest real snapshot instead
 * of blending two of them keeps it looking like an actual instant of audio
 * rather than an averaged one). */
export function waveformWindowAt(analysis: AudioAnalysis, time: number): Float32Array {
  const perFrame = analysis.waveformSamplesPerFrame;
  const frameCount = analysis.waveform.length / perFrame;
  if (frameCount === 0) return new Float32Array(perFrame);
  const frame = Math.max(0, Math.min(frameCount - 1, Math.round(time * analysis.frameRate)));
  return analysis.waveform.subarray(frame * perFrame, (frame + 1) * perFrame);
}

/** Same idea as waveformWindowAt() but for the frequency spectrum — Bars'
 * equalizer columns for the nearest analysis frame to `time`. */
export function spectrumWindowAt(analysis: AudioAnalysis, time: number): Float32Array {
  const perFrame = analysis.spectrumBinsPerFrame;
  const frameCount = analysis.spectrum.length / perFrame;
  if (frameCount === 0) return new Float32Array(perFrame);
  const frame = Math.max(0, Math.min(frameCount - 1, Math.round(time * analysis.frameRate)));
  return analysis.spectrum.subarray(frame * perFrame, (frame + 1) * perFrame);
}
