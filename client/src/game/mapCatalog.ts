import { parseRuntimeMapData, replaceMapCatalog } from "@shared/index.js";
import { SERVER_URL } from "./serverUrl.js";

interface MapCatalogResponse {
  maps?: unknown[];
  ready?: boolean;
  message?: string;
  customMapCount?: number;
  requiredCustomMapCount?: number;
}

let catalogPromise: Promise<void> | null = null;

async function loadMapCatalog(): Promise<void> {
  const response = await fetch(`${SERVER_URL}/maps`);
  if (!response.ok) {
    throw new Error(`Could not load the map catalog from ${SERVER_URL}.`);
  }

  const payload = (await response.json()) as MapCatalogResponse;
  if (!Array.isArray(payload.maps)) {
    throw new Error("The server returned an invalid map catalog.");
  }

  if (!payload.ready) {
    throw new Error(payload.message ?? "Runtime rotation is not ready.");
  }

  replaceMapCatalog(payload.maps.map((entry) => parseRuntimeMapData(entry)));
}

export function primeMapCatalog(): void {
  void ensureMapCatalog().catch(() => undefined);
}

export async function ensureMapCatalog(forceRefresh = false): Promise<void> {
  if (forceRefresh || !catalogPromise) {
    catalogPromise = loadMapCatalog().catch((error) => {
      catalogPromise = null;
      throw error;
    });
  }

  return catalogPromise;
}

export async function refreshMapCatalog(): Promise<void> {
  await ensureMapCatalog(true);
}
