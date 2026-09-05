import { useEffect } from "react";
import { PRESETS, getPreset } from "../../presets/registry";
import { applyPreset } from "../../presets/applyPreset";
import { PALETTES } from "../../engine/color/palettes";
import { useEditorStore } from "../../store/editorStore";
import { sequenceTotalDuration } from "../../engine/sequence/Sequence";
import "./PresetBrowser.css";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * The "YOUR SEQUENCE" scene-chaining builder (HeavyM-inspired, user request
 * 2026-09-05), living inside the existing PRESETS modal rather than a new
 * always-visible panel — costs the main screen nothing when unused, which
 * matters given impeccable critique's repeated "first screen too dense"
 * finding. Each row is one preset held for its own number of seconds before
 * crossfading into the next (engine/sequence/Sequence.ts does the actual
 * per-frame resolution, live and on export alike). Only shown once at least
 * one scene has been added via a card's "+ Sequence" button below.
 */
function SequenceSection() {
  const sequence = useEditorStore((s) => s.sequence);
  const transitionSeconds = useEditorStore((s) => s.sequenceTransitionSeconds);
  const sequenceActive = useEditorStore((s) => s.sequenceActive);
  const removeSequenceStep = useEditorStore((s) => s.removeSequenceStep);
  const moveSequenceStep = useEditorStore((s) => s.moveSequenceStep);
  const setSequenceStepHold = useEditorStore((s) => s.setSequenceStepHold);
  const setSequenceTransitionSeconds = useEditorStore((s) => s.setSequenceTransitionSeconds);
  const setSequenceActive = useEditorStore((s) => s.setSequenceActive);
  const clearSequence = useEditorStore((s) => s.clearSequence);
  const togglePresetBrowser = useEditorStore((s) => s.togglePresetBrowser);

  if (sequence.length === 0) return null;

  const total = sequenceTotalDuration(sequence);

  return (
    <div className="sequence-section">
      <div className="sequence-section-head">
        <span className="panel-title">YOUR SEQUENCE — {formatDuration(total)}</span>
        <button className="sequence-clear" onClick={clearSequence}>
          Clear
        </button>
      </div>

      <div className="sequence-list">
        {sequence.map((step, i) => {
          const preset = getPreset(step.presetId);
          return (
            <div className="sequence-row" key={`${step.presetId}-${i}`}>
              <span className="sequence-row-index">{i + 1}</span>
              <span className="sequence-row-name">{preset?.name ?? step.presetId}</span>
              <input
                className="sequence-row-hold"
                type="number"
                min={1}
                step={1}
                value={step.holdSeconds}
                onChange={(e) => setSequenceStepHold(i, Number(e.target.value))}
                title="Seconds this scene holds before crossfading to the next"
              />
              <span className="sequence-row-unit">s</span>
              <button
                className="sequence-row-move"
                onClick={() => moveSequenceStep(i, -1)}
                disabled={i === 0}
                aria-label={`Move ${preset?.name ?? "scene"} earlier in the sequence`}
              >
                ↑
              </button>
              <button
                className="sequence-row-move"
                onClick={() => moveSequenceStep(i, 1)}
                disabled={i === sequence.length - 1}
                aria-label={`Move ${preset?.name ?? "scene"} later in the sequence`}
              >
                ↓
              </button>
              <button
                className="sequence-row-remove"
                onClick={() => removeSequenceStep(i)}
                aria-label={`Remove ${preset?.name ?? "scene"} from the sequence`}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <div className="sequence-controls">
        <label className="sequence-transition">
          Crossfade
          <input
            type="number"
            min={0}
            step={0.5}
            value={transitionSeconds}
            onChange={(e) => setSequenceTransitionSeconds(Number(e.target.value))}
          />
          s
        </label>
        <button
          className="sequence-play-button"
          onClick={() => {
            setSequenceActive(true);
            togglePresetBrowser();
          }}
        >
          ▶ Play Sequence
        </button>
      </div>
      {sequenceActive && (
        <div className="sequence-playing-hint">Playing now in the viewport — EXPORT renders the whole sequence.</div>
      )}
    </div>
  );
}

// A full composition per card — fractal, camera, params, color, and often
// motion — applied in one click. Presets are pure data (presets/registry.ts);
// this component only ever renders the list and calls the one generic
// applyPreset(), so adding a preset never touches this file. Each card also
// has its own small "+ Sequence" corner button (separate click target,
// stopPropagation not even needed since it's a sibling of the apply button
// rather than nested inside it) to add that preset as a scene instead of
// applying it immediately.
export function PresetBrowser() {
  const open = useEditorStore((s) => s.presetBrowserOpen);
  const togglePresetBrowser = useEditorStore((s) => s.togglePresetBrowser);
  const addSequenceStep = useEditorStore((s) => s.addSequenceStep);
  const setSequenceActive = useEditorStore((s) => s.setSequenceActive);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") togglePresetBrowser();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, togglePresetBrowser]);

  if (!open) return null;

  return (
    <div className="preset-backdrop" onClick={togglePresetBrowser}>
      <div className="preset-panel" onClick={(e) => e.stopPropagation()}>
        <div className="preset-panel-head">
          <span className="panel-title">PRESETS</span>
          <button className="preset-close" onClick={togglePresetBrowser} aria-label="Close">
            ✕
          </button>
        </div>

        <SequenceSection />

        <div className="preset-grid">
          {PRESETS.map((p) => (
            <div className="preset-card" key={p.id}>
              <button
                className="preset-card-apply"
                aria-label={`${p.name} — ${p.description}`}
                onClick={() => {
                  // Applying a single preset directly always means "show me
                  // just this" — leaving a sequence running underneath would
                  // make the click look like it did nothing (the render loop
                  // keeps favoring sequence mode every frame).
                  setSequenceActive(false);
                  applyPreset(p);
                  togglePresetBrowser();
                }}
              >
                <div className="preset-card-swatch" style={{ background: PALETTES[p.color.paletteId]?.preview }} />
                <div className="preset-card-name">{p.name}</div>
                <div className="preset-card-desc">{p.description}</div>
              </button>
              <button
                className="preset-card-add-seq"
                onClick={() => addSequenceStep(p.id)}
                title={`Add ${p.name} to your sequence`}
                aria-label={`Add ${p.name} to sequence`}
              >
                + Sequence
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
