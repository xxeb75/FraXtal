import { FRACTAL_REGISTRY } from "../../engine/fractals/registry";
import { useEditorStore } from "../../store/editorStore";
import "./FractalSelector.css";

export function FractalSelector() {
  const selectedId = useEditorStore((s) => s.selectedFractalId);
  const setSelectedId = useEditorStore((s) => s.setSelectedFractalId);

  return (
    <div className="fractal-selector">
      <div className="panel-title">FRACTALS</div>
      <ul className="fractal-list">
        {FRACTAL_REGISTRY.map((f) => (
          <li key={f.id}>
            <button
              className={f.id === selectedId ? "active" : ""}
              onClick={() => setSelectedId(f.id)}
            >
              {f.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
