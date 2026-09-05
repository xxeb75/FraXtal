import type { CameraState } from "../../types/project";

const DEFAULT_STATE: CameraState = { centerX: -0.5, centerY: 0, zoom: 1, rotation: 0 };

/**
 * Owns pan/zoom/rotate math for the fractal viewport. Deliberately framework-
 * free — the viewport drives it from pointer events, the offline renderer
 * drives it from AnimationEngine output, neither depends on the other.
 *
 * Zoom is stored and changed multiplicatively, never lerped linearly, so
 * scrolling feels consistent whether you're at zoom 1 or zoom 1e8.
 */
export class Camera {
  private state: CameraState = { ...DEFAULT_STATE };

  getState(): CameraState {
    return { ...this.state };
  }

  setState(partial: Partial<CameraState>): void {
    this.state = { ...this.state, ...partial };
  }

  reset(state: CameraState = DEFAULT_STATE): void {
    this.state = { ...state };
  }

  private screenToComplex(pixelX: number, pixelY: number, width: number, height: number): [number, number] {
    const aspect = width / height;
    const scale = 4 / this.state.zoom;
    const px = (pixelX / width - 0.5) * aspect * scale;
    const py = (0.5 - pixelY / height) * scale;

    const s = Math.sin(this.state.rotation);
    const c = Math.cos(this.state.rotation);
    const rx = px * c - py * s;
    const ry = px * s + py * c;

    return [this.state.centerX + rx, this.state.centerY + ry];
  }

  pan(dxPixels: number, dyPixels: number, width: number, height: number): void {
    const aspect = width / height;
    const scale = 4 / this.state.zoom;
    const dx = -(dxPixels / width) * aspect * scale;
    const dy = (dyPixels / height) * scale;

    const s = Math.sin(this.state.rotation);
    const c = Math.cos(this.state.rotation);
    this.state.centerX += dx * c - dy * s;
    this.state.centerY += dx * s + dy * c;
  }

  /** Zooms by `factor` (multiplicative) while keeping the point under the cursor fixed. */
  zoomAt(pixelX: number, pixelY: number, width: number, height: number, factor: number): void {
    const [beforeX, beforeY] = this.screenToComplex(pixelX, pixelY, width, height);
    this.state.zoom = Math.max(1e-6, this.state.zoom * factor);
    const [afterX, afterY] = this.screenToComplex(pixelX, pixelY, width, height);
    this.state.centerX += beforeX - afterX;
    this.state.centerY += beforeY - afterY;
  }

  recenterAt(pixelX: number, pixelY: number, width: number, height: number): void {
    const [cx, cy] = this.screenToComplex(pixelX, pixelY, width, height);
    this.state.centerX = cx;
    this.state.centerY = cy;
  }
}
