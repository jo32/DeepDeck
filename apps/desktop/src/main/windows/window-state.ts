import { readFile, writeFile } from "node:fs/promises";

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function loadWindowState(path: string): Promise<WindowState> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    const record = typeof value === "object" && value !== null ? value : {};
    const width = finiteNumber(Reflect.get(record, "width"));
    const height = finiteNumber(Reflect.get(record, "height"));
    const x = finiteNumber(Reflect.get(record, "x"));
    const y = finiteNumber(Reflect.get(record, "y"));
    return {
      width: Math.max(960, width ?? 1320),
      height: Math.max(680, height ?? 860),
      ...(x === undefined ? {} : { x }),
      ...(y === undefined ? {} : { y }),
      ...(Reflect.get(record, "maximized") === true ? { maximized: true } : {}),
    };
  } catch (error) {
    if (typeof error === "object" && error !== null && Reflect.get(error, "code") === "ENOENT") {
      return { width: 1320, height: 860 };
    }
    throw error;
  }
}

export async function saveWindowState(path: string, state: WindowState): Promise<void> {
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
