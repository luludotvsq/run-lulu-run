const DEFAULT_SERVER_PORT = "3001";

function normalizeConfiguredUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : null;
}

function isLikelyLocalHostname(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return true;
  }

  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }

  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }

  const private172Match = hostname.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (private172Match) {
    const secondOctet = Number.parseInt(private172Match[1] ?? "", 10);
    return Number.isFinite(secondOctet) && secondOctet >= 16 && secondOctet <= 31;
  }

  return false;
}

export function resolveServerUrl(): string {
  const configured = normalizeConfiguredUrl(import.meta.env.VITE_SERVER_URL);
  if (configured) {
    return configured;
  }

  const { protocol, hostname, origin, port } = window.location;
  if (port !== "" && port !== DEFAULT_SERVER_PORT && isLikelyLocalHostname(hostname)) {
    return `${protocol}//${hostname}:${DEFAULT_SERVER_PORT}`;
  }

  return origin;
}

export const SERVER_URL = resolveServerUrl();
