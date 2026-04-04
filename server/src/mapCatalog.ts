import { existsSync } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  authoredMapToRuntimeMap,
  getBuiltInMaps,
  getMapCatalog,
  parseAuthoredMapJson,
  setCustomMaps,
} from "../../shared/src/index.js";
import type { MapData } from "../../shared/src/types.js";

function resolveRepoRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));

  while (true) {
    const hasRepoMarkers =
      existsSync(path.join(current, "SPEC.md")) &&
      existsSync(path.join(current, "client")) &&
      existsSync(path.join(current, "server")) &&
      existsSync(path.join(current, "shared"));

    if (hasRepoMarkers) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Could not resolve repo root for custom map loading.");
    }
    current = parent;
  }
}

const repoRoot = resolveRepoRoot();
const customMapsDir = path.join(repoRoot, "maps", "custom");

export function getRepoRoot(): string {
  return repoRoot;
}

export function getCustomMapsDirectory(): string {
  return customMapsDir;
}

async function readCustomMapsFromDisk(): Promise<MapData[]> {
  await mkdir(customMapsDir, { recursive: true });

  const directoryEntries = await readdir(customMapsDir, { withFileTypes: true });
  const jsonFiles = directoryEntries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const builtInIds = new Set(getBuiltInMaps().map((entry) => entry.id));
  const acceptedIds = new Set<string>();
  const loadedMaps: MapData[] = [];

  for (const fileName of jsonFiles) {
    const absolutePath = path.join(customMapsDir, fileName);

    try {
      const rawJson = await readFile(absolutePath, "utf8");
      const authoredMap = parseAuthoredMapJson(rawJson);

      if (builtInIds.has(authoredMap.id)) {
        console.warn(`[maps] Skipping ${fileName}: id "${authoredMap.id}" conflicts with a built-in map.`);
        continue;
      }

      if (acceptedIds.has(authoredMap.id)) {
        console.warn(`[maps] Skipping ${fileName}: duplicate custom map id "${authoredMap.id}".`);
        continue;
      }

      loadedMaps.push(authoredMapToRuntimeMap(authoredMap));
      acceptedIds.add(authoredMap.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      console.warn(`[maps] Skipping ${fileName}: ${message}`);
    }
  }

  return loadedMaps.sort((left, right) => left.id.localeCompare(right.id));
}

export async function refreshMapCatalogFromDisk(): Promise<MapData[]> {
  const customMaps = await readCustomMapsFromDisk();
  setCustomMaps(customMaps);
  return getMapCatalog();
}
