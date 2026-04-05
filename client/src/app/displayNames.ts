import type { MatchResult, Role } from "@shared/types.js";

export function getRoleDisplayName(role: Role): string {
  return role === "springtrap" ? "AYU" : "LULU";
}

export function getRoleDisplayNameLower(role: Role): string {
  return role === "springtrap" ? "ayu" : "lulu";
}

export function getKillerDisplayName(count = 1): string {
  return count === 1 ? "AYU" : `AYUs ${count}`;
}

export function getResultDisplayName(result: MatchResult): string {
  if (result === "springtrap_win") {
    return "AYU";
  }
  if (result === "lulu_win") {
    return "LULU";
  }
  return "";
}
