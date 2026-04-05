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

const MAP_CATALOG_REQUEST_RETRY_DELAYS_MS = [0, 700, 1800, 3200] as const;
const MAP_CATALOG_ENDPOINTS = ["/runtime-map-catalog.json?v=m60b", "/maps?v=m60b"] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function createMapCatalogLoadError(responseText: string, statusCode: number | null): Error {
  const trimmed = responseText.trim();
  const returnedHtml = /^<!doctype|^<html|^</i.test(trimmed);
  if (returnedHtml) {
    return new Error(
      "The game server is still waking up and sent a web page instead of map data. Wait a few seconds and try again.",
    );
  }

  if (statusCode && statusCode >= 500) {
    return new Error("The game server is still waking up. Wait a few seconds and try again.");
  }

  return new Error("The game server returned invalid map data. Refresh and try again.");
}

function stripJsonNoise(responseText: string): string {
  return responseText.replace(/^\uFEFF/, "").trimStart().replace(/^\)\]\}',?\s*/, "");
}

function tryParseCatalogPayload(responseText: string): MapCatalogResponse | null {
  const candidates = [responseText, stripJsonNoise(responseText)];
  const cleaned = candidates[candidates.length - 1];
  const firstBraceIndex = cleaned.indexOf("{");
  const lastBraceIndex = cleaned.lastIndexOf("}");
  if (firstBraceIndex > 0 && lastBraceIndex > firstBraceIndex) {
    candidates.push(cleaned.slice(firstBraceIndex, lastBraceIndex + 1));
  }

  const attempted = new Set<string>();
  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (!normalized || attempted.has(normalized)) {
      continue;
    }

    attempted.add(normalized);
    try {
      return JSON.parse(normalized) as MapCatalogResponse;
    } catch {
      continue;
    }
  }

  return null;
}

async function fetchCatalogEndpointOnce(endpoint: string): Promise<MapCatalogResponse> {
  const response = await fetch(`${SERVER_URL}${endpoint}`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw createMapCatalogLoadError(responseText, response.status);
  }

  const payload = tryParseCatalogPayload(responseText);
  if (payload) {
    return payload;
  }

  console.warn(`[maps] Could not parse ${endpoint} response as JSON.`, {
    status: response.status,
    contentType: response.headers.get("content-type"),
    preview: responseText.slice(0, 120),
  });
  throw createMapCatalogLoadError(responseText, response.status);
}

async function fetchMapCatalogOnce(): Promise<MapCatalogResponse> {
  let lastError: unknown = null;

  for (const endpoint of MAP_CATALOG_ENDPOINTS) {
    try {
      return await fetchCatalogEndpointOnce(endpoint);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Could not load the map catalog from ${SERVER_URL}.`);
}

function shouldRetryMapCatalogLoad(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  if (error.message === "Runtime rotation is not ready.") {
    return false;
  }

  if (error.message.includes("requires exactly 2 valid custom maps")) {
    return false;
  }

  return true;
}

async function loadMapCatalog(): Promise<void> {
  let payload: MapCatalogResponse | null = null;
  let lastError: unknown = null;

  for (const retryDelayMs of MAP_CATALOG_REQUEST_RETRY_DELAYS_MS) {
    if (retryDelayMs > 0) {
      await sleep(retryDelayMs);
    }

    try {
      payload = await fetchMapCatalogOnce();
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (!shouldRetryMapCatalogLoad(error)) {
        throw error;
      }
    }
  }

  if (!payload) {
    throw lastError instanceof Error
      ? lastError
      : new Error(`Could not load the map catalog from ${SERVER_URL}.`);
  }

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
