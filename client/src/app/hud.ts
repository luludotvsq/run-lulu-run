import { GAME_CONFIG, canActorManualVaultWithFacing, getMapById } from "@shared/index.js";
import type { MatchState, Role } from "@shared/types.js";
import type { HudElements } from "./createAppLayout.js";
import { getKillerDisplayName, getRoleDisplayName } from "./displayNames.js";

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

function getNearbyChest(state: MatchState, role: Role) {
  const actor = role === "springtrap" ? state.springtrap : state.lulu;
  return [...state.chests]
    .filter(
      (chest) =>
        chest.state === "closed" &&
        Math.hypot(actor.x - chest.x, actor.y - chest.y) <= GAME_CONFIG.treasure.interactRange,
    )
    .sort(
      (left, right) =>
        Math.hypot(actor.x - left.x, actor.y - left.y) -
        Math.hypot(actor.x - right.x, actor.y - right.y),
    )[0];
}

export function isHumanVaultReady(state: MatchState, role: Role): boolean {
  const actor = role === "springtrap" ? state.springtrap : state.lulu;
  return canActorManualVaultWithFacing(state, actor);
}

export function getHudPrompt(state: MatchState, role: Role): string {
  const generatorGoal = getGeneratorGoal(state);
  const actionLabel = "Action (Space/button)";

  if (isHumanVaultReady(state, role)) {
    return `Move into the ledge and use ${actionLabel} to vault.`;
  }

  if (role === "springtrap") {
    if (state.result === "springtrap_win") {
      return "AYU won the round.";
    }

    const nearbyChest = getNearbyChest(state, role);
    if (nearbyChest) {
      return state.springtrapOpeningChestId === nearbyChest.id
        ? `Holding ${actionLabel} opens this treasure chest.`
        : `Hold ${actionLabel} near the treasure chest to open it.`;
    }

    if (state.springtrap.heartCharmRemainingMs > 0) {
      return `AYU's charm is active. Face LULU to pull her in.`;
    }
    if (state.springtrap.wrenchRemainingMs > 0) {
      return `AYU's wrench is active. ${actionLabel} throws a projectile.`;
    }

    return `Follow the arrow and use ${actionLabel} to attack. Kill LULU before she escapes.`;
  }

  if (state.result === "lulu_win") {
    return "LULU escaped.";
  }
  if (state.result === "springtrap_win") {
    return "AYU won the round.";
  }

  const nearbyUprightPallet = state.pallets.some(
    (pallet) =>
      pallet.state === "upright" &&
      Math.hypot(state.lulu.x - pallet.x, state.lulu.y - pallet.y) <= GAME_CONFIG.pallet.interactRangePx,
  );
  if (nearbyUprightPallet) {
    return `Use ${actionLabel} to drop the nearby pallet.`;
  }
  const nearbyHealer = getNearbyHealerNpc(state);
  if (nearbyHealer) {
    return state.luluHealingNpcId === nearbyHealer.id
      ? `Holding ${actionLabel} heals LULU.`
      : `Hold ${actionLabel} near this survivor to heal.`;
  }
  const nearbyChest = getNearbyChest(state, role);
  if (nearbyChest) {
    return state.luluOpeningChestId === nearbyChest.id
      ? `Holding ${actionLabel} opens this treasure chest.`
      : `Hold ${actionLabel} to open the nearby treasure chest.`;
  }
  const nearbyGenerator = getNearbyGenerator(state);
  if (nearbyGenerator && !state.exitOpen) {
    return state.luluRepairingGeneratorId === nearbyGenerator.id
      ? `Holding ${actionLabel} repairs this generator.`
      : `Hold ${actionLabel} to repair the nearby generator.`;
  }

  if (state.lulu.armorCharges > 0) {
    return "LULU's armor is active. The next AYU hit will be blocked.";
  }
  if (state.lulu.flashlightRemainingMs > 0) {
    return "LULU's flashlight is active. Face AYU to blind her tracker.";
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
        `A${index + 1} ${springtrap.aiState.toUpperCase()} ${Math.max(0, springtrap.aiStateRemainingMs / 1000).toFixed(2)}s SL ${Math.max(0, springtrap.aiChaseSightLossMs / 1000).toFixed(2)} Last ${formatDebugPoint(springtrap.aiLastConfirmedLulu)} Hunt ${formatDebugPoint(springtrap.aiHuntTarget)}`,
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
  const killerLabel = getKillerDisplayName(state.springtraps.length);
  return `${state.mapId} | Gens ${completedGenerators}/${generatorGoal} | LULU ${Math.round(state.lulu.x)}, ${Math.round(state.lulu.y)} | ${killerLabel} | Nearest ${nearestSpringtrap ? `${Math.round(nearestSpringtrap.x)}, ${Math.round(nearestSpringtrap.y)}` : "--"}`;
}

export function syncHud(hud: HudElements, state: MatchState | null, role: Role | null, debugAi: boolean): void {
  if (!state || !role) {
    hud.root.classList.add("hidden");
    syncAiDebug(hud, null, null, debugAi);
    return;
  }

  hud.root.classList.remove("hidden");
  hud.role.textContent = getRoleDisplayName(role);
  hud.generators.textContent = `${state.generators.filter((generator) => generator.completed).length} / ${state.generators.length}`;
  hud.gate.textContent = state.exitOpen ? "Open" : "Closed";
  hud.health.textContent = state.lulu.health[0].toUpperCase() + state.lulu.health.slice(1);
  hud.prompt.textContent = getHudPrompt(state, role);
  syncAiDebug(hud, state, role, debugAi);
}
