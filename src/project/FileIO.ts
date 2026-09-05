import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { buildProjectFromStore, applyProjectToStore } from "./Project";
import { serializeProjectToJSON, parseProjectFromJSON } from "./ProjectSerializer";

const FRACTAL_FILE_FILTER = [{ name: "FraXtal Project", extensions: ["fractal"] }];

/** Opens the native Save dialog and writes the current composition to disk.
 * Returns the chosen path, or null if the user cancelled. */
export async function saveProjectAs(): Promise<string | null> {
  const path = await save({ filters: FRACTAL_FILE_FILTER, defaultPath: "composition.fractal" });
  if (!path) return null;

  const project = buildProjectFromStore();
  await writeTextFile(path, serializeProjectToJSON(project));
  return path;
}

/** Opens the native Open dialog and loads a .fractal file into the store.
 * Returns the chosen path, or null if the user cancelled. */
export async function openProject(): Promise<string | null> {
  const path = await open({ filters: FRACTAL_FILE_FILTER, multiple: false });
  if (!path || Array.isArray(path)) return null;

  const json = await readTextFile(path);
  const project = parseProjectFromJSON(json);
  applyProjectToStore(project);
  return path;
}
