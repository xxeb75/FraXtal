import { useState } from "react";
import { getFractalDefinition } from "../../engine/fractals/registry";
import type { FractalRenderParams } from "../../engine/fractals/defaults";
import { PALETTES } from "../../engine/color/palettes";
import { cameraParamKey, colorParamKey, fractalParamKey, CAMERA_FIELD_LABELS } from "../../engine/animation/paramKeys";
import { useEditorStore } from "../../store/editorStore";
import type { ColorSettings } from "../../engine/renderer/FrameRenderer";
import "./ParameterPanel.css";

const KEYFRAME_EPSILON = 0.001;
const CUSTOMIZE_STORAGE_KEY = "fraxtal-customize-open";

/** The small "●" toggle next to an animatable control: click records the
 * control's current value as a keyframe at the playhead's current time.
 * Lit (accent) when a keyframe already sits exactly there. */
function KeyframeDot({ paramId, value }: { paramId: string; value: number }) {
  const currentTime = useEditorStore((s) => s.currentTime);
  const keyframes = useEditorStore((s) => s.keyframesByParam[paramId]);
  const addOrUpdateKeyframe = useEditorStore((s) => s.addOrUpdateKeyframe);
  const hasHere = keyframes?.some((k) => Math.abs(k.time - currentTime) < KEYFRAME_EPSILON) ?? false;

  return (
    <button
      type="button"
      className={hasHere ? "kf-dot active" : "kf-dot"}
      title={hasHere ? "Keyframe at current time" : "Add keyframe at current time"}
      onClick={() => addOrUpdateKeyframe(paramId, currentTime, value, "smooth")}
    >
      ●
    </button>
  );
}

interface ColorSliderDef {
  field: keyof ColorSettings;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
}

const COLOR_SLIDERS: ColorSliderDef[] = [
  { field: "paletteOffset", label: "Palette Offset", min: 0, max: 1, step: 0.01, hint: "Shifts where the palette starts — slides the same colors around the fractal." },
  { field: "paletteScale", label: "Palette Scale", min: 0.1, max: 5, step: 0.01, hint: "Stretches or squeezes the palette — higher repeats the colors more often across the shape." },
  { field: "brightness", label: "Brightness", min: 0, max: 2, step: 0.01, hint: "Overall lightness of the image." },
  { field: "contrast", label: "Contrast", min: 0, max: 2, step: 0.01, hint: "Difference between light and dark areas — higher is punchier." },
  { field: "gamma", label: "Gamma", min: 0.1, max: 3, step: 0.01, hint: "Shifts the balance between shadows and highlights without changing overall brightness." },
  { field: "paletteSeed", label: "Palette Seed", min: 0, max: 1000, step: 1, hint: "Only affects the \"Random\" palette — change this to get a different random color set." },
];

// Generic parameter panel: every control below is generated from
// FractalDefinition.parameters (registry.ts) rather than hardcoded per
// fractal — adding a fractal only means adding its descriptor, not a
// bespoke slider. Every animatable control gets a keyframe dot (Phase 9),
// including color — palette id itself morphs smoothly between families
// when keyframed (see palette() in common.wgsl), not just the numeric knobs.
//
// Fine-tuning controls (the fractal's own sliders, and the COLOR section's
// 6 sliders) sit behind a "Customize" disclosure, closed by default —
// impeccable critique (2026-09-05) flagged every control dumped on screen
// at once as the app's biggest first-impression problem. PALETTE (one-click
// swatches) and CAMERA (read-only position + the drag/scroll hint) stay
// visible; those are the "just click something and it looks good" layer a
// first-time user actually wants. Once opened, it stays open (localStorage,
// same pattern as the viewport's nav hint) — this isn't a tutorial to
// re-hide, it's a density preference.
export function ParameterPanel() {
  const selectedId = useEditorStore((s) => s.selectedFractalId);
  const def = getFractalDefinition(selectedId);
  const params = useEditorStore((s) => s.paramsByFractal[selectedId]);
  const setParam = useEditorStore((s) => s.setParam);
  const camera = useEditorStore((s) => s.camera);

  const color = useEditorStore((s) => s.color);
  const setColorField = useEditorStore((s) => s.setColorField);

  const [customizeOpen, setCustomizeOpen] = useState(() => {
    try {
      return localStorage.getItem(CUSTOMIZE_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const openCustomize = () => {
    setCustomizeOpen(true);
    try {
      localStorage.setItem(CUSTOMIZE_STORAGE_KEY, "true");
    } catch {
      // Private/blocked storage — it just re-collapses next launch, harmless.
    }
  };

  return (
    <div className="parameter-panel">
      <div className="panel-title palette-title">PALETTE</div>
      <div className="palette-row-head">
        <div className="palette-grid">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              className={p.id === color.paletteId ? "swatch active" : "swatch"}
              style={{ background: p.preview }}
              onClick={() => {
                setColorField("paletteId", p.id);
                // Random re-rolls its coefficients on every click, even if
                // it was already selected — that's the whole point of it.
                if (p.id === 6) setColorField("paletteSeed", Math.random() * 1000);
              }}
              title={p.name}
              aria-label={p.name}
              aria-pressed={p.id === color.paletteId}
            />
          ))}
        </div>
        <KeyframeDot paramId={colorParamKey("paletteId")} value={color.paletteId} />
      </div>
      <div className="palette-name">{PALETTES.find((p) => p.id === color.paletteId)?.name}</div>

      <div className="panel-title">CAMERA</div>
      {(["centerX", "centerY", "zoom", "rotation"] as const).map((field) => (
        <div className="camera-row" key={field}>
          <span className="camera-label">{CAMERA_FIELD_LABELS[field]}</span>
          <span className="param-value">{camera[field].toFixed(field === "zoom" ? 2 : 4)}</span>
          <KeyframeDot paramId={cameraParamKey(field)} value={camera[field]} />
        </div>
      ))}
      <div className="camera-hint">Drag/scroll the viewport to move the camera — the dot records it here.</div>

      {!customizeOpen && (
        <button type="button" className="customize-toggle" onClick={openCustomize}>
          ⚙ Customize parameters &amp; color
        </button>
      )}

      {customizeOpen && (
        <>
          <div className="panel-title">PARAMETERS</div>
          {def?.parameters.map((p) => {
            if (p.type !== "number") return null;
            const value = params[p.id as keyof FractalRenderParams] as number;
            return (
              <div className="param-row" key={p.id} title={p.hint}>
                <div className="param-row-head">
                  <span>{p.label}</span>
                  <span className="param-row-controls">
                    <span className="param-value">{formatValue(value, p.step)}</span>
                    {p.animatable && <KeyframeDot paramId={fractalParamKey(selectedId, p.id)} value={value} />}
                  </span>
                </div>
                <input
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={value}
                  onChange={(e) => setParam(selectedId, p.id as keyof FractalRenderParams, Number(e.target.value))}
                />
              </div>
            );
          })}

          <div className="panel-title palette-title">COLOR</div>
          {COLOR_SLIDERS.map((s) => {
            const value = color[s.field];
            return (
              <div className="param-row" key={s.field} title={s.hint}>
                <div className="param-row-head">
                  <span>{s.label}</span>
                  <span className="param-row-controls">
                    <span className="param-value">{formatValue(value, s.step)}</span>
                    <KeyframeDot paramId={colorParamKey(s.field)} value={value} />
                  </span>
                </div>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={value}
                  onChange={(e) => setColorField(s.field, Number(e.target.value))}
                />
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function formatValue(value: number, step: number | undefined): string {
  const decimals = step && step < 1 ? Math.min(3, -Math.floor(Math.log10(step))) : 0;
  return value.toFixed(decimals);
}
