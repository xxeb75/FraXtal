---
target: src/App.tsx (whole application)
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-09-05T10-57-55Z
slug: src-app-tsx-whole-application
---
Method: dual-agent (A: general-purpose design review · B: general-purpose detector+browser evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | Good coverage (status bar, save/undo flash, render overlay with clear encoding-phase copy), but camera state only visible in the side panel, not on-canvas during pan/zoom. |
| 2 | Match System / Real World | 1/4 | "Bailout," "Power," "Iterations," "C Real/C Imaginary" go to a neophyte's screen unfiltered on the four core fractal modes — raw math vocabulary with zero translation. |
| 3 | User Control and Freedom | 3/4 | Ctrl+Z undo for Randomize/Preset, R-key/button Reset View, Cancel on render — but no undo for manual slider edits, no redo. |
| 4 | Consistency and Standards | 2/4 | ParameterPanel prints raw `centerX`/`centerY`/`zoom`/`rotation` field names while Timeline humanizes the same data via `paramDisplayLabel()` into "Camera · Center X" — two label systems for one concept. |
| 5 | Error Prevention | 2/4 | Export's failure message still says "is ffmpeg installed?" even though ffmpeg is bundled as a sidecar (no system install needed) — see Priority Issues, this is now a stale/misleading message rather than a missing dependency. Duration input has a `min` but no `max` guard. |
| 6 | Recognition Rather Than Recall | 2/4 | Camera and audio sections get inline hints; Iterations/Bailout/Power/palette sliders get none — pure trial-and-error, reinforced by the detector's 18 undersized-text findings on the very panel-title labels meant to orient the user. |
| 7 | Flexibility and Efficiency | 3/4 | Keyboard shortcuts (Ctrl+Z, R) and a flexible audio-mapping system serve power users; no shortcut-discovery surface for anyone else. |
| 8 | Aesthetic and Minimalist Design | 2/4 | Consistent but generic — the detector's evidence (17 low-vibrancy "AI palette" flags, 7 contrast failures at 3.0:1 against a 4.5:1 floor) shows the minimalism has tipped into under-designed rather than deliberate, undercutting "belle." |
| 9 | Error Recovery | 3/4 | WebGPU error, audio load error, and export failure all surface real inline messages — but the export one is now inaccurate (see above). |
| 10 | Help and Documentation | 1/4 | No help menu, no tooltips on the jargon controls, no onboarding walkthrough anywhere in the app shell. |
| **Total** | | **22/40** | **Poor** |

Both P0/P1 issues below are corroborated by both assessments independently — Assessment A found the jargon and the ffmpeg-message problem by reading source and the live UI; Assessment B's detector found the contrast/text-size problems mechanically, without ever seeing Assessment A's report.

## Design Specificity Verdict

**LLM assessment**: This is a competent, well-engineered **dev-tool/DAW skin** wearing a fractal-generator costume, not a purpose-built "fun, easy, beautiful hypnotic-video generator for a neophyte." The three-column grid (240px sidebar / viewport / 260px sidebar), uniform 10-12px uppercase-tracked labels, flat outline buttons, and a single teal accent are the visual language of Ableton/Blender-adjacent tools — nothing about the composition, color, or copy signals "psychedelic," "hypnotic," or "party visual generator" except the fractal render itself. The team clearly *knows* how to write for a neophyte — Feast/Vortex/Bars relabel raw math params into "Layers," "Distortion," "Speed," "Twist," and preset names like "Toxic Bloom" and "Mathematical Nightmare" have real personality — but that translation work stops at the door of the four original fractal families, where "Bailout," "Power," and "C Real/C Imaginary" go straight to the neophyte's screen unfiltered.

**Deterministic scan**: The static regex detector (`detect.mjs` over `.tsx`/`.css` source) came back clean (0 findings) — it only catches source-level anti-patterns, not rendered-layout issues. The **live browser-injected detector**, run against the actual rendered DOM, found **52 anti-patterns** (its own console summary line said 43 — a discrepancy between the logged count and the raw result array Assessment B could not explain; reporting both numbers as found):
- **undersized-ui-text (18)** — every panel title (FRACTALS/AUDIO/PARAMETERS/CAMERA/PALETTE/COLOR) and every timeline lane label render below the 11px functional floor.
- **ai-color-palette (17)** — the cyan neon active-state text/dots and the swatch gradients read as a generic "AI-generated" palette signature to the detector, echoing the specificity verdict above from an independent, mechanical angle.
- **low-contrast (7)** — 3.0:1 on panel titles and the camera hint text, against a 4.5:1 WCAG AA floor: `#5c5c64` on `#0a0a0c`.
- **tiny-text (3)**, **clipped-overflow-container (3)**, **text-occlusion (2)**, **flat-type-hierarchy (1)**, **overused-font (1, advisory: Inter at 100% of text)**.

One `text-occlusion` finding (RESET VIEW button under the WebGPU error panel) is almost certainly an artifact of this sandbox's missing GPU adapter, not a real defect — flagging it as environment-conditional, not confirmed.

**Visual overlays**: The live overlay was injected and confirmed rendering (orange annotation boxes) in Assessment B's own tab, which was then closed along with its temporary detector server — there is no overlay left open in your browser to view; the findings above are the full list from that run.

## Overall Impression

The engineering is solid and the underlying audio-reactive engine (documented extensively elsewhere in this session) is genuinely impressive — but the UI hasn't caught up to either the "fun party tool" ambition or the "néophyte" requirement. It reads today as a technically-competent internal dev panel that happens to render fractals, not as a beautiful, welcoming instrument. The gap is fixable and partly already solved *inside this same codebase* — Feast/Vortex/Bars prove the team can write approachable copy; that pattern just needs to spread to the other four modes, to the info-architecture (progressive disclosure), and to the type/color system (contrast, text size).

## What's Working

1. **`RenderProgressOverlay.tsx`'s encoding-phase copy** — *"A long export can take several minutes here — this isn't stuck"* — is exactly the kind of specific reassurance most apps skip at a classic high-anxiety wait moment. Keep this pattern and extend it elsewhere (see P1 below on the export finish).
2. **The RANDOMIZE button's exception treatment** (`TopBar.css` `.randomize-button`) — a deliberate visual break from the uniform button style, paired with one-step Ctrl+Z undo, so the "fun" action stays low-risk and single-click. This is the seed of the app's real personality.
3. **Feast/Vortex/Bars' relabeled sliders and the preset names** ("Toxic Bloom," "Mathematical Nightmare") — direct proof the team already has the skill and taste to write for a neophyte. The fix for the biggest issue below is "do more of this," not "learn a new skill."

## Priority Issues

**[P0] Raw fractal-math jargon on the four core modes**
- **What**: Mandelbrot/Julia/Burning Ship/Newton expose "Iterations," "Bailout," "Power," "C Real," "C Imaginary" as primary control labels, with zero explanation anywhere in the UI.
- **Why it matters**: This directly contradicts "accessible à un néophyte" on the app's four most-used modes. A first-time user has no mental model for any of these terms and no inline help to build one — confirmed by both the source read and the live click-through.
- **Fix**: Apply the same relabel pattern already proven in `registry.ts` for Feast/Vortex/Bars — e.g. Iterations → "Detail," Power → "Complexity" — and fold C Real/C Imaginary into a single 2D pad control since they're literally an x/y coordinate pair, not two independent numbers.
- **Suggested command**: `/impeccable clarify`

**[P0] Contrast and text-size floor violated across the panel chrome**
- **What**: Every panel title (FRACTALS, AUDIO, PARAMETERS, CAMERA, PALETTE, COLOR) and every timeline lane label render under the 11px minimum and at 3.0:1 contrast against a 4.5:1 WCAG AA floor (`#5c5c64` on `#0a0a0c`) — 18 undersized-text and 7 low-contrast findings from the live detector.
- **Why it matters**: These are the labels a neophyte relies on most to orient themselves in an unfamiliar tool; if they're hard to read, the "simple and accessible" promise fails at the level of literally reading the screen, before any jargon problem even comes into play.
- **Fix**: Raise panel-title and lane-label font sizes to at least 11-12px and lighten their color to hit 4.5:1 (e.g. `#8a8a94` or brighter on this background) — verify with a contrast checker, not by eye.
- **Suggested command**: `/impeccable typeset`

**[P1] No progressive disclosure — every control dumped at once on first launch**
- **What**: FRACTALS(7) + PARAMETERS + CAMERA(4) + PALETTE(7) + COLOR(6 sliders in one ungrouped block) + AUDIO + TIMELINE + 7 toolbar buttons all appear simultaneously with only a 6-second auto-dismissing pan/zoom hint as any first-run guidance.
- **Why it matters**: Fails 4 of the 8 cognitive-load checklist items at once (single focus, chunking ≤4/group, minimal choices ≤4/decision, progressive disclosure) — textbook overload for exactly the néophyte persona this app needs to win over in its first 10 seconds.
- **Fix**: Gate the raw sliders behind a lightweight "Customize" disclosure until after a first Randomize or Preset click, and visually spotlight RANDOMIZE/PRESETS on first launch instead of showing them as two of nine equal-weight toolbar buttons.
- **Suggested command**: `/impeccable onboard`

**[P1] Export's error message and internal comment are now stale and misleading**
- **What**: `TopBar.tsx`'s catch block still shows "Export failed — is ffmpeg installed?" and `VideoExporter.ts`'s own header comment still says it "hands the sequence to a system `ffmpeg`" — but ffmpeg has been bundled as a Tauri sidecar earlier in this project (no system install required at all anymore).
- **Why it matters**: If export ever fails for an unrelated reason (bad frame, disk full, corrupt PNG), a user — especially a néophyte with zero mental model of what "ffmpeg" even is — gets sent looking to install a tool that's already bundled inside the app, which is actively worse than a vaguer message would be.
- **Fix**: Replace the ffmpeg-specific guess with the actual error detail (already captured in the thrown error's message/stderr) or a generic "Export failed — see details" that surfaces the real cause; update the stale sidecar comment while in there.
- **Suggested command**: `/impeccable clarify`

**[P2] Two label systems for the same camera data**
- **What**: `ParameterPanel.tsx` prints raw `centerX`/`centerY`/`zoom`/`rotation` field names while `Timeline.tsx`'s `paramDisplayLabel()` shows the identical data as "Camera · Center X."
- **Why it matters**: Breaks the consistency heuristic and reads as an unfinished dev-tool artifact sitting right next to the app's own better copy — an easy, self-inflicted inconsistency.
- **Fix**: Route the CAMERA rows in ParameterPanel through the existing `CAMERA_FIELD_LABELS` map in `paramKeys.ts` instead of printing the raw field name.
- **Suggested command**: `/impeccable polish`

**[P3] The "party visual" modes have zero one-click presets**
- **What**: All 5 existing presets target Mandelbrot/Julia/Burning Ship/Newton; Feast, Vortex, and Bars — the least jargon-dependent, most "just make something cool" modes — have none.
- **Why it matters**: The modes best suited to a neophyte's instinct to just click something and see magic are the ones with no one-click starting point.
- **Fix**: Add at least one curated preset per generative mode.
- **Suggested command**: `/impeccable distill`

## Persona Red Flags

**Jordan (First-Timer, total neophyte)**: Lands on Mandelbrot's default view and sees "Iterations / Bailout / Power" in barely-legible 10-11px gray-on-black text before ever noticing RANDOMIZE or PRESETS exist among 7 visually-equal toolbar buttons. Clicks RANDOMIZE, and the Timeline suddenly grows 7+ keyframe lanes with diamond markers — a mechanic never explained anywhere. Almost certainly has no ffmpeg installed as a system tool (though the app no longer needs one!) and would be sent on a wild goose chase if export ever failed and hit that stale message.

**Party VJ / Performer** (the audio-reactive priority this project has been built around): Feast/Vortex/Bars — the modes actually built for a live party set — have no presets to jump-start a look mid-performance. Audio mappings are added one at a time via "+ Add mapping" with no quick "reactive template," and nothing in the visible UI shows BPM/tempo — only band amplitude — so beat-locking for a live set isn't visibly supported despite audio-reactivity being this app's stated core priority.

## Minor Observations

- RANDOMIZE's accessible name resolves to its `title` tooltip ("Last seed: 0") rather than its visible label — a screen reader announces the wrong thing.
- The preset cards in the PRESETS modal are `button` elements with no accessible name at the button level (only child text nodes carry it) — 5 unlabeled buttons for assistive tech, versus the palette swatches which get this right.
- The 7-swatch palette grid in a 3-column layout leaves an orphaned single swatch on the last row; same asymmetry appears in the PRESETS modal's 5-card, 3-column grid.
- The play/transport control is labeled only "▶" with no text alternative.
- "AUDIO_BAND_LABELS" uses "Amplitude" — more technical than "Volume" for the same concept a neophyte needs to understand.
- The "Random" palette swatch silently re-rolls colors on every click with no visible shuffle affordance beyond the static label.

## Questions to Consider

1. If Randomize and Presets are the closest thing this app has to its own identity, why do they sit visually equal to Open/Save/Export instead of anchoring the entire first-run experience?
2. Would a genuine neophyte ever willingly touch a "Bailout" slider — and if not, why is it in the primary panel instead of behind an Advanced disclosure?
3. Now that Feast/Vortex/Bars have proven the relabel-and-befriend approach works, what's stopping the same treatment from reaching Mandelbrot/Julia/Burning Ship/Newton before the next release?
