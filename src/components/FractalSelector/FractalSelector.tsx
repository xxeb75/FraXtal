import { FRACTAL_REGISTRY } from "../../engine/fractals/registry";
import { useEditorStore } from "../../store/editorStore";
import "./FractalSelector.css";

// The name picks which mode is Layer A (the primary render); the checkbox
// next to any *other* mode adds it as Layer B, additively composited on top
// (WebGPURenderer.renderComposite) — e.g. Bars' equalizer over Feast's
// plasma. Only one Layer B at a time for now: checking a different mode
// just moves the checkmark, it doesn't stack a third.
export function FractalSelector() {
  const selectedId = useEditorStore((s) => s.selectedFractalId);
  const setSelectedId = useEditorStore((s) => s.setSelectedFractalId);
  const layerBId = useEditorStore((s) => s.layerBFractalId);
  const setLayerBId = useEditorStore((s) => s.setLayerBFractalId);

  const selectedName = FRACTAL_REGISTRY.find((f) => f.id === selectedId)?.name;
  const layerBName = FRACTAL_REGISTRY.find((f) => f.id === layerBId)?.name;

  return (
    <div className="fractal-selector">
      <div className="panel-title">FRACTALS</div>
      <ul className="fractal-list">
        {FRACTAL_REGISTRY.map((f) => (
          <li key={f.id} className="fractal-list-row">
            <button className={f.id === selectedId ? "active" : ""} onClick={() => setSelectedId(f.id)}>
              {f.name}
            </button>
            {f.id !== selectedId && (
              <input
                type="checkbox"
                className="fractal-layer-checkbox"
                checked={layerBId === f.id}
                onChange={(e) => setLayerBId(e.target.checked ? f.id : null)}
                title={`Layer ${f.name} over ${selectedName}`}
                aria-label={`Layer ${f.name} over ${selectedName}`}
              />
            )}
          </li>
        ))}
      </ul>
      {layerBId && (
        <div className="fractal-layer-hint">
          Layered: {selectedName} + {layerBName}
        </div>
      )}
    </div>
  );
}
