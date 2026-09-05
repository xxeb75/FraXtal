# FraXtal

A desktop app (Windows/macOS, built with Tauri + React + WebGPU) that turns fractals into hypnotic, audio-reactive generative video — for VJs, visual artists, and anyone who wants a music video made out of math.

## What it does

- **Fractal engine, rendered live on the GPU** — Mandelbrot, Julia, Burning Ship, Newton, plus three generative/audio-native modes: Feast (plasma + oscilloscope), Vortex (neon tunnel), and Bars (a real-time spectrum equalizer).
- **Audio-reactive by design** — load a local track or a YouTube link, and map any frequency band (bass/mid/treble/volume/kick) onto any parameter (zoom, rotation, color, the fractal's own shape) with an adjustable amount. Kick-drum onset detection drives sharp, percussive hits distinct from a smooth bass sway.
- **Keyframe animation** — camera, color, and every fractal parameter can be keyframed and scrubbed on a timeline, with a curated set of presets to start from.
- **Scene sequencing** — chain several presets into a set with crossfade transitions between them, like a VJ building a show out of scenes.
- **Live drawing** — draw or type text directly on the viewport; it shatters and fades in time with the kick drum, live and in the exported video.
- **Two-layer compositing** — stack two fractal modes together (e.g. Bars over Vortex) for a richer look.
- **Video export** — renders the full timeline frame-by-frame and muxes it with the loaded audio into an MP4, independent of the live preview's frame rate or window size.

## Requirements

- Windows 10/11 or macOS, with a GPU that supports WebGPU.
- Node.js and Rust (stable toolchain) to build from source.

## Development

```bash
npm install
npm run dev        # web preview only (no native window)
npx tauri dev       # full desktop app with hot reload
npx tauri build      # release installer (.msi / NSIS .exe on Windows)
```

Run the test suite with:

```bash
npm test
```

## License

MIT — see [LICENSE](LICENSE).
