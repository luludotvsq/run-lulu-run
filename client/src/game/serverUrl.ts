const DEFAULT_SERVER_PORT = "3001";
const DEV_PORTS = new Set(["5173", "4173"]);

function normalizeConfiguredUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : null;
}

export function resolveServerUrl(): string {
  const configured = normalizeConfiguredUrl(import.meta.env.VITE_SERVER_URL);
  if (configured) {
    return configured;
  }

  const { protocol, hostname, origin, port } = window.location;
  if (DEV_PORTS.has(port)) {
    return `${protocol}//${hostname}:${DEFAULT_SERVER_PORT}`;
  }

  return origin;
}

export const SERVER_URL = resolveServerUrl();
