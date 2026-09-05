---
target: src/App.tsx (whole application)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-09-05T11-37-47Z
slug: src-app-tsx-whole-application
---
Method: dual-agent (A: general-purpose design review · B: general-purpose detector+browser evidence) — re-run after the first round of fixes.

## Design Health Score

**27/40** (up from 22/40) — "Acceptable" band. Every heuristic held or improved; the two that moved most were Match System/Real World (1→3, the jargon relabel) and Aesthetic/Minimalist (2→3).

## Design Specificity Verdict

The relabeled params (Detail/Threshold/Complexity/Shape X/Shape Y, Feast/Vortex/Bars' own vocabulary) and the 8 personality-rich presets are confirmed working and read as genuinely authored, not generic. The chrome around them (11px labels, thin borders, flat panels, one accent plus the new magenta) still reads as tasteful-minimalist-dev-tool rather than "belle" — that gap is about the shell's own visual richness, not labels/contrast anymore.

## Deterministic scan

Live detector: **13 findings** (down from 52; my own spot-check earlier landed at 10 — small session-state variance, both a large drop). Breakdown: 4 `ai-color-palette` (palette swatch color previews — inherent to what they display), 3 `tiny-text` on already-fixed 11px elements (soft advisory floor, not the old hard violation), 1 `overused-font` + 1 `flat-type-hierarchy` (both body-level advisories), and **4 real `text-occlusion` findings** — some environment-specific, but two are NOT:
- "Monochrome" palette name 84% covered by a file-button
- "CAMERA" panel title 84% covered by a file-button

Both assessments independently ran fresh against the live app — B never saw A's report or vice versa.

## What's Working (confirmed)

1. Jargon relabel + hints — verified live, hovering "Detail" shows the plain-language tooltip.
2. Customize disclosure — verified collapsed by default, PALETTE/CAMERA visible immediately.
3. 8 presets with real personality — confirmed rendering correctly.

## New Priority Issues

**[P0] Reset View silently deletes all animation — no undo, no warning**
- **What**: `FractalViewport.tsx`'s `handleResetView()` calls `s.clearAllKeyframes()` unconditionally on every click of the visible "RESET VIEW" button or the bare "R" key — wiping camera, fractal-param, and color keyframes together, with no `setUndoSnapshot` call.
- **Why it matters**: this is a regression I introduced myself earlier this session, fixing "Reset View does nothing" by making it clear everything — but Randomize and Preset-apply both snapshot first for exactly this reason, and Reset View doesn't. A neophyte who's built up motion loses it in one keypress with zero recovery.
- **Fix**: call `s.setUndoSnapshot(buildProjectFromStore())` before the clear, same pattern already used by Randomize.
- **Suggested command**: `harden`

**[P1] Customize toggle has no way back once opened**
- **What**: clicking "⚙ Customize parameters & color" reveals PARAMETERS/COLOR permanently for the session — B confirmed no "Hide" affordance exists anywhere in the DOM afterward.
- **Why it matters**: a user who opens it to peek loses the calmer default view for good (until app restart clears nothing — the choice is `localStorage`-persisted forever).
- **Fix**: let the same button toggle closed again.
- **Suggested command**: `polish`

**[P1] Audio mapping editor is fully exposed, unfiltered jargon**
- **What**: `AudioSection.tsx` shows unlimited "Bass → Zoom, Amount 0.30"-style rows with no explanation, always visible once a track loads — the Customize pattern was never applied here.
- **Why it matters**: audio-reactivity is this project's stated core priority; its most technical surface is the one area that skipped the exact fix already proven elsewhere.
- **Suggested command**: `distill`

**[P2] Two real text-occlusion bugs**: "Monochrome" palette name and "CAMERA" panel title each 84% covered by a file-button in the current layout (not the GPU-sandbox artifact — confirmed on real layout).
- **Suggested command**: `layout`

**[P2] Keyframe dots are indistinguishable to screen readers**: all ~12 share the exact aria-label "Add keyframe at current time."
- **Suggested command**: `clarify`

## Minor Observations

- Fractal-selector shows two buttons highlighted "active" for ~1-2s during a switch (B saw this in 5 of 6 clicks) — likely a transition-timing artifact, not confirmed as a state bug.
- No `aria-pressed` on fractal-selector or palette-swatch selection state (color-only).
- Presets modal lacks `role="dialog"`/`aria-modal`.
- Export success still resolves to a 2.5s text flash with no "show in folder."

## Trend

**src-app-tsx-whole-application: 22 → 27 (out of 40)**
