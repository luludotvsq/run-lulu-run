import { GAME_CONFIG, canSeePoint, getMapById, getVisionRadius, roundValue } from "@shared/index.js";
import type { AudioDebugState } from "./audioController.js";
import type { ActiveSession } from "../game/runtime.js";
import { getHudPrompt, getStateSummary, isHumanVaultReady } from "./hud.js";
import type { UiState } from "./types.js";

interface BuildTextStateOptions {
  session: ActiveSession | null;
  uiState: UiState;
  appTitle: string;
  audio: AudioDebugState;
}

export function buildTextStatePayload(options: BuildTextStateOptions): string {
  const { session, uiState, appTitle, audio } = options;
  const state = session?.getState() ?? null;

  if (!session) {
    return JSON.stringify({
      coordinateSystem: "origin top-left, +x right, +y down",
      mode: "menu",
      screen: uiState.screen,
      title: appTitle,
      notice: uiState.notice,
      roomCode: uiState.joinCode || null,
      busy: uiState.pendingAction,
      audio,
      canvasReady: true,
    });
  }

  if (!state) {
    return JSON.stringify({
      coordinateSystem: "origin top-left, +x right, +y down",
      mode: session.getInfo().mode,
      waiting: session.getInfo().waiting,
      roomCode: session.getInfo().roomCode,
      status: session.getInfo().statusText,
      audio,
    });
  }

  const localRole = session.getLocalRole();
  const map = getMapById(state.mapId);
  const viewer = localRole === "lulu" ? state.lulu : state.springtrap;
  const radius = getVisionRadius(localRole);
  const humanVaultReady = isHumanVaultReady(state, localRole);

  return JSON.stringify({
    coordinateSystem: "origin top-left, +x right, +y down",
    mode: state.mode,
    roomCode: session.getInfo().roomCode,
    waiting: session.getInfo().waiting,
    status: session.getInfo().statusText,
    audio,
    mapId: state.mapId,
    result: state.result,
    exitOpen: state.exitOpen,
    localRole,
    completedGenerators: state.generators.filter((generator) => generator.completed).length,
    totalGenerators: state.generators.length,
    gateStatus: state.exitOpen ? "open" : "closed",
    luluRepairingGeneratorId: state.luluRepairingGeneratorId,
    luluHealingNpcId: state.luluHealingNpcId,
    humanVaultReady,
    humanVaultDirection: humanVaultReady ? viewer.facing : null,
    luluHealingProgress:
      state.lulu.lock.kind === "healing"
        ? roundValue(1 - state.lulu.lock.remainingMs / Math.max(1, state.lulu.lock.totalMs))
        : 0,
    prompt: getHudPrompt(state, localRole),
    summary: getStateSummary(state),
    lulu: {
      x: roundValue(state.lulu.x),
      y: roundValue(state.lulu.y),
      facing: state.lulu.facing,
      health: state.lulu.health,
      visible: localRole === "lulu" || canSeePoint(viewer, state.lulu, radius, map.obstacles),
    },
    springtrap: {
      x: roundValue(state.springtrap.x),
      y: roundValue(state.springtrap.y),
      facing: state.springtrap.facing,
      lock: state.springtrap.lock.kind,
      aiState: state.springtrap.aiState,
      aiStateRemainingMs: roundValue(state.springtrap.aiStateRemainingMs),
      aiChaseSightLossMs: roundValue(state.springtrap.aiChaseSightLossMs),
      distractionNpcId: state.springtrap.aiDistractionNpcId,
      huntTarget: state.springtrap.aiHuntTarget
        ? {
            x: roundValue(state.springtrap.aiHuntTarget.x),
            y: roundValue(state.springtrap.aiHuntTarget.y),
          }
        : null,
      lastConfirmedLulu: state.springtrap.aiLastConfirmedLulu
        ? {
            x: roundValue(state.springtrap.aiLastConfirmedLulu.x),
            y: roundValue(state.springtrap.aiLastConfirmedLulu.y),
          }
        : null,
      searchWaypointIndex: state.springtrap.aiSearchWaypointIndex,
      visible: localRole === "springtrap" || canSeePoint(viewer, state.springtrap, radius, map.obstacles),
    },
    springtraps: state.springtraps.map((springtrap) => ({
      id: springtrap.id,
      x: roundValue(springtrap.x),
      y: roundValue(springtrap.y),
      facing: springtrap.facing,
      lock: springtrap.lock.kind,
      aiState: springtrap.aiState,
      aiStateRemainingMs: roundValue(springtrap.aiStateRemainingMs),
      aiChaseSightLossMs: roundValue(springtrap.aiChaseSightLossMs),
      visible: localRole === "springtrap" || canSeePoint(viewer, springtrap, radius, map.obstacles),
    })),
    npcs: state.npcs.map((npc) => ({
      id: npc.id,
      x: roundValue(npc.x),
      y: roundValue(npc.y),
      health: npc.health,
      aiMode: npc.aiMode,
      targetGeneratorId: npc.targetGeneratorId,
      healChargesRemaining: npc.healChargesRemaining,
      visible: canSeePoint(viewer, npc, radius, map.obstacles),
    })),
    pallets: state.pallets.map((pallet) => ({
      id: pallet.id,
      state: pallet.state,
      x: roundValue(pallet.x),
      y: roundValue(pallet.y),
    })),
    generators: state.generators.map((generator) => ({
      id: generator.id,
      x: roundValue(generator.x),
      y: roundValue(generator.y),
      progress: roundValue(generator.progress),
      completed: generator.completed,
    })),
    generatorRepairRange: GAME_CONFIG.generator.repairRange,
  });
}
