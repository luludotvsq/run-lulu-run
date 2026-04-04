export const APP_TITLE = "Dead by Lulu";
export const CANVAS_WIDTH = 960;
export const CANVAS_HEIGHT = 640;
export const TILE_SIZE = 32;
export const FIXED_STEP_MS = 1000 / 60;

export const GAME_CONFIG = {
  balance: {
    springtrapBaseSpeedPrevious: 176,
    springtrapBaseSpeedCurrent: 171,
  },
  movement: {
    lulu: 168,
    springtrap: 171,
    npc: 156,
  },
  burst: {
    speed: 264,
    durationMs: 650,
  },
  collider: {
    lulu: { w: 12, h: 12 },
    npc: { w: 12, h: 12 },
    springtrap: { w: 18, h: 18 },
  },
  attack: {
    windupMs: 100,
    activeMs: 80,
    recoveryMs: 900,
    range: 24,
    width: 20,
  },
  vision: {
    lulu: 320,
    springtrap: 240,
    npc: 220,
    chaseMemoryMs: 1_750,
    searchRadius: 64,
  },
  generator: {
    totalCount: 10,
    repairDurationMs: 18_000,
    repairRange: 26,
  },
  heal: {
    actionMs: 850,
    range: 18,
  },
  vault: {
    luluMs: 220,
    springtrapMs: 720,
  },
  pallet: {
    dropStartupMs: 80,
    stunMs: 1_100,
    knockbackMs: 180,
    knockbackDistancePx: TILE_SIZE * 3,
    downedVisibleMs: 420,
    respawnMs: 90_000,
  },
  npcAi: {
    wanderDecisionMinMs: 900,
    wanderDecisionMaxMs: 1_600,
    assistDecisionMinMs: 1_800,
    assistDecisionMaxMs: 3_200,
    fleeResetMs: 1_100,
    threatRange: 196,
  },
  pathing: {
    ledgeApproachRangePx: 88,
    ledgeAlignSlackPx: 14,
    cornerAssistPx: 8,
  },
  map: {
    widthTiles: 64,
    heightTiles: 48,
    actorBoundsInsetPx: TILE_SIZE * 0.75,
  },
  singlePlayer: {
    springtrapCount: 1,
    springtrapAi: {
      huntRetargetMs: 1_500,
      huntCellSizePx: TILE_SIZE * 4,
      repairCueRadiusPx: 416,
      repairCueGlobalWhileRepairing: true,
      closeContactRadiusPx: 128,
      chaseSightLossMs: 5_500,
      chaseEscapeDistancePx: 448,
      searchDurationMs: 8_500,
      searchWaypointStepPx: 128,
      searchWaypointReachPx: 24,
      cooldownDurationMs: 5_000,
      distractionCatchRangePx: 40,
      routeCommitMs: 650,
      blockedCommitFrames: 4,
      stuckFrames: 8,
      stuckBBoxPx: 24,
      attackMinPerpendicularOverlapPx: 6,
      attackMinOverlapAreaPx: 48,
    },
    npc: {
      repairMultiplier: 0.12,
      killable: false,
      canHealLulu: true,
      distractionEligibleInHunt: true,
      distractionEligibleInSearch: false,
      distractionEligibleInChase: false,
    },
  },
  multiplayer: {
    npc: {
      repairMultiplier: 0.4,
      killable: true,
      maxHealthStates: 2,
      canHealLulu: true,
    },
  },
} as const;
