import { useEffect } from "react";
import { PRESETS } from "../../presets/registry";
import { applyPreset } from "../../presets/applyPreset";
import { PALETTES } from "../../engine/color/palettes";
import { useEditorStore } from "../../store/editorStore";
import "./PresetBrowser.css";

// A full composition per card — fractal, camera, params, color, and often
// motion — applied in one click. Presets are pure data (presets/registry.ts);
// this component only ever renders the list and calls the one generic
// applyPreset(), so adding a preset never touches this file.
export function PresetBrowser() {
  const open = useEditorStore((s) => s.presetBrowserOpen);
  const togglePresetBrowser = useEditorStore((s) => s.togglePresetBrowser);

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
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className="preset-card"
              aria-label={`${p.name} — ${p.description}`}
              onClick={() => {
                applyPreset(p);
                togglePresetBrowser();
              }}
            >
              <div className="preset-card-swatch" style={{ background: PALETTES[p.color.paletteId]?.preview }} />
              <div className="preset-card-name">{p.name}</div>
              <div className="preset-card-desc">{p.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
