import type { FractalProject } from "../types/project";

/** Pure JSON encode/decode — no store, no file I/O. Kept separate so the
 * shape can be unit-tested without a DOM or a Tauri runtime (Phase 20). */
export function serializeProjectToJSON(project: FractalProject): string {
  return JSON.stringify(project, null, 2);
}

export function parseProjectFromJSON(json: string): FractalProject {
  const data = JSON.parse(json);
  if (data?.version !== 1) {
    throw new Error(`Unsupported .fractal project version: ${data?.version ?? "unknown"}`);
  }
  return data as FractalProject;
}
