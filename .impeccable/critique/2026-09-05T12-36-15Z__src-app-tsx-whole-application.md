---
target: src/App.tsx (whole application)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-09-05T12-36-15Z
slug: src-app-tsx-whole-application
---
Method: dual-agent (A: general-purpose design review · B: general-purpose detector+browser evidence) — third independent re-run.

## Design Health Score

**27/40** (unchanged from round 2, but the specific gaps moved: round 2's fixes — Reset View undo, Customize toggle, contrast, jargon — all held; the new gap is the Layer B compositing feature, shipped without the same design attention as the rest of the app).

## Design Specificity Verdict

Confirmed authored, not generic: the single-loud-accent rule (RANDOMIZE alone gets `--accent-wild`), plain-language param labels, and 8 curated presets (now covering all 7 fractal families) all show real point of view. The one exception is the new **Layer B checkbox** (FractalSelector) — built and shipped as an engineering feature with zero design communication: no visible label, no icon, no copy, discoverable only by hovering long enough for a native tooltip. It reads like a leftover settings toggle sitting inside an otherwise-considered interface.

## Deterministic scan

**10 findings** (down from 13, further down from 52 originally). Breakdown: `ai-color-palette` (5 — palette swatch color previews, inherent to what they show), `tiny-text` (3 — nav-hint, GPU-error text, camera-hint, all already at the 11px floor), `text-occlusion` (2 — nav-hint and RESET VIEW covered by the WebGPU-unavailable panel), `overused-font` + `flat-type-hierarchy` (2, body-level advisories). The two occlusion findings are almost certainly the GPU-sandbox's "unavailable" overlay sitting over viewport controls, not a real-hardware bug — consistent with what's been seen in every prior run.

Static scan: clean (0).

One cross-check worth naming: Assessment B independently observed the Julia layer checkbox appearing checked with a "Layered: Mandelbrot + Julia" indicator active, without a deliberate click in its own action log — reported as an unexplained observation, not a confirmed bug (could be residual state from a shared browser tab across test runs). Flagging it here since it's the same feature Assessment A flags as the round's biggest design gap, from two assessments that never saw each other's output.

## What's Working (confirmed again)

1. The cross-cutting undo-snapshot pattern (Randomize, Preset apply, Reset View, Clear Keyframes) — B confirmed the Customize toggle now genuinely opens AND closes.
2. 8 presets, all real personality, now covering Feast/Vortex/Bars too.
3. Every keyframe dot has its own accessible name — B confirmed this directly in the accessibility tree.

## Priority Issues

**[P0] Layer B (the "superpose two modes" checkbox) is functionally unexplained**
- **What**: `FractalSelector.tsx`'s per-row checkbox next to each non-selected fractal has no visible label, icon, or inline copy — only a native tooltip after ~1s of hovering ("Layer Julia over Mandelbrot").
- **Why it matters**: this is the newest, most novel feature in the app and the least discoverable one — a neophyte will either never find it or click it by accident and get a "Layered: X + Y" result with no idea why, the exact disorientation the team already fixed for viewport panning earlier this session.
- **Fix**: add a small always-visible chip/icon (e.g. "+layer") next to the checkbox rather than relying on hover-only discovery, and/or a one-time inline hint the first time a track/fractal is loaded.
- **Suggested command**: `/impeccable clarify`

**[P1] Parameter/color hint tooltips are invisible affordances**
- **What**: the plain-language hints written for every slider (`registry.ts`) are bare `title` attributes on block-level rows with no visual cue that hovering reveals anything.
- **Why it matters**: genuinely good neophyte-facing copy is invisible to the audience it was written for.
- **Fix**: add a small persistent (?) glyph or dotted-underline next to hoverable labels.
- **Suggested command**: `/impeccable clarify`

**[P1] Quit has no unsaved-work guard**
- **What**: the ✕ button closes the app immediately — no confirmation, no undo snapshot — while Randomize/Preset/Reset View/Clear Keyframes all got one this round.
- **Why it matters**: it's the single highest-stakes action (total loss, not just a reset) and the one with the least protection, inconsistent with the app's own established safety pattern.
- **Fix**: confirm once if there's unsaved work or an active export when Quit/window-close fires.
- **Suggested command**: `/impeccable harden`

**[P2] First screen is still dense**
- **What**: even with PARAMETERS/COLOR collapsed, the default view shows 7 fractal names + 7 layer checkboxes + 7 palette swatches + 4 live camera decimal readouts at once — the camera numbers are pure telemetry with no first-glance value to a neophyte.
- **Fix**: fold the CAMERA numeric readout into the same Customize disclosure, leaving FRACTALS + PALETTE + RANDOMIZE/PRESETS as the only always-visible layer.
- **Suggested command**: `/impeccable distill`

**[P3] Export success is emotionally flat**
- **What**: `flashStatus("Video exported")` uses the identical 2.5s toast as "Saved"/"Opened."
- **Fix**: give export success its own distinct beat — accent-colored confirmation, "reveal in folder."
- **Suggested command**: `/impeccable delight`

## Persona Red Flags

**Jordan (First-Timer)**: lands on 7 fractal names plus 7 mystery checkboxes with no idea what they are before any hint fires; the RANDOMIZE/PRESETS spotlight lasts ~5s and never explains *why* those two buttons matter over the other 7 in the top bar; camera numbers ("Center X -0.5000") read as a broken spreadsheet with no frame of reference yet.

**Dana, Weekend VJ** (audio-reactive is the project's stated core priority): the mapping UI she cares most about is now behind an extra click (reasonable for neophytes) but nothing ambient confirms audio-reactivity is live while it's collapsed; no waveform or level meter anywhere in AudioSection — she tunes "Amount" sliders blind.

## Minor Observations

- Small interactive targets: 13×13px layer checkbox, ~14px keyframe dot, tiny "×" remove buttons — tight for trackpad/motor-impaired use.
- `.render-title` (RENDERING/ENCODING VIDEO label) and `.timeline-lanes-count` still render at `--text-faint` (~2.9:1) — missed in the earlier contrast pass; the render-title is the label of the app's highest-stakes dialog.
- FractalSelector's row rhythm is uneven: the selected row has no checkbox, others do, creating visual asymmetry down the list.

## Questions to Consider

1. If Layer B is meant to be a delightful power feature, why does it launch with less design attention than Randomize/Presets got?
2. Should CAMERA even outrank PARAMETERS in default visibility, given its numbers mean nothing to the audience until they opt into Customize?
3. Given audio-reactivity is the stated core priority, is collapsing its mapping UI by default the right call, or should one mapping row stay open so the feature doesn't look like an afterthought next to Randomize/Presets?
