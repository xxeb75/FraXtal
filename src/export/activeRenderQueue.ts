import type { RenderQueue } from "./RenderQueue";

// The currently-running RenderQueue, if any — lives outside React/the store
// so the Cancel button (a different component) can reach it without lifting
// a non-serializable class instance into state.
let active: RenderQueue | null = null;

export function setActiveRenderQueue(queue: RenderQueue | null): void {
  active = queue;
}

export function cancelActiveRenderQueue(): void {
  active?.cancel();
}
