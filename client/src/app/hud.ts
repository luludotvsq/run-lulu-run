import { GAME_CONFIG, canActorManualVaultWithFacing, getMapById } from "@shared/index.js";
import type { MatchState, Role } from "@shared/types.js";
import type { HudElements } from "./createAppLayout.js";

function getGeneratorGoal(state: MatchState): number {
  return state.generators.length || GAME_CONFIG.generator.totalCount;
}

function formatGeneratorGoal(goal: number): string {
  return `${goal} generator${goal === 1 ? "" : "s"}`;
}

function getNearbyGenerator(state: MatchState) {
  return [...state.generators]
    .filter(
      (generator) =>
        !generator.completed &&
        Math.hypot(state.lulu.x - generator.x, state.lulu.y - generator.y) <= GAME_CONFIG.generator.repairRange,
    )
    .sort(
      (left, right) =>
        Math.hypot(state.lulu.x - left.x, state.lulu.y - left.y) -
        Math.hypot(state.lulu.x - right.x, state.lulu.y - right.y),
    )[0];
}

function getNearbyHealerNpc(state: MatchState) {
  if (state.lulu.health !== "injured") {
    return undefined;
  }

  return [...state.npcs]
    .filter(
      (npc) =>
        npc.health !== "dead" &&
        npc.healChargesRemaining > 0 &&
        Math.hypot(state.lulu.x - npc.x, state.lulu.y - npc.y) <= GAME_CONFIG.heal.range,
    )
    .sort(
      (left, right) =>
        Math.hypot(state.lulu.x - left.x, state.lulu.y - left.y) -
        Math.hypot(state.lulu.x - right.x, state.lulu.y - right.y),
    )[0];
}

export function isHumanVaultReady(state: MatchState, role: Role): boolean {
  const actor = role === "springtrap" ? state.springtrap : state.lulu;
  return canActorManualVaultWithFacing(state, actor);
}

export function getHudPrompt(state: MatchState, role: Role): string {
  const generatorGoal = getGeneratorGoal(state);

  if (isHumanVaultReady(state, role)) {
    return "Move into the ledge and tap Space to vault.";
  }

  if (role === "springtrap") {
    if (state.result === "springtrap_win") {
      return "Springtrap won the round.";
    }

    return state.luluRepairingGeneratorId
      ? "LULU is repairing. Follow the arrow and attack with Space."
      : "Space attacks. Kill LULU before she escapes.";
  }

  if (state.result === "lulu_win") {
    return "LULU escaped.";
  }
  if (state.result === "springtrap_win") {
    return "Springtrap won the round.";
  }

  const nearbyUprightPallet = state.pallets.some(
    (pallet) => pallet.state === "upright" && Math.hypot(state.lulu.x - pallet.x, state.lulu.y - pallet.y) <= 28,
  );
  if (nearbyUprightPallet) {
    return "Space drops the nearby pallet.";
  }
  const nearbyHealer = getNearbyHealerNpc(state);
  if (nearbyHealer) {
    return state.luluHealingNpcId === nearbyHealer.id
      ? "Holding Space heals LULU."
      : "Hold Space near this survivor to heal.";
  }
  const nearbyGenerator = getNearbyGenerator(state);
  if (nearbyGenerator && !state.exitOpen) {
    return state.luluRepairingGeneratorId === nearbyGenerator.id
      ? "Holding Space repairs this generator."
      : "Hold Space to repair the nearby generator.";
  }

  if (state.lulu.health === "injured") {
    return "Injured: one more hit kills LULU.";
  }

  if (!state.exitOpen) {
    return `Repair all ${formatGeneratorGoal(generatorGoal)} to open the gate.`;
  }

  const map = getMapById(state.mapId);
  const gateCenterX = map.gate.x + map.gate.w * 0.5;
  const gateCenterY = map.gate.y + map.gate.h * 0.5;
  return Math.hypot(state.lulu.x - gateCenterX, state.lulu.y - gateCenterY) <= 72
    ? "Gate open: walk into the exit."
    : "Gate open. Reach the exit.";
}

function formatDebugPoint(point: { x: number; y: number } | null): string {
  if (!point) {
    return "--";
  }

  return `${Math.round(point.x)}, ${Math.round(point.y)}`;
}

function syncAiDebug(hud: HudElements, state: MatchState | null, role: Role | null, debugAi: boolean): void {
  if (!debugAi || !state || !role || state.mode !== "single") {
    hud.aiDebug.classList.add("hidden");
    hud.aiDebug.textContent = "";
    return;
  }

  hud.aiDebug.classList.remove("hidden");
  hud.aiDebug.textContent = state.springtraps
    .map(
      (springtrap, index) =>
        `S${index + 1} ${springtrap.aiState.toUpperCase()} ${Math.max(0, springtrap.aiStateRemainingMs / 1000).toFixed(2)}s SL ${Math.max(0, springtrap.aiChaseSightLossMs / 1000).toFixed(2)} Last ${formatDebugPoint(springtrap.aiLastConfirmedLulu)} Hunt ${formatDebugPoint(springtrap.aiHuntTarget)}`,
    )
    .join(" | ");
}

export function getStateSummary(state: MatchState | null): string {
  if (!state) {
    return "No active match";
  }

  const generatorGoal = getGeneratorGoal(state);
  const completedGenerators = state.generators.filter((generator) => generator.completed).length;
  const nearestSpringtrap = [...state.springtraps].sort(
    (left, right) =>
      Math.hypot(state.lulu.x - left.x, state.lulu.y - left.y) -
      Math.hypot(state.lulu.x - right.x, state.lulu.y - right.y),
  )[0];
  const killerLabel = state.springtraps.length === 1 ? "Springtrap" : `Springtraps ${state.springtraps.length}`;
  return `${state.mapId} | Gens ${completedGenerators}/${generatorGoal} | LULU ${Math.round(state.lulu.x)}, ${Math.round(state.lulu.y)} | ${killerLabel} | Nearest ${nearestSpringtrap ? `${Math.round(nearestSpringtrap.x)}, ${Math.round(nearestSpringtrap.y)}` : "--"}`;
}

export function syncHud(hud: HudElements, state: MatchState | null, role: Role | null, debugAi: boolean): void {
  if (!state || !role) {
    hud.root.classList.add("hidden");
    syncAiDebug(hud, null, null, debugAi);
    return;
  }

  hud.root.classList.remove("hidden");
  hud.role.textContent = role.toUpperCase();
  hud.generators.textContent = `${state.generators.filter((generator) => generator.completed).length} / ${state.generators.length}`;
  hud.gate.textContent = state.exitOpen ? "Open" : "Closed";
  hud.health.textContent = state.lulu.health[0].toUpperCase() + state.lulu.health.slice(1);
  hud.prompt.textContent = getHudPrompt(state, role);
  syncAiDebug(hud, state, role, debugAi);
}
