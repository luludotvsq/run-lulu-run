import { FIXED_STEP_MS, GAME_CONFIG, TILE_SIZE } from "./config.js";
import { clamp, centeredRect, distance, intersects } from "./math.js";
import { DEFAULT_MAP_ID, getMapById } from "./maps.js";
import { canSeePoint, getVisionRadius } from "./vision.js";
import type {
  ActorBase,
  ChestReward,
  Direction,
  GateData,
  GeneratorData,
  LedgeData,
  LuluState,
  MapData,
  MatchControls,
  MatchMode,
  MatchState,
  MoveIntent,
  NpcState,
  PalletRuntime,
  ProjectileRuntime,
  SpringtrapAiItemCyclePhase,
  SpringtrapAiState,
  SpringtrapState,
  TreasureChestRuntime,
  TraverseData,
  Vec2,
} from "./types.js";

interface RoundSpawnLayout {
  lulu: Vec2;
  springtraps: Vec2[];
}

function getFacingToward(from: Vec2, to: Vec2): Direction {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0 ? "right" : "left";
  }

  return deltaY >= 0 ? "down" : "up";
}

function createLulu(spawn: Vec2): LuluState {
  return {
    id: "lulu",
    kind: "lulu",
    x: spawn.x,
    y: spawn.y,
    facing: "right",
    collider: GAME_CONFIG.collider.lulu,
    lock: { kind: "none" },
    health: "healthy",
    burstRemainingMs: 0,
    armorCharges: 0,
    flashlightRemainingMs: 0,
    flashlightCooldownRemainingMs: 0,
    charmRecoveryRemainingMs: 0,
  };
}

function createSpringtrapAt(spawn: Vec2, id: string, facing: Direction = "left"): SpringtrapState {
  return {
    id,
    kind: "springtrap",
    x: spawn.x,
    y: spawn.y,
    facing,
    collider: GAME_CONFIG.collider.springtrap,
    lock: { kind: "none" },
    aiState: "hunt",
    aiStateRemainingMs: 0,
    aiChaseSightLossMs: 0,
    aiLastConfirmedLulu: null,
    aiLastConfirmedLuluDirection: null,
    aiHuntTarget: null,
    aiHuntRetargetRemainingMs: 0,
    aiSearchWaypointIndex: 0,
    aiSearchWaypoints: [],
    aiDistractionNpcId: null,
    aiPriorityChestId: null,
    aiCommitDirection: null,
    aiCommitRemainingMs: 0,
    aiBlockedCommitFrames: 0,
    aiStuckFrames: 0,
    aiStuckAnchor: null,
    aiStuckLastPosition: null,
    aiItemCyclePhase: "none_after_heart",
    aiItemCycleRemainingMs: 0,
    trackerDisabledRemainingMs: 0,
    flashOverlayRemainingMs: 0,
    insideFlashlightZone: false,
    heartCharmRemainingMs: 0,
    heartCharmCooldownRemainingMs: 0,
    wrenchRemainingMs: 0,
    wrenchCooldownRemainingMs: 0,
  };
}

function getSpawnEdgeClearancePx(
  point: Vec2,
  collider: ActorBase["collider"],
  worldWidth: number,
  worldHeight: number,
): number {
  const halfW = collider.w * 0.5;
  const halfH = collider.h * 0.5;
  return Math.min(point.x - halfW, worldWidth - (point.x + halfW), point.y - halfH, worldHeight - (point.y + halfH));
}

function isSpawnPointClear(map: MapData, point: Vec2, collider: ActorBase["collider"]): boolean {
  const actorRect = centeredRect(point, collider);
  if (intersects(actorRect, map.gate)) {
    return false;
  }

  return !getMapStaticSolids(map, true).some((solid) => intersects(actorRect, solid));
}

function createSpawnAnchorPoints(map: MapData): Vec2[] {
  const worldWidth = map.widthTiles * TILE_SIZE;
  const worldHeight = map.heightTiles * TILE_SIZE;
  return [
    map.spawns.lulu,
    map.spawns.springtrap,
    { x: worldWidth * 0.5, y: worldHeight * 0.5 },
    { x: worldWidth * 0.25, y: worldHeight * 0.25 },
    { x: worldWidth * 0.75, y: worldHeight * 0.25 },
    { x: worldWidth * 0.25, y: worldHeight * 0.75 },
    { x: worldWidth * 0.75, y: worldHeight * 0.75 },
  ];
}

function createRoundSpawnCandidates(map: MapData, generators: GeneratorData[]): Vec2[] {
  const walkGrid = getWalkGrid(map);
  const liveGeneratorSpots = generators.map((generator) => ({ x: generator.x, y: generator.y }));
  const seedPoints = [...map.generatorSpawns, ...createSpawnAnchorPoints(map)];
  const uniqueCandidates = new Map<string, Vec2>();

  for (const seedPoint of seedPoints) {
    const candidate = findNearestWalkablePoint(map, seedPoint, walkGrid);
    const overlapsLiveGenerator = liveGeneratorSpots.some((generator) => distance(generator, candidate) < TILE_SIZE * 0.5);
    if (overlapsLiveGenerator) {
      continue;
    }

    uniqueCandidates.set(`${Math.round(candidate.x)}:${Math.round(candidate.y)}`, candidate);
  }

  return [...uniqueCandidates.values()];
}

function getSpawnFallback(map: MapData, collider: ActorBase["collider"], preferredPoint: Vec2): Vec2 {
  const fallbackPool = [
    preferredPoint,
    ...createSpawnAnchorPoints(map),
    ...map.generatorSpawns,
  ]
    .map((point) => findNearestWalkablePoint(map, point))
    .filter((point) => isSpawnPointClear(map, point, collider))
    .sort((left, right) => {
      const worldWidth = map.widthTiles * TILE_SIZE;
      const worldHeight = map.heightTiles * TILE_SIZE;
      return (
        getSpawnEdgeClearancePx(right, collider, worldWidth, worldHeight) -
        getSpawnEdgeClearancePx(left, collider, worldWidth, worldHeight)
      );
    });

  return fallbackPool[0] ?? preferredPoint;
}

function chooseLuluSpawn(map: MapData, candidates: Vec2[]): Vec2 {
  const worldWidth = map.widthTiles * TILE_SIZE;
  const worldHeight = map.heightTiles * TILE_SIZE;
  const validCandidates = candidates.filter((candidate) => isSpawnPointClear(map, candidate, GAME_CONFIG.collider.lulu));
  const idealCandidates = validCandidates.filter(
    (candidate) =>
      getSpawnEdgeClearancePx(candidate, GAME_CONFIG.collider.lulu, worldWidth, worldHeight) >=
      GAME_CONFIG.map.runtimeSpawnEdgePaddingPx,
  );
  const pool = idealCandidates.length > 0 ? idealCandidates : validCandidates;
  if (pool.length === 0) {
    return getSpawnFallback(map, GAME_CONFIG.collider.lulu, map.spawns.lulu);
  }

  return shufflePoints(pool)[0] ?? getSpawnFallback(map, GAME_CONFIG.collider.lulu, map.spawns.lulu);
}

function chooseSpringtrapSpawn(
  map: MapData,
  candidates: Vec2[],
  luluSpawn: Vec2,
  takenSpringtrapSpawns: Vec2[],
): Vec2 | null {
  const worldWidth = map.widthTiles * TILE_SIZE;
  const worldHeight = map.heightTiles * TILE_SIZE;
  const availableCandidates = candidates.filter((candidate) => {
    if (!isSpawnPointClear(map, candidate, GAME_CONFIG.collider.springtrap)) {
      return false;
    }
    if (distance(candidate, luluSpawn) < TILE_SIZE * 2) {
      return false;
    }
    return !takenSpringtrapSpawns.some((entry) => distance(entry, candidate) < TILE_SIZE * 4);
  });

  const strictCandidates = availableCandidates.filter(
    (candidate) =>
      distance(candidate, luluSpawn) >= GAME_CONFIG.map.runtimeSpawnMinSeparationPx &&
      getSpawnEdgeClearancePx(candidate, GAME_CONFIG.collider.springtrap, worldWidth, worldHeight) >=
        GAME_CONFIG.map.runtimeSpawnEdgePaddingPx,
  );

  const relaxedCandidates = availableCandidates.filter(
    (candidate) => distance(candidate, luluSpawn) >= GAME_CONFIG.map.runtimeSpawnMinSeparationPx,
  );

  const pool =
    strictCandidates.length > 0
      ? strictCandidates
      : relaxedCandidates.length > 0
        ? relaxedCandidates
        : availableCandidates;

  if (pool.length === 0) {
    return null;
  }

  return shufflePoints(pool)[0] ?? null;
}

function createRoundSpawns(mode: MatchMode, mapId: string, generators: GeneratorData[]): RoundSpawnLayout {
  const map = getMapById(mapId);
  const desiredSpringtrapCount = mode === "single" ? Math.max(1, GAME_CONFIG.singlePlayer.springtrapCount) : 1;
  const candidates = createRoundSpawnCandidates(map, generators);
  const lulu = chooseLuluSpawn(map, candidates);
  const springtraps: Vec2[] = [];

  for (let index = 0; index < desiredSpringtrapCount; index += 1) {
    const spawn =
      chooseSpringtrapSpawn(map, candidates, lulu, springtraps) ??
      getSpawnFallback(map, GAME_CONFIG.collider.springtrap, map.spawns.springtrap);
    springtraps.push(spawn);
  }

  return { lulu, springtraps };
}

function createNpcs(mapId: string): NpcState[] {
  const map = getMapById(mapId);
  return map.spawns.npcs.map((spawn, index) => ({
    id: `npc-${index + 1}`,
    kind: "npc",
    x: spawn.x,
    y: spawn.y,
    facing: "down",
    collider: GAME_CONFIG.collider.npc,
    lock: { kind: "none" },
    health: "healthy",
    aiMode: "wander",
    wanderDirection: pickRandomDirection(),
    decisionRemainingMs: randomBetween(
      GAME_CONFIG.npcAi.wanderDecisionMinMs,
      GAME_CONFIG.npcAi.wanderDecisionMaxMs,
    ),
    targetGeneratorId: null,
    healChargesRemaining: 1,
    dissolveRemainingMs: 0,
  }));
}

function shufflePoints(points: Vec2[]): Vec2[] {
  const next = points.map((entry) => ({ ...entry }));
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const temp = next[index];
    next[index] = next[swapIndex];
    next[swapIndex] = temp;
  }
  return next;
}

function createGenerators(mapId: string): GeneratorData[] {
  const map = getMapById(mapId);
  const staticBlockedPoints = getStaticSpawnBlockedPoints(map);
  const safeAuthoredSpawns = map.generatorSpawns.filter((spawn) =>
    isPlacementPointOpen(map, spawn, TILE_SIZE * 0.72, staticBlockedPoints, 0),
  );
  const fallbackSpawns = getGenericPlacementCandidates(map, TILE_SIZE * 0.72, staticBlockedPoints).filter(
    (candidate) => !safeAuthoredSpawns.some((spawn) => distance(spawn, candidate) < TILE_SIZE * 0.5),
  );
  const pool = [...shufflePoints(safeAuthoredSpawns), ...shufflePoints(fallbackSpawns)];
  return pool.slice(0, GAME_CONFIG.generator.totalCount).map((spawn, index) => ({
    id: `generator-${index + 1}`,
    x: spawn.x,
    y: spawn.y,
    progress: 0,
    completed: false,
  }));
}

function createPallets(mapId: string): PalletRuntime[] {
  const map = getMapById(mapId);
  return map.pallets.map((entry) => ({
    id: entry.id,
    x: entry.x,
    y: entry.y,
    orientation: entry.orientation,
    state: "upright",
    slowsSpringtrap: false,
    downedVisibleRemainingMs: 0,
    respawnRemainingMs: 0,
  }));
}

function createTreasureChest(id: number, point: Vec2): TreasureChestRuntime {
  return {
    id: `chest-${id}`,
    x: point.x,
    y: point.y,
    state: "closed",
    reward: null,
    openedBy: null,
    openedRemainingMs: 0,
  };
}

function createTreasureChests(
  mapId: string,
  generators: GeneratorData[],
  roundSpawns: RoundSpawnLayout,
  nextChestIdRef: { value: number },
): TreasureChestRuntime[] {
  const map = getMapById(mapId);
  const blockedPoints = [
    ...getStaticSpawnBlockedPoints(map),
    ...generators.map((generator) => ({ x: generator.x, y: generator.y })),
    roundSpawns.lulu,
    ...roundSpawns.springtraps,
    ...map.spawns.npcs,
  ];
  const candidates = getGenericPlacementCandidates(map, GAME_CONFIG.treasure.chestSizePx * 0.78, blockedPoints);
  const selected = shufflePoints(candidates).slice(0, GAME_CONFIG.treasure.activeCount);
  return selected.map((point) => createTreasureChest(nextChestIdRef.value++, point));
}

export function createMatch(mode: MatchMode, mapId = DEFAULT_MAP_ID): MatchState {
  const generators = createGenerators(mapId);
  const roundSpawns = createRoundSpawns(mode, mapId, generators);
  const nextChestIdRef = { value: 1 };
  const chests = createTreasureChests(mapId, generators, roundSpawns, nextChestIdRef);
  const springtraps = roundSpawns.springtraps.map((spawn, index) =>
    createSpringtrapAt(
      spawn,
      index === 0 ? "springtrap" : `springtrap-${index + 1}`,
      getFacingToward(spawn, roundSpawns.lulu),
    ),
  );
  if (mode === "single") {
    for (const springtrap of springtraps) {
      activateSpringtrapAiItemCyclePhase(springtrap, "none_after_heart");
    }
  }
  return {
    mode,
    mapId,
    elapsedMs: 0,
    exitOpen: false,
    result: "running",
    resultReason: null,
    lulu: createLulu(roundSpawns.lulu),
    springtrap: springtraps[0],
    springtraps,
    npcs: createNpcs(mapId),
    generators,
    luluRepairingGeneratorId: null,
    luluHealingNpcId: null,
    luluOpeningChestId: null,
    springtrapOpeningChestId: null,
    pallets: createPallets(mapId),
    chests,
    projectiles: [],
    nextChestId: nextChestIdRef.value,
    nextProjectileId: 1,
    roundNumber: 1,
  };
}

function getMap(state: MatchState) {
  return getMapById(state.mapId);
}

interface WalkGrid {
  width: number;
  height: number;
  blocked: Uint8Array;
}

const walkGridCache = new Map<string, WalkGrid>();
const springtrapWalkGridCache = new Map<string, WalkGrid>();

function getSinglePlayerAiConfig() {
  return GAME_CONFIG.singlePlayer.springtrapAi;
}

function getSinglePlayerNpcConfig() {
  return GAME_CONFIG.singlePlayer.npc;
}

function getMultiplayerNpcConfig() {
  return GAME_CONFIG.multiplayer.npc;
}

function isNpcAlive(npc: NpcState): boolean {
  return npc.health !== "dead";
}

function getActiveSpringtraps(state: MatchState): SpringtrapState[] {
  return state.springtraps;
}

function getNearestSpringtrap(state: MatchState, actor: Vec2): SpringtrapState | null {
  const springtraps = getActiveSpringtraps(state);
  if (springtraps.length === 0) {
    return null;
  }

  return [...springtraps].sort((left, right) => distance(actor, left) - distance(actor, right))[0] ?? null;
}

function isNpcKillable(state: MatchState): boolean {
  return state.mode === "multiplayer" && getMultiplayerNpcConfig().killable;
}

function getNpcRepairMultiplier(state: MatchState): number {
  return state.mode === "multiplayer"
    ? getMultiplayerNpcConfig().repairMultiplier
    : getSinglePlayerNpcConfig().repairMultiplier;
}

function canNpcHealLulu(state: MatchState, npc: NpcState): boolean {
  const canHeal =
    state.mode === "multiplayer" ? getMultiplayerNpcConfig().canHealLulu : getSinglePlayerNpcConfig().canHealLulu;
  return canHeal && isNpcAlive(npc) && npc.healChargesRemaining > 0;
}

function springtrapHasActiveItem(springtrap: SpringtrapState): boolean {
  return springtrap.heartCharmRemainingMs > 0 || springtrap.wrenchRemainingMs > 0;
}

function canSpringtrapThrowWrench(springtrap: SpringtrapState): boolean {
  return springtrap.wrenchRemainingMs > 0 && springtrap.wrenchCooldownRemainingMs <= 0;
}

function getSpringtrapAiItemCycleDuration(phase: SpringtrapAiItemCyclePhase): number {
  switch (phase) {
    case "heart_charm":
      return GAME_CONFIG.boosts.heartCharmDurationMs;
    case "wrench":
      return GAME_CONFIG.boosts.wrenchDurationMs;
    case "none_after_heart":
    case "none_after_wrench":
      return getSinglePlayerAiConfig().itemDowntimeMs;
  }
}

function getNextSpringtrapAiItemCyclePhase(phase: SpringtrapAiItemCyclePhase): SpringtrapAiItemCyclePhase {
  switch (phase) {
    case "heart_charm":
      return "none_after_heart";
    case "none_after_heart":
      return "wrench";
    case "wrench":
      return "none_after_wrench";
    case "none_after_wrench":
      return "heart_charm";
  }
}

function syncSpringtrapAiItemCyclePhase(springtrap: SpringtrapState): void {
  if (springtrap.aiItemCyclePhase === "heart_charm") {
    springtrap.heartCharmRemainingMs = springtrap.aiItemCycleRemainingMs;
    springtrap.heartCharmCooldownRemainingMs = Math.min(
      springtrap.heartCharmCooldownRemainingMs,
      springtrap.aiItemCycleRemainingMs,
    );
    springtrap.wrenchRemainingMs = 0;
    springtrap.wrenchCooldownRemainingMs = 0;
    return;
  }

  if (springtrap.aiItemCyclePhase === "wrench") {
    springtrap.heartCharmRemainingMs = 0;
    springtrap.heartCharmCooldownRemainingMs = 0;
    springtrap.wrenchRemainingMs = springtrap.aiItemCycleRemainingMs;
    springtrap.wrenchCooldownRemainingMs = Math.min(
      springtrap.wrenchCooldownRemainingMs,
      springtrap.aiItemCycleRemainingMs,
    );
    return;
  }

  springtrap.heartCharmRemainingMs = 0;
  springtrap.heartCharmCooldownRemainingMs = 0;
  springtrap.wrenchRemainingMs = 0;
  springtrap.wrenchCooldownRemainingMs = 0;
}

function activateSpringtrapAiItemCyclePhase(
  springtrap: SpringtrapState,
  phase: SpringtrapAiItemCyclePhase,
): void {
  springtrap.aiItemCyclePhase = phase;
  springtrap.aiItemCycleRemainingMs = getSpringtrapAiItemCycleDuration(phase);
  if (phase === "heart_charm") {
    springtrap.heartCharmCooldownRemainingMs = 0;
  }
  if (phase === "wrench") {
    springtrap.wrenchCooldownRemainingMs = 0;
  }
  syncSpringtrapAiItemCyclePhase(springtrap);
}

function updateSpringtrapAiItemCycle(springtrap: SpringtrapState, deltaMs: number): void {
  let remainingDeltaMs = Math.max(0, deltaMs);
  while (remainingDeltaMs > 0) {
    if (springtrap.aiItemCycleRemainingMs <= 0) {
      activateSpringtrapAiItemCyclePhase(
        springtrap,
        getNextSpringtrapAiItemCyclePhase(springtrap.aiItemCyclePhase),
      );
    }

    const consumedMs = Math.min(remainingDeltaMs, springtrap.aiItemCycleRemainingMs);
    springtrap.aiItemCycleRemainingMs = Math.max(0, springtrap.aiItemCycleRemainingMs - consumedMs);
    remainingDeltaMs -= consumedMs;
  }

  if (springtrap.aiItemCycleRemainingMs <= 0) {
    activateSpringtrapAiItemCyclePhase(
      springtrap,
      getNextSpringtrapAiItemCyclePhase(springtrap.aiItemCyclePhase),
    );
    return;
  }

  syncSpringtrapAiItemCyclePhase(springtrap);
}

function getSpringtrapItemCueTarget(state: MatchState, springtrap: SpringtrapState): Vec2 | null {
  if (state.mode !== "single" || !springtrapHasActiveItem(springtrap)) {
    return null;
  }

  return state.lulu;
}

function shouldAllowNpcDistraction(state: MatchState, aiState: SpringtrapAiState): boolean {
  if (state.mode !== "single") {
    return false;
  }

  const rules = getSinglePlayerNpcConfig();
  if (aiState === "hunt") {
    return rules.distractionEligibleInHunt;
  }
  if (aiState === "search") {
    return rules.distractionEligibleInSearch;
  }
  if (aiState === "chase") {
    return rules.distractionEligibleInChase;
  }

  return false;
}

function getMapStaticSolids(map: MapData, includeLedges = false): { x: number; y: number; w: number; h: number }[] {
  const solids = map.obstacles.map((entry) => ({
    x: entry.x,
    y: entry.y,
    w: entry.w,
    h: entry.h,
  }));

  if (includeLedges) {
    for (const ledge of map.ledges) {
      solids.push({ x: ledge.x, y: ledge.y, w: ledge.w, h: ledge.h });
    }
  }

  return solids;
}

function getMapStaticPlacementRects(map: MapData): { x: number; y: number; w: number; h: number }[] {
  return [
    ...map.obstacles.map((entry) => ({ x: entry.x, y: entry.y, w: entry.w, h: entry.h })),
    ...map.ledges.map((entry) => ({ x: entry.x, y: entry.y, w: entry.w, h: entry.h })),
    ...map.pallets.map((entry) => getPalletRect(entry)),
    { x: map.gate.x, y: map.gate.y, w: map.gate.w, h: map.gate.h },
  ];
}

function getStaticSpawnBlockedPoints(map: MapData): Vec2[] {
  return [map.spawns.lulu, map.spawns.springtrap, ...map.spawns.npcs];
}

function getPlacementRect(point: Vec2, sizePx: number) {
  return {
    x: point.x - sizePx * 0.5,
    y: point.y - sizePx * 0.5,
    w: sizePx,
    h: sizePx,
  };
}

function isPlacementPointOpen(
  map: MapData,
  point: Vec2,
  sizePx: number,
  blockedPoints: Vec2[] = [],
  blockedRadiusPx = sizePx,
): boolean {
  const edgePadding = GAME_CONFIG.treasure.spawnEdgePaddingPx;
  const worldWidth = map.widthTiles * TILE_SIZE;
  const worldHeight = map.heightTiles * TILE_SIZE;
  if (
    point.x < edgePadding ||
    point.y < edgePadding ||
    point.x > worldWidth - edgePadding ||
    point.y > worldHeight - edgePadding
  ) {
    return false;
  }

  const placementRect = getPlacementRect(point, sizePx);
  if (getMapStaticPlacementRects(map).some((rect) => intersects(placementRect, rect))) {
    return false;
  }

  return !blockedPoints.some((entry) => distance(entry, point) < blockedRadiusPx);
}

function getGenericPlacementCandidates(
  map: MapData,
  sizePx: number,
  blockedPoints: Vec2[] = [],
  blockedRadiusPx = sizePx,
): Vec2[] {
  const grid = getWalkGrid(map);
  const candidates: Vec2[] = [];
  for (let tileY = 0; tileY < map.heightTiles; tileY += 1) {
    for (let tileX = 0; tileX < map.widthTiles; tileX += 1) {
      if (!isWalkableTile(grid, tileX, tileY)) {
        continue;
      }

      const candidate = tileCenter(tileX, tileY);
      if (!isPlacementPointOpen(map, candidate, sizePx, blockedPoints, blockedRadiusPx)) {
        continue;
      }

      candidates.push(candidate);
    }
  }

  return candidates;
}

function buildObstacleWalkGrid(map: MapData): WalkGrid {
  const width = map.widthTiles;
  const height = map.heightTiles;
  const blocked = new Uint8Array(width * height);

  for (const obstacle of map.obstacles) {
    const startX = Math.max(0, Math.floor(obstacle.x / TILE_SIZE));
    const endX = Math.min(width - 1, Math.ceil((obstacle.x + obstacle.w) / TILE_SIZE) - 1);
    const startY = Math.max(0, Math.floor(obstacle.y / TILE_SIZE));
    const endY = Math.min(height - 1, Math.ceil((obstacle.y + obstacle.h) / TILE_SIZE) - 1);

    for (let tileY = startY; tileY <= endY; tileY += 1) {
      for (let tileX = startX; tileX <= endX; tileX += 1) {
        blocked[tileY * width + tileX] = 1;
      }
    }
  }

  return { width, height, blocked };
}

function buildClearanceWalkGrid(map: MapData, collider = GAME_CONFIG.collider.springtrap): WalkGrid {
  const width = map.widthTiles;
  const height = map.heightTiles;
  const blocked = new Uint8Array(width * height);
  const solids = getMapStaticSolids(map, false);

  for (let tileY = 0; tileY < height; tileY += 1) {
    for (let tileX = 0; tileX < width; tileX += 1) {
      const tileRect = centeredRect(tileCenter(tileX, tileY), collider);
      if (solids.some((solid) => intersects(tileRect, solid))) {
        blocked[tileY * width + tileX] = 1;
      }
    }
  }

  return { width, height, blocked };
}

function getWalkGrid(map: MapData): WalkGrid {
  const cached = walkGridCache.get(map.id);
  if (cached) {
    return cached;
  }

  const grid = buildObstacleWalkGrid(map);
  walkGridCache.set(map.id, grid);
  return grid;
}

function getSpringtrapWalkGrid(map: MapData): WalkGrid {
  const cached = springtrapWalkGridCache.get(map.id);
  if (cached) {
    return cached;
  }

  const grid = buildClearanceWalkGrid(map);
  springtrapWalkGridCache.set(map.id, grid);
  return grid;
}

function clampTile(value: number, max: number): number {
  return clamp(Math.floor(value), 0, max - 1);
}

function getTileIndex(grid: WalkGrid, tileX: number, tileY: number): number {
  return tileY * grid.width + tileX;
}

function isWalkableTile(grid: WalkGrid, tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= grid.width || tileY >= grid.height) {
    return false;
  }

  return grid.blocked[getTileIndex(grid, tileX, tileY)] === 0;
}

function findNearestWalkableTile(
  map: MapData,
  point: Vec2,
  maxRadius = 8,
  grid = getWalkGrid(map),
  tieBreakerPoint: Vec2 | null = null,
): { tileX: number; tileY: number } | null {
  const baseX = clampTile(point.x / TILE_SIZE, grid.width);
  const baseY = clampTile(point.y / TILE_SIZE, grid.height);
  if (isWalkableTile(grid, baseX, baseY)) {
    return { tileX: baseX, tileY: baseY };
  }

  for (let radius = 1; radius <= maxRadius; radius += 1) {
    let bestCandidate: { tileX: number; tileY: number } | null = null;
    let bestDistance = Infinity;
    let bestTieBreakerDistance = Infinity;
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (Math.abs(offsetX) !== radius && Math.abs(offsetY) !== radius) {
          continue;
        }

        const tileX = baseX + offsetX;
        const tileY = baseY + offsetY;
        if (!isWalkableTile(grid, tileX, tileY)) {
          continue;
        }

        const center = tileCenter(tileX, tileY);
        const candidateDistance = distance(center, point);
        const candidateTieBreakerDistance = tieBreakerPoint ? distance(center, tieBreakerPoint) : 0;
        if (
          !bestCandidate ||
          candidateDistance < bestDistance - PROBE_PROGRESS_EPSILON_PX ||
          (Math.abs(candidateDistance - bestDistance) <= PROBE_PROGRESS_EPSILON_PX &&
            candidateTieBreakerDistance < bestTieBreakerDistance)
        ) {
          bestCandidate = { tileX, tileY };
          bestDistance = candidateDistance;
          bestTieBreakerDistance = candidateTieBreakerDistance;
        }
      }
    }

    if (bestCandidate) {
      return bestCandidate;
    }
  }

  return null;
}

function tileCenter(tileX: number, tileY: number): Vec2 {
  return {
    x: tileX * TILE_SIZE + TILE_SIZE * 0.5,
    y: tileY * TILE_SIZE + TILE_SIZE * 0.5,
  };
}

function findNearestWalkablePoint(
  map: MapData,
  point: Vec2,
  grid = getWalkGrid(map),
  tieBreakerPoint: Vec2 | null = null,
): Vec2 {
  const tile = findNearestWalkableTile(map, point, 8, grid, tieBreakerPoint);
  return tile ? tileCenter(tile.tileX, tile.tileY) : { x: point.x, y: point.y };
}

function hasWalkDistanceAtLeast(
  state: MatchState,
  from: Vec2,
  to: Vec2,
  thresholdPx: number,
  grid = getWalkGrid(getMap(state)),
): boolean {
  const map = getMap(state);
  const start = findNearestWalkableTile(map, from, 8, grid);
  const goal = findNearestWalkableTile(map, to, 8, grid, from);
  if (!start || !goal) {
    return distance(from, to) >= thresholdPx;
  }

  const maxSteps = Math.max(1, Math.ceil(thresholdPx / TILE_SIZE));
  const queueX = new Int16Array(grid.width * grid.height);
  const queueY = new Int16Array(grid.width * grid.height);
  const queueDepth = new Int16Array(grid.width * grid.height);
  const visited = new Uint8Array(grid.width * grid.height);

  let head = 0;
  let tail = 0;
  queueX[tail] = start.tileX;
  queueY[tail] = start.tileY;
  queueDepth[tail] = 0;
  tail += 1;
  visited[getTileIndex(grid, start.tileX, start.tileY)] = 1;

  while (head < tail) {
    const tileX = queueX[head];
    const tileY = queueY[head];
    const depth = queueDepth[head];
    head += 1;

    if (tileX === goal.tileX && tileY === goal.tileY) {
      return depth * TILE_SIZE >= thresholdPx;
    }

    if (depth >= maxSteps) {
      continue;
    }

    const neighbors = [
      { tileX: tileX + 1, tileY },
      { tileX: tileX - 1, tileY },
      { tileX, tileY: tileY + 1 },
      { tileX, tileY: tileY - 1 },
    ];

    for (const neighbor of neighbors) {
      if (!isWalkableTile(grid, neighbor.tileX, neighbor.tileY)) {
        continue;
      }

      const index = getTileIndex(grid, neighbor.tileX, neighbor.tileY);
      if (visited[index]) {
        continue;
      }

      visited[index] = 1;
      queueX[tail] = neighbor.tileX;
      queueY[tail] = neighbor.tileY;
      queueDepth[tail] = depth + 1;
      tail += 1;
    }
  }

  return true;
}

function pickRandomDirection(): Direction {
  const directions: Direction[] = ["up", "down", "left", "right"];
  return directions[Math.floor(Math.random() * directions.length)];
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickRoamTarget(state: MatchState): Vec2 {
  const map = getMap(state);
  const points = [
    map.spawns.lulu,
    map.spawns.springtrap,
    ...map.spawns.npcs,
    ...map.generatorSpawns,
    { x: map.gate.x + map.gate.w * 0.5, y: map.gate.y + map.gate.h * 0.5 },
    { x: map.widthTiles * TILE_SIZE * 0.5, y: map.heightTiles * TILE_SIZE * 0.5 },
    { x: map.widthTiles * TILE_SIZE * 0.75, y: map.heightTiles * TILE_SIZE * 0.25 },
  ];
  const pick = points[Math.floor(Math.random() * points.length)];
  return { x: pick.x, y: pick.y };
}

function getCoarseHuntTarget(state: MatchState): Vec2 {
  const map = getMap(state);
  const cellSize = getSinglePlayerAiConfig().huntCellSizePx;
  const target = {
    x: Math.floor(state.lulu.x / cellSize) * cellSize + cellSize * 0.5,
    y: Math.floor(state.lulu.y / cellSize) * cellSize + cellSize * 0.5,
  };

  return findNearestWalkablePoint(map, {
    x: clamp(target.x, TILE_SIZE * 0.5, map.widthTiles * TILE_SIZE - TILE_SIZE * 0.5),
    y: clamp(target.y, TILE_SIZE * 0.5, map.heightTiles * TILE_SIZE - TILE_SIZE * 0.5),
  });
}

function offsetPoint(point: Vec2, direction: Direction, distancePx: number): Vec2 {
  if (direction === "left") {
    return { x: point.x - distancePx, y: point.y };
  }
  if (direction === "right") {
    return { x: point.x + distancePx, y: point.y };
  }
  if (direction === "up") {
    return { x: point.x, y: point.y - distancePx };
  }
  return { x: point.x, y: point.y + distancePx };
}

function getPerpendicularDirections(direction: Direction): Direction[] {
  if (direction === "left" || direction === "right") {
    return ["up", "down"];
  }

  return ["left", "right"];
}

function buildSearchWaypoints(
  state: MatchState,
  origin: Vec2,
  direction: Direction | null,
  grid = getWalkGrid(getMap(state)),
): Vec2[] {
  const map = getMap(state);
  const step = getSinglePlayerAiConfig().searchWaypointStepPx;
  const candidates = [findNearestWalkablePoint(map, origin, grid)];
  if (direction) {
    candidates.push(findNearestWalkablePoint(map, offsetPoint(origin, direction, step), grid));
    candidates.push(findNearestWalkablePoint(map, offsetPoint(origin, direction, step * 2), grid));
    for (const searchDirection of getPerpendicularDirections(direction)) {
      candidates.push(findNearestWalkablePoint(map, offsetPoint(origin, searchDirection, step), grid));
    }
    candidates.push(findNearestWalkablePoint(map, offsetPoint(origin, getOppositeDirection(direction), step), grid));
  } else {
    const searchDirections: Direction[] = ["up", "right", "left", "down"];
    for (const searchDirection of searchDirections) {
      candidates.push(findNearestWalkablePoint(map, offsetPoint(origin, searchDirection, step), grid));
    }
  }

  const unique = new Map<string, Vec2>();
  for (const candidate of candidates) {
    const key = `${Math.round(candidate.x)}:${Math.round(candidate.y)}`;
    if (!unique.has(key)) {
      unique.set(key, candidate);
    }
    if (unique.size >= 5) {
      break;
    }
  }

  return [...unique.values()];
}

function getCompletedGeneratorCount(state: MatchState): number {
  return state.generators.filter((generator) => generator.completed).length;
}

function getGeneratorById(state: MatchState, generatorId: string | null): GeneratorData | null {
  if (!generatorId) {
    return null;
  }

  return state.generators.find((generator) => generator.id === generatorId) ?? null;
}

function getNpcById(state: MatchState, npcId: string | null): NpcState | null {
  if (!npcId) {
    return null;
  }

  return state.npcs.find((npc) => npc.id === npcId) ?? null;
}

function getSpringtrapById(state: MatchState, springtrapId: string | null): SpringtrapState | null {
  if (!springtrapId) {
    return null;
  }

  return state.springtraps.find((springtrap) => springtrap.id === springtrapId) ?? null;
}

function getGeneratorRepairRate(multiplier = 1): number {
  return multiplier / GAME_CONFIG.generator.repairDurationMs;
}

function repairGenerator(generator: GeneratorData, deltaMs: number, multiplier = 1): void {
  if (generator.completed) {
    return;
  }

  generator.progress = clamp(generator.progress + deltaMs * getGeneratorRepairRate(multiplier), 0, 1);
  if (generator.progress >= 1) {
    generator.progress = 1;
    generator.completed = true;
  }
}

interface MoveActorOptions {
  allowAutoVault?: boolean;
  manualVaultPressed?: boolean;
  combineManualVaultAttack?: boolean;
}

interface PathChoiceOptions {
  walkGrid?: WalkGrid;
  excludedDirections?: Direction[];
  preferredDirection?: Direction | null;
  moveOptions?: MoveActorOptions;
  forceRoute?: boolean;
}

interface MoveProbeResult {
  actor: ActorBase;
  destination: Vec2;
  distanceMoved: number;
  madeProgress: boolean;
  startedVault: boolean;
}

interface LedgeAlignmentCandidate {
  direction: Direction;
  gain: number;
}

interface DirectionChoiceCandidate {
  direction: Direction;
  intendedDirection: Direction;
  probe: MoveProbeResult;
  ledgeAlignmentGain: number;
}

interface AttackOption {
  facing: Direction;
  overlapArea: number;
  perpendicularOverlap: number;
  score: number;
  clean: boolean;
}

const PROBE_PROGRESS_EPSILON_PX = 0.25;
const CARDINAL_DIRECTIONS: Direction[] = ["up", "right", "down", "left"];

function cloneActorForProbe(actor: ActorBase): ActorBase {
  return {
    ...actor,
    collider: { ...actor.collider },
    lock: { kind: "none" },
  };
}

function getProbeDestination(actor: ActorBase): Vec2 {
  if (actor.lock.kind === "vault") {
    return {
      x: actor.lock.to.x,
      y: actor.lock.to.y,
    };
  }

  return {
    x: actor.x,
    y: actor.y,
  };
}

function probeActorMove(
  state: MatchState,
  actor: ActorBase,
  direction: Direction,
  options: MoveActorOptions = {},
): MoveProbeResult {
  const probe = cloneActorForProbe(actor);
  moveActor(state, probe, moveIntentFromDirection(direction), FIXED_STEP_MS, options);
  const destination = getProbeDestination(probe);
  const distanceMoved = distance(actor, destination);

  return {
    actor: probe,
    destination,
    distanceMoved,
    madeProgress: distanceMoved > PROBE_PROGRESS_EPSILON_PX,
    startedVault: probe.lock.kind === "vault",
  };
}

function projectActorMove(
  state: MatchState,
  actor: ActorBase,
  direction: Direction,
  deltaMs: number,
  options: MoveActorOptions = {},
): Vec2 {
  const probe = cloneActorForProbe(actor);
  moveActor(state, probe, moveIntentFromDirection(direction), deltaMs, options);
  return getProbeDestination(probe);
}

function uniqueDirections(directions: Direction[]): Direction[] {
  return [...new Set(directions)];
}

function filterExcludedDirections(directions: Direction[], excludedDirections: Direction[] = []): Direction[] {
  if (excludedDirections.length === 0) {
    return uniqueDirections(directions);
  }

  const excluded = new Set(excludedDirections);
  return uniqueDirections(directions).filter((direction) => !excluded.has(direction));
}

function getOppositeDirection(direction: Direction): Direction {
  if (direction === "up") {
    return "down";
  }
  if (direction === "down") {
    return "up";
  }
  if (direction === "left") {
    return "right";
  }
  return "left";
}

function moveIntentFromDirection(direction: Direction | null): MoveIntent | null {
  if (!direction) {
    return null;
  }

  return {
    primary: direction,
    secondary: null,
  };
}

function isMoveIntentActive(move: MoveIntent | null): boolean {
  return move !== null;
}

function getMoveIntentFacing(move: MoveIntent | null): Direction | null {
  return move?.primary ?? null;
}

function getMoveIntentDirections(move: MoveIntent | null): Direction[] {
  if (!move) {
    return [];
  }

  const directions = [move.primary];
  if (move.secondary && move.secondary !== move.primary && move.secondary !== getOppositeDirection(move.primary)) {
    directions.push(move.secondary);
  }

  return uniqueDirections(directions);
}

function getMoveIntentComponents(move: MoveIntent | null): { x: number; y: number } {
  const vector = { x: 0, y: 0 };

  for (const direction of getMoveIntentDirections(move)) {
    if (direction === "left") {
      vector.x -= 1;
    } else if (direction === "right") {
      vector.x += 1;
    } else if (direction === "up") {
      vector.y -= 1;
    } else if (direction === "down") {
      vector.y += 1;
    }
  }

  return vector;
}

function getDistanceImprovement(start: Vec2, end: Vec2, target: Vec2): number {
  return distance(start, target) - distance(end, target);
}

function chooseBestScoredDirection(
  state: MatchState,
  actor: ActorBase,
  directions: Direction[],
  scoreMove: (candidate: DirectionChoiceCandidate) => number,
  options: MoveActorOptions = {},
  excludedDirections: Direction[] = [],
): Direction | null {
  const candidates = getDirectionChoiceCandidates(state, actor, directions, options, excludedDirections);
  if (candidates.length === 0) {
    return null;
  }

  const reverseDirection = getOppositeDirection(actor.facing);
  const hasNonReverseCandidate = candidates.some((candidate) => candidate.direction !== reverseDirection);
  let bestDirection: Direction | null = null;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    let score = candidate.probe.distanceMoved + candidate.ledgeAlignmentGain * 8 + scoreMove(candidate);
    if (hasNonReverseCandidate && candidate.direction === reverseDirection) {
      score -= TILE_SIZE * 0.75;
    }
    if (score > bestScore) {
      bestScore = score;
      bestDirection = candidate.direction;
    }
  }

  return bestDirection;
}

function canActorProgress(
  state: MatchState,
  actor: ActorBase,
  direction: Direction,
  options: MoveActorOptions = {},
): boolean {
  return probeActorMove(state, actor, direction, options).madeProgress;
}

function getDirectionChoiceCandidates(
  state: MatchState,
  actor: ActorBase,
  intendedDirections: Direction[],
  options: MoveActorOptions = {},
  excludedDirections: Direction[] = [],
): DirectionChoiceCandidate[] {
  const candidates: DirectionChoiceCandidate[] = [];
  const excluded = new Set(excludedDirections);

  for (const intendedDirection of uniqueDirections(intendedDirections)) {
    if (excluded.has(intendedDirection)) {
      continue;
    }

    const directProbe = probeActorMove(state, actor, intendedDirection, options);
    if (directProbe.madeProgress) {
      candidates.push({
        direction: intendedDirection,
        intendedDirection,
        probe: directProbe,
        ledgeAlignmentGain: 0,
      });
    }

    const alignmentCandidate = getLedgeAlignmentCandidate(state, actor, intendedDirection, options);
    if (!alignmentCandidate) {
      continue;
    }

    if (excluded.has(alignmentCandidate.direction)) {
      continue;
    }

    candidates.push({
      direction: alignmentCandidate.direction,
      intendedDirection,
      probe: probeActorMove(state, actor, alignmentCandidate.direction, options),
      ledgeAlignmentGain: alignmentCandidate.gain,
    });
  }

  return candidates;
}

function getBestApproachLedge(state: MatchState, actor: ActorBase, move: Direction): LedgeData | null {
  const map = getMap(state);
  const candidates: { ledge: LedgeData; score: number }[] = [];

  for (const ledge of map.ledges) {
    if ((move === "up" || move === "down") && ledge.orientation === "horizontal") {
      const approachingFromAbove = move === "down" && actor.y <= ledge.y;
      const approachingFromBelow = move === "up" && actor.y >= ledge.y + ledge.h;
      if (!approachingFromAbove && !approachingFromBelow) {
        continue;
      }

      const verticalGap = approachingFromBelow ? actor.y - (ledge.y + ledge.h) : ledge.y - actor.y;
      if (verticalGap > GAME_CONFIG.pathing.ledgeApproachRangePx) {
        continue;
      }

      const centerX = ledge.x + ledge.w * 0.5;
      const alignmentDistance = Math.abs(actor.x - centerX);
      candidates.push({
        ledge,
        score: verticalGap * 4 + alignmentDistance,
      });
      continue;
    }

    if ((move === "left" || move === "right") && ledge.orientation === "vertical") {
      const approachingFromLeft = move === "right" && actor.x <= ledge.x;
      const approachingFromRight = move === "left" && actor.x >= ledge.x + ledge.w;
      if (!approachingFromLeft && !approachingFromRight) {
        continue;
      }

      const horizontalGap = approachingFromRight ? actor.x - (ledge.x + ledge.w) : ledge.x - actor.x;
      if (horizontalGap > GAME_CONFIG.pathing.ledgeApproachRangePx) {
        continue;
      }

      const centerY = ledge.y + ledge.h * 0.5;
      const alignmentDistance = Math.abs(actor.y - centerY);
      candidates.push({
        ledge,
        score: horizontalGap * 4 + alignmentDistance,
      });
    }
  }

  return candidates.sort((left, right) => left.score - right.score)[0]?.ledge ?? null;
}

function getLedgeAlignmentDistance(actor: ActorBase, ledge: LedgeData): number {
  if (ledge.orientation === "horizontal") {
    const minX = ledge.x - actor.collider.w * 0.5 - GAME_CONFIG.pathing.ledgeAlignSlackPx;
    const maxX = ledge.x + ledge.w + actor.collider.w * 0.5 + GAME_CONFIG.pathing.ledgeAlignSlackPx;
    const centerX = ledge.x + ledge.w * 0.5;
    if (actor.x < minX) {
      return minX - actor.x;
    }
    if (actor.x > maxX) {
      return actor.x - maxX;
    }
    return Math.abs(actor.x - centerX);
  }

  const minY = ledge.y - actor.collider.h * 0.5 - GAME_CONFIG.pathing.ledgeAlignSlackPx;
  const maxY = ledge.y + ledge.h + actor.collider.h * 0.5 + GAME_CONFIG.pathing.ledgeAlignSlackPx;
  const centerY = ledge.y + ledge.h * 0.5;
  if (actor.y < minY) {
    return minY - actor.y;
  }
  if (actor.y > maxY) {
    return actor.y - maxY;
  }
  return Math.abs(actor.y - centerY);
}

function chooseDirectionToward(
  state: MatchState,
  actor: ActorBase,
  target: Vec2,
  options: MoveActorOptions = {},
  excludedDirections: Direction[] = [],
  preferredDirection: Direction | null = null,
): Direction | null {
  const dx = target.x - actor.x;
  const dy = target.y - actor.y;
  const primary: Direction =
    Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "down" : "up";
  const secondary: Direction =
    primary === "left" || primary === "right" ? (dy >= 0 ? "down" : "up") : dx >= 0 ? "right" : "left";

  return chooseBestScoredDirection(
    state,
    actor,
    filterExcludedDirections([primary, secondary, ...CARDINAL_DIRECTIONS], excludedDirections),
    (candidate) => {
      const distanceScore = getDistanceImprovement(actor, candidate.probe.destination, target) * 8;
      const bias =
        candidate.intendedDirection === primary
          ? TILE_SIZE
          : candidate.intendedDirection === secondary
            ? TILE_SIZE * 0.5
            : 0;
      const directnessBias = candidate.direction === candidate.intendedDirection ? TILE_SIZE * 0.25 : 0;
      const preferredBias =
        preferredDirection && candidate.direction === preferredDirection ? TILE_SIZE * 0.75 : 0;
      return distanceScore + bias + directnessBias + preferredBias;
    },
    options,
    excludedDirections,
  );
}

function getLedgeAlignmentCandidate(
  state: MatchState,
  actor: ActorBase,
  move: Direction,
  options: MoveActorOptions = {},
): LedgeAlignmentCandidate | null {
  const ledge = getBestApproachLedge(state, actor, move);
  if (!ledge) {
    return null;
  }

  const beforeDistance = getLedgeAlignmentDistance(actor, ledge);
  const tryAlignmentMove = (direction: Direction | null): LedgeAlignmentCandidate | null => {
    if (!direction) {
      return null;
    }

    const probe = probeActorMove(state, actor, direction, options);
    if (!probe.madeProgress) {
      return null;
    }

    const gain = beforeDistance - getLedgeAlignmentDistance(probe.actor, ledge);
    if (gain > 0) {
      return { direction, gain };
    }

    return null;
  };

  if ((move === "up" || move === "down") && ledge.orientation === "horizontal") {
    const minX = ledge.x - actor.collider.w * 0.5 - GAME_CONFIG.pathing.ledgeAlignSlackPx;
    const maxX = ledge.x + ledge.w + actor.collider.w * 0.5 + GAME_CONFIG.pathing.ledgeAlignSlackPx;
    const centerX = ledge.x + ledge.w * 0.5;
    if (actor.x < minX) {
      return tryAlignmentMove("right");
    }
    if (actor.x > maxX) {
      return tryAlignmentMove("left");
    }
    if (Math.abs(actor.x - centerX) > GAME_CONFIG.pathing.ledgeAlignSlackPx) {
      return tryAlignmentMove(actor.x < centerX ? "right" : "left");
    }
  }

  if ((move === "left" || move === "right") && ledge.orientation === "vertical") {
    const minY = ledge.y - actor.collider.h * 0.5 - GAME_CONFIG.pathing.ledgeAlignSlackPx;
    const maxY = ledge.y + ledge.h + actor.collider.h * 0.5 + GAME_CONFIG.pathing.ledgeAlignSlackPx;
    const centerY = ledge.y + ledge.h * 0.5;
    if (actor.y < minY) {
      return tryAlignmentMove("down");
    }
    if (actor.y > maxY) {
      return tryAlignmentMove("up");
    }
    if (Math.abs(actor.y - centerY) > GAME_CONFIG.pathing.ledgeAlignSlackPx) {
      return tryAlignmentMove(actor.y < centerY ? "down" : "up");
    }
  }

  return null;
}

function getLedgeAlignmentMove(
  state: MatchState,
  actor: ActorBase,
  move: Direction,
  options: MoveActorOptions = {},
): Direction | null {
  return getLedgeAlignmentCandidate(state, actor, move, options)?.direction ?? null;
}

function choosePathDirectionToward(
  state: MatchState,
  actor: ActorBase,
  target: Vec2,
  pathOptions: PathChoiceOptions = {},
): Direction | null {
  const map = getMap(state);
  const moveOptions = pathOptions.moveOptions ?? {};
  const walkGrid = pathOptions.walkGrid ?? getWalkGrid(map);
  const excludedDirections = pathOptions.excludedDirections ?? [];
  const preferredDirection = pathOptions.preferredDirection ?? null;
  const forceRoute = pathOptions.forceRoute ?? false;
  if (!forceRoute && canSeePoint(actor, target, Number.MAX_SAFE_INTEGER, map.obstacles)) {
    return chooseDirectionToward(state, actor, target, moveOptions, excludedDirections, preferredDirection);
  }

  const start = findNearestWalkableTile(map, actor, 8, walkGrid);
  const goal = findNearestWalkableTile(map, target, 8, walkGrid, actor);
  if (!start || !goal) {
    return chooseDirectionToward(state, actor, target, moveOptions, excludedDirections, preferredDirection);
  }

  if (start.tileX === goal.tileX && start.tileY === goal.tileY) {
    return chooseDirectionToward(state, actor, target, moveOptions, excludedDirections, preferredDirection);
  }

  const totalTiles = walkGrid.width * walkGrid.height;
  const queue = new Int32Array(totalTiles);
  const parents = new Int32Array(totalTiles);
  parents.fill(-1);

  const startIndex = getTileIndex(walkGrid, start.tileX, start.tileY);
  const goalIndex = getTileIndex(walkGrid, goal.tileX, goal.tileY);
  let bestReachableIndex = startIndex;
  let bestReachableDistance = distance(tileCenter(start.tileX, start.tileY), target);
  let head = 0;
  let tail = 0;
  queue[tail] = startIndex;
  tail += 1;
  parents[startIndex] = startIndex;

  while (head < tail) {
    const currentIndex = queue[head];
    head += 1;
    const currentTileX = currentIndex % walkGrid.width;
    const currentTileY = Math.floor(currentIndex / walkGrid.width);
    const currentDistance = distance(tileCenter(currentTileX, currentTileY), target);
    if (currentDistance < bestReachableDistance) {
      bestReachableDistance = currentDistance;
      bestReachableIndex = currentIndex;
    }
    if (currentIndex === goalIndex) {
      break;
    }

    const neighbors = [
      { tileX: currentTileX + 1, tileY: currentTileY },
      { tileX: currentTileX - 1, tileY: currentTileY },
      { tileX: currentTileX, tileY: currentTileY + 1 },
      { tileX: currentTileX, tileY: currentTileY - 1 },
    ];

    for (const neighbor of neighbors) {
      if (!isWalkableTile(walkGrid, neighbor.tileX, neighbor.tileY)) {
        continue;
      }

      const neighborIndex = getTileIndex(walkGrid, neighbor.tileX, neighbor.tileY);
      if (parents[neighborIndex] !== -1) {
        continue;
      }

      parents[neighborIndex] = currentIndex;
      queue[tail] = neighborIndex;
      tail += 1;
    }
  }

  const resolvedGoalIndex = parents[goalIndex] !== -1 ? goalIndex : bestReachableIndex;
  if (resolvedGoalIndex === startIndex) {
    return chooseDirectionToward(state, actor, target, moveOptions, excludedDirections, preferredDirection);
  }

  let nextIndex = resolvedGoalIndex;
  while (parents[nextIndex] !== startIndex && nextIndex !== startIndex) {
    nextIndex = parents[nextIndex];
  }

  if (nextIndex === startIndex) {
    return chooseDirectionToward(state, actor, target, moveOptions, excludedDirections, preferredDirection);
  }

  const nextTileX = nextIndex % walkGrid.width;
  const nextTileY = Math.floor(nextIndex / walkGrid.width);
  const deltaTileX = nextTileX - start.tileX;
  const deltaTileY = nextTileY - start.tileY;
  let candidateDirection: Direction | null = null;

  if (deltaTileX > 0) {
    candidateDirection = "right";
  } else if (deltaTileX < 0) {
    candidateDirection = "left";
  } else if (deltaTileY > 0) {
    candidateDirection = "down";
  } else if (deltaTileY < 0) {
    candidateDirection = "up";
  }

  if (candidateDirection) {
    const alignmentMove = getLedgeAlignmentMove(state, actor, candidateDirection, moveOptions);
    if (
      alignmentMove &&
      !excludedDirections.includes(alignmentMove) &&
      !excludedDirections.includes(candidateDirection) &&
      !canActorProgress(state, actor, candidateDirection, moveOptions)
    ) {
      return alignmentMove;
    }
  }

  const nextTileCenter = tileCenter(nextTileX, nextTileY);
  return (
    chooseBestScoredDirection(
      state,
      actor,
      filterExcludedDirections([candidateDirection ?? "up", ...CARDINAL_DIRECTIONS], excludedDirections),
      (candidate) => {
        const routeScore = getDistanceImprovement(actor, candidate.probe.destination, nextTileCenter) * 12;
        const targetScore = getDistanceImprovement(actor, candidate.probe.destination, target) * 6;
        const bias = candidate.intendedDirection === candidateDirection ? TILE_SIZE : 0;
        const directnessBias = candidate.direction === candidate.intendedDirection ? TILE_SIZE * 0.25 : 0;
        const preferredBias =
          preferredDirection && candidate.direction === preferredDirection ? TILE_SIZE * 0.75 : 0;
        return routeScore + targetScore + bias + directnessBias + preferredBias;
      },
      moveOptions,
      excludedDirections,
    ) ?? chooseDirectionToward(state, actor, target, moveOptions, excludedDirections, preferredDirection)
  );
}

function chooseDirectionAway(state: MatchState, actor: ActorBase, threat: Vec2): Direction | null {
  return (
    chooseBestScoredDirection(state, actor, CARDINAL_DIRECTIONS, (candidate) => {
      const losBroken = !canSeePoint(
        candidate.probe.destination,
        threat,
        getVisionRadius(actor.kind === "npc" ? "npc" : "springtrap"),
        getMap(state).obstacles,
      );
      const escapeGain = (distance(candidate.probe.destination, threat) - distance(actor, threat)) * 8;
      const directnessBias = candidate.direction === candidate.intendedDirection ? TILE_SIZE * 0.25 : 0;
      return distance(candidate.probe.destination, threat) + escapeGain + (losBroken ? TILE_SIZE * 2 : 0) + directnessBias;
    }) ?? chooseAnyProgressDirection(state, actor)
  );
}

function chooseAnyProgressDirection(state: MatchState, actor: ActorBase): Direction | null {
  return chooseAnyProgressDirectionExcept(state, actor);
}

function chooseAnyProgressDirectionExcept(
  state: MatchState,
  actor: ActorBase,
  excludedDirections: Direction[] = [],
): Direction | null {
  const directions = filterExcludedDirections([...CARDINAL_DIRECTIONS], excludedDirections);
  for (let index = directions.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const temp = directions[index];
    directions[index] = directions[swapIndex];
    directions[swapIndex] = temp;
  }

  return directions.find((direction) => canActorProgress(state, actor, direction)) ?? null;
}

function chooseNpcGeneratorTarget(state: MatchState, npc: NpcState): GeneratorData | null {
  const incomplete = state.generators.filter((generator) => !generator.completed);
  if (incomplete.length === 0) {
    return null;
  }

  const assignedCounts = new Map<string, number>();
  for (const otherNpc of state.npcs) {
    if (!isNpcAlive(otherNpc) || otherNpc.id === npc.id || !otherNpc.targetGeneratorId) {
      continue;
    }

    assignedCounts.set(otherNpc.targetGeneratorId, (assignedCounts.get(otherNpc.targetGeneratorId) ?? 0) + 1);
  }

  return [...incomplete].sort((left, right) => {
    const leftAssigned = assignedCounts.get(left.id) ?? 0;
    const rightAssigned = assignedCounts.get(right.id) ?? 0;
    if (leftAssigned !== rightAssigned) {
      return leftAssigned - rightAssigned;
    }

    return distance(npc, left) - distance(npc, right);
  })[0];
}

function chooseVisibleSpringtrapDistractionNpc(state: MatchState, springtrap: SpringtrapState): NpcState | null {
  const map = getMap(state);
  const visibleNpcs = state.npcs.filter(
    (npc) => isNpcAlive(npc) && canSeePoint(springtrap, npc, getVisionRadius("springtrap"), map.obstacles),
  );
  if (visibleNpcs.length === 0) {
    return null;
  }

  return [...visibleNpcs].sort((left, right) => distance(springtrap, left) - distance(springtrap, right))[0];
}

function getRepairCueTarget(state: MatchState, springtrap: SpringtrapState): Vec2 | null {
  const generator = getGeneratorById(state, state.luluRepairingGeneratorId);
  if (!generator) {
    return null;
  }

  if (state.mode === "single" && getSinglePlayerAiConfig().repairCueGlobalWhileRepairing) {
    return state.lulu;
  }

  return distance(springtrap, generator) <= getSinglePlayerAiConfig().repairCueRadiusPx ? generator : null;
}

function maybeRefreshSpringtrapRepairChase(state: MatchState, previousRepairingGeneratorId: string | null): void {
  if (state.mode !== "single") {
    return;
  }

  const currentRepairingGeneratorId = state.luluRepairingGeneratorId;
  if (!currentRepairingGeneratorId || currentRepairingGeneratorId === previousRepairingGeneratorId) {
    return;
  }

  for (const springtrap of state.springtraps) {
    springtrap.facing = getFacingToward(springtrap, state.lulu);
    enterChase(state, springtrap, state.lulu);
  }
}

function rememberConfirmedLulu(springtrap: SpringtrapState, lulu: LuluState, point: Vec2 = lulu): void {
  springtrap.aiLastConfirmedLulu = { x: point.x, y: point.y };
  springtrap.aiLastConfirmedLuluDirection = lulu.facing;
}

function getProjectedChaseTarget(state: MatchState, springtrap: SpringtrapState): Vec2 | null {
  if (!springtrap.aiLastConfirmedLulu) {
    return null;
  }

  if (!springtrap.aiLastConfirmedLuluDirection || springtrap.aiChaseSightLossMs <= 0) {
    return springtrap.aiLastConfirmedLulu;
  }

  const grid = getSpringtrapWalkGrid(getMap(state));
  const projectedPoint = findNearestWalkablePoint(
    getMap(state),
    offsetPoint(
      springtrap.aiLastConfirmedLulu,
      springtrap.aiLastConfirmedLuluDirection,
      getSinglePlayerAiConfig().searchWaypointStepPx,
    ),
    grid,
  );

  return distance(projectedPoint, springtrap.aiLastConfirmedLulu) > PROBE_PROGRESS_EPSILON_PX
    ? projectedPoint
    : springtrap.aiLastConfirmedLulu;
}

function resetSpringtrapCommitState(springtrap: SpringtrapState): void {
  springtrap.aiCommitDirection = null;
  springtrap.aiCommitRemainingMs = 0;
  springtrap.aiBlockedCommitFrames = 0;
  springtrap.aiStuckFrames = 0;
  springtrap.aiStuckAnchor = null;
  springtrap.aiStuckLastPosition = null;
}

function clearSpringtrapCommitDirection(springtrap: SpringtrapState): Direction | null {
  const previousDirection = springtrap.aiCommitDirection;
  springtrap.aiCommitDirection = null;
  springtrap.aiCommitRemainingMs = 0;
  springtrap.aiBlockedCommitFrames = 0;
  return previousDirection;
}

function resetSpringtrapStuckWindow(springtrap: SpringtrapState): void {
  springtrap.aiStuckFrames = 0;
  springtrap.aiStuckAnchor = { x: springtrap.x, y: springtrap.y };
  springtrap.aiStuckLastPosition = { x: springtrap.x, y: springtrap.y };
}

function beginSpringtrapCommit(
  springtrap: SpringtrapState,
  direction: Direction,
  durationMs: number = getSinglePlayerAiConfig().routeCommitMs,
): void {
  springtrap.aiCommitDirection = direction;
  springtrap.aiCommitRemainingMs = durationMs;
  springtrap.aiBlockedCommitFrames = 0;
  resetSpringtrapStuckWindow(springtrap);
}

function clearSpringtrapCommitAndRestartWindow(springtrap: SpringtrapState): Direction | null {
  const previousDirection = clearSpringtrapCommitDirection(springtrap);
  resetSpringtrapStuckWindow(springtrap);
  return previousDirection;
}

function updateSpringtrapCommitWindow(
  springtrap: SpringtrapState,
  target: Vec2,
): Direction | null {
  const aiConfig = getSinglePlayerAiConfig();
  if (!springtrap.aiStuckAnchor || !springtrap.aiStuckLastPosition) {
    resetSpringtrapStuckWindow(springtrap);
    return null;
  }

  const improvement =
    distance(springtrap.aiStuckAnchor, target) - distance(springtrap, target);
  if (springtrap.aiCommitDirection && improvement >= 16) {
    clearSpringtrapCommitDirection(springtrap);
    resetSpringtrapStuckWindow(springtrap);
    return null;
  }

  const movedThisFrame = distance(springtrap, springtrap.aiStuckLastPosition);
  const stutteringInPlace =
    springtrap.aiCommitDirection !== null &&
    springtrap.aiBlockedCommitFrames > 0 &&
    movedThisFrame <= aiConfig.stuckMoveThresholdPx;

  if (stutteringInPlace) {
    springtrap.aiStuckFrames += 1;
  } else {
    springtrap.aiStuckFrames = 0;
  }
  springtrap.aiStuckLastPosition = { x: springtrap.x, y: springtrap.y };

  if (
    springtrap.aiCommitDirection &&
    springtrap.aiBlockedCommitFrames >= aiConfig.blockedCommitFrames &&
    springtrap.aiStuckFrames >= aiConfig.stuckFrames
  ) {
    return clearSpringtrapCommitAndRestartWindow(springtrap);
  }

  return null;
}

function enterHunt(springtrap: SpringtrapState): void {
  springtrap.aiState = "hunt";
  springtrap.aiStateRemainingMs = 0;
  springtrap.aiChaseSightLossMs = 0;
  springtrap.aiHuntRetargetRemainingMs = 0;
  springtrap.aiSearchWaypointIndex = 0;
  springtrap.aiSearchWaypoints = [];
  springtrap.aiDistractionNpcId = null;
  springtrap.aiPriorityChestId = null;
  resetSpringtrapCommitState(springtrap);
}

function enterChase(state: MatchState, springtrap: SpringtrapState, point: Vec2 = state.lulu): void {
  springtrap.aiState = "chase";
  springtrap.aiStateRemainingMs = 0;
  springtrap.aiChaseSightLossMs = 0;
  springtrap.aiSearchWaypointIndex = 0;
  springtrap.aiSearchWaypoints = [];
  springtrap.aiDistractionNpcId = null;
  springtrap.aiPriorityChestId = null;
  resetSpringtrapCommitState(springtrap);
  rememberConfirmedLulu(springtrap, state.lulu, point);
}

function enterSearch(state: MatchState, springtrap: SpringtrapState): void {
  const origin = springtrap.aiLastConfirmedLulu ?? { x: state.lulu.x, y: state.lulu.y };
  springtrap.aiState = "search";
  springtrap.aiStateRemainingMs = getSinglePlayerAiConfig().searchDurationMs;
  springtrap.aiChaseSightLossMs = 0;
  springtrap.aiSearchWaypointIndex = 0;
  springtrap.aiSearchWaypoints = buildSearchWaypoints(
    state,
    origin,
    springtrap.aiLastConfirmedLuluDirection,
    getSpringtrapWalkGrid(getMap(state)),
  );
  springtrap.aiDistractionNpcId = null;
  springtrap.aiPriorityChestId = null;
  resetSpringtrapCommitState(springtrap);
}

function enterCooldown(state: MatchState, springtrap: SpringtrapState): void {
  springtrap.aiState = "cooldown";
  springtrap.aiStateRemainingMs = getSinglePlayerAiConfig().cooldownDurationMs;
  springtrap.aiChaseSightLossMs = 0;
  springtrap.aiSearchWaypointIndex = 0;
  springtrap.aiSearchWaypoints = [];
  springtrap.aiDistractionNpcId = null;
  springtrap.aiPriorityChestId = null;
  springtrap.aiHuntTarget = pickRoamTarget(state);
  resetSpringtrapCommitState(springtrap);
}

function getRectOverlapMetrics(
  left: { x: number; y: number; w: number; h: number },
  right: { x: number; y: number; w: number; h: number },
): { overlapX: number; overlapY: number; area: number } {
  const overlapX = Math.max(0, Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x));
  const overlapY = Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y));
  return {
    overlapX,
    overlapY,
    area: overlapX * overlapY,
  };
}

function getPredictedLuluAttackTarget(state: MatchState, luluMoveHint: Direction | null): Vec2 {
  if (!luluMoveHint) {
    return { x: state.lulu.x, y: state.lulu.y };
  }

  const predictionMs = GAME_CONFIG.attack.windupMs + FIXED_STEP_MS * 2;
  return projectActorMove(state, state.lulu, luluMoveHint, predictionMs, {
    allowAutoVault: false,
  });
}

function getSpringtrapWrenchAttackMaxDistancePx(state: MatchState, springtrap: SpringtrapState): number {
  return (
    GAME_CONFIG.boosts.wrenchProjectileRangePx +
    Math.max(springtrap.collider.w, springtrap.collider.h) * 0.5 +
    GAME_CONFIG.boosts.projectileSizePx * 0.5 +
    Math.max(state.lulu.collider.w, state.lulu.collider.h) * 0.5
  );
}

function getPredictedLuluWrenchTarget(
  state: MatchState,
  springtrap: SpringtrapState,
  luluMoveHint: Direction | null,
): Vec2 {
  if (!luluMoveHint) {
    return { x: state.lulu.x, y: state.lulu.y };
  }

  const projectileTravelPx = Math.max(
    0,
    distance(springtrap, state.lulu) -
      Math.max(springtrap.collider.w, springtrap.collider.h) * 0.5 -
      GAME_CONFIG.boosts.projectileSizePx * 0.5,
  );
  const predictionMs =
    GAME_CONFIG.attack.windupMs + (projectileTravelPx / GAME_CONFIG.boosts.wrenchProjectileSpeedPx) * 1_000;
  return projectActorMove(state, state.lulu, luluMoveHint, predictionMs, {
    allowAutoVault: false,
  });
}

function getWrenchProjectileOrigin(owner: SpringtrapState, facing: Direction = owner.facing): Vec2 {
  const halfProjectile = GAME_CONFIG.boosts.projectileSizePx * 0.5;
  const halfOwnerW = owner.collider.w * 0.5;
  const halfOwnerH = owner.collider.h * 0.5;
  if (facing === "left") {
    return {
      x: owner.x - halfOwnerW - halfProjectile,
      y: owner.y,
    };
  }
  if (facing === "right") {
    return {
      x: owner.x + halfOwnerW + halfProjectile,
      y: owner.y,
    };
  }
  if (facing === "up") {
    return {
      x: owner.x,
      y: owner.y - halfOwnerH - halfProjectile,
    };
  }
  return {
    x: owner.x,
    y: owner.y + halfOwnerH + halfProjectile,
  };
}

function buildWrenchAttackRect(killer: SpringtrapState, facing: Direction = killer.facing) {
  const width = GAME_CONFIG.boosts.projectileSizePx;
  const range = GAME_CONFIG.boosts.wrenchProjectileRangePx + width;
  const halfWidth = width * 0.5;
  const halfKillerW = killer.collider.w * 0.5;
  const halfKillerH = killer.collider.h * 0.5;

  if (facing === "left") {
    return {
      x: killer.x - halfKillerW - range,
      y: killer.y - halfWidth,
      w: range,
      h: width,
    };
  }

  if (facing === "right") {
    return {
      x: killer.x + halfKillerW,
      y: killer.y - halfWidth,
      w: range,
      h: width,
    };
  }

  if (facing === "up") {
    return {
      x: killer.x - halfWidth,
      y: killer.y - halfKillerH - range,
      w: width,
      h: range,
    };
  }

  return {
    x: killer.x - halfWidth,
    y: killer.y + halfKillerH,
    w: width,
    h: range,
  };
}

function buildWrenchProjectileLaneRect(
  state: MatchState,
  springtrap: SpringtrapState,
  facing: Direction,
  luluTarget: Vec2 = state.lulu,
) {
  const projectileSize = GAME_CONFIG.boosts.projectileSizePx;
  const halfProjectile = projectileSize * 0.5;
  const origin = getWrenchProjectileOrigin(springtrap, facing);
  const targetRect = centeredRect(luluTarget, state.lulu.collider);

  if (facing === "left") {
    return {
      x: targetRect.x + targetRect.w,
      y: origin.y - halfProjectile,
      w: Math.max(0, origin.x + halfProjectile - (targetRect.x + targetRect.w)),
      h: projectileSize,
    };
  }
  if (facing === "right") {
    return {
      x: origin.x - halfProjectile,
      y: origin.y - halfProjectile,
      w: Math.max(0, targetRect.x - (origin.x - halfProjectile)),
      h: projectileSize,
    };
  }
  if (facing === "up") {
    return {
      x: origin.x - halfProjectile,
      y: targetRect.y + targetRect.h,
      w: projectileSize,
      h: Math.max(0, origin.y + halfProjectile - (targetRect.y + targetRect.h)),
    };
  }
  return {
    x: origin.x - halfProjectile,
    y: origin.y - halfProjectile,
    w: projectileSize,
    h: Math.max(0, targetRect.y - (origin.y - halfProjectile)),
  };
}

function isWrenchProjectileLaneClearForFacing(
  state: MatchState,
  springtrap: SpringtrapState,
  facing: Direction,
  luluTarget: Vec2 = state.lulu,
): boolean {
  const map = getMap(state);
  const laneRect = buildWrenchProjectileLaneRect(state, springtrap, facing, luluTarget);
  if (laneRect.w <= 0 || laneRect.h <= 0) {
    return true;
  }

  return !map.obstacles.some((obstacle) => intersects(laneRect, obstacle)) && !intersects(laneRect, map.gate);
}

function getAttackOptionForFacing(
  state: MatchState,
  springtrap: SpringtrapState,
  facing: Direction,
  luluTarget: Vec2 = state.lulu,
): AttackOption | null {
  if (state.lulu.health === "dead" || state.lulu.health === "escaped") {
    return null;
  }

  const overlap = getRectOverlapMetrics(buildAttackRect(springtrap, facing), centeredRect(luluTarget, state.lulu.collider));
  if (overlap.area <= 0) {
    return null;
  }

  const perpendicularOverlap = facing === "left" || facing === "right" ? overlap.overlapY : overlap.overlapX;
  const clean =
    perpendicularOverlap >= getSinglePlayerAiConfig().attackMinPerpendicularOverlapPx &&
    overlap.area >= getSinglePlayerAiConfig().attackMinOverlapAreaPx;

  return {
    facing,
    overlapArea: overlap.area,
    perpendicularOverlap,
    clean,
    score: overlap.area * 4 + perpendicularOverlap * 32 + (clean ? 10_000 : 0),
  };
}

function getWrenchAttackOptionForFacing(
  state: MatchState,
  springtrap: SpringtrapState,
  facing: Direction,
  luluTarget: Vec2 = state.lulu,
): AttackOption | null {
  const overlap = getRectOverlapMetrics(buildWrenchAttackRect(springtrap, facing), centeredRect(luluTarget, state.lulu.collider));
  if (overlap.area <= 0) {
    return null;
  }

  if (!isWrenchProjectileLaneClearForFacing(state, springtrap, facing, luluTarget)) {
    return null;
  }

  const perpendicularOverlap = facing === "left" || facing === "right" ? overlap.overlapY : overlap.overlapX;
  const clean =
    perpendicularOverlap >= getSinglePlayerAiConfig().attackMinPerpendicularOverlapPx &&
    overlap.area >= getSinglePlayerAiConfig().attackMinOverlapAreaPx;

  return {
    facing,
    overlapArea: overlap.area,
    perpendicularOverlap,
    clean,
    score: overlap.area * 5 + perpendicularOverlap * 48 + (clean ? 10_000 : 0),
  };
}

function getBestLuluAttackOption(
  state: MatchState,
  springtrap: SpringtrapState,
  luluTarget: Vec2 = state.lulu,
): AttackOption | null {
  const dx = luluTarget.x - springtrap.x;
  const dy = luluTarget.y - springtrap.y;
  const primary: Direction =
    Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "down" : "up";
  const secondary: Direction =
    primary === "left" || primary === "right" ? (dy >= 0 ? "down" : "up") : dx >= 0 ? "right" : "left";
  let bestOption: AttackOption | null = null;

  for (const facing of uniqueDirections([primary, secondary, ...CARDINAL_DIRECTIONS])) {
    const option = getAttackOptionForFacing(state, springtrap, facing, luluTarget);
    if (!option) {
      continue;
    }

    if (!bestOption || option.score > bestOption.score) {
      bestOption = option;
    }
  }

  return bestOption;
}

function getBestLuluWrenchAttackOption(
  state: MatchState,
  springtrap: SpringtrapState,
  luluTarget: Vec2 = state.lulu,
): AttackOption | null {
  const dx = luluTarget.x - springtrap.x;
  const dy = luluTarget.y - springtrap.y;
  const primary: Direction =
    Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "down" : "up";
  const secondary: Direction =
    primary === "left" || primary === "right" ? (dy >= 0 ? "down" : "up") : dx >= 0 ? "right" : "left";
  let bestOption: AttackOption | null = null;

  for (const facing of uniqueDirections([primary, secondary, ...CARDINAL_DIRECTIONS])) {
    const option = getWrenchAttackOptionForFacing(state, springtrap, facing, luluTarget);
    if (!option) {
      continue;
    }

    if (!bestOption || option.score > bestOption.score) {
      bestOption = option;
    }
  }

  return bestOption;
}

function getLuluAlignmentDistance(actor: Vec2, target: Vec2, facing: Direction): number {
  return facing === "left" || facing === "right" ? Math.abs(actor.y - target.y) : Math.abs(actor.x - target.x);
}

function chooseSpringtrapAttackRepositionMove(
  state: MatchState,
  springtrap: SpringtrapState,
  luluTarget: Vec2 = state.lulu,
): Direction | null {
  const currentOption = getBestLuluAttackOption(state, springtrap, luluTarget);
  const currentDistance = distance(springtrap, luluTarget);
  let bestDirection: Direction | null = null;
  let bestScore = currentOption?.score ?? -Infinity;

  for (const direction of CARDINAL_DIRECTIONS) {
    const probe = probeActorMove(state, springtrap, direction);
    if (!probe.madeProgress) {
      continue;
    }

    const option = getBestLuluAttackOption(state, probe.actor as SpringtrapState, luluTarget);
    const nextDistance = distance(probe.destination, luluTarget);
    const distanceGain = currentDistance - nextDistance;
    const bestAlignmentDistance = Math.min(
      ...CARDINAL_DIRECTIONS.map((facing) => getLuluAlignmentDistance(probe.destination, luluTarget, facing)),
    );
    const score =
      (option?.score ?? 0) +
      distanceGain * 32 -
      bestAlignmentDistance * 2 +
      (distanceGain > 0 ? TILE_SIZE : -TILE_SIZE * 2);
    if (score > bestScore) {
      bestScore = score;
      bestDirection = direction;
    }
  }

  return bestDirection;
}

function chooseSpringtrapWrenchRepositionMove(
  state: MatchState,
  springtrap: SpringtrapState,
  luluTarget: Vec2 = state.lulu,
): Direction | null {
  const currentOption = getBestLuluWrenchAttackOption(state, springtrap, luluTarget);
  const currentDistance = distance(springtrap, luluTarget);
  const maxAttackDistance = getSpringtrapWrenchAttackMaxDistancePx(state, springtrap);
  const preferredDistance = Math.max(GAME_CONFIG.attack.range + TILE_SIZE, maxAttackDistance * 0.72);
  let bestDirection: Direction | null = null;
  let bestScore = currentOption?.score ?? -Infinity;

  for (const direction of CARDINAL_DIRECTIONS) {
    const probe = probeActorMove(state, springtrap, direction);
    if (!probe.madeProgress) {
      continue;
    }

    const option = getBestLuluWrenchAttackOption(state, probe.actor as SpringtrapState, luluTarget);
    const nextDistance = distance(probe.destination, luluTarget);
    if (nextDistance > currentDistance + PROBE_PROGRESS_EPSILON_PX) {
      continue;
    }
    const alignmentDistance = Math.min(
      ...CARDINAL_DIRECTIONS.map((facing) => getLuluAlignmentDistance(probe.destination, luluTarget, facing)),
    );
    const inRangeBonus = nextDistance <= maxAttackDistance ? TILE_SIZE * 2 : -TILE_SIZE * 2;
    const idealDistancePenalty = Math.abs(nextDistance - preferredDistance) * 2.25;
    const crowdingPenalty =
      nextDistance < GAME_CONFIG.attack.range + TILE_SIZE ? (GAME_CONFIG.attack.range + TILE_SIZE - nextDistance) * 10 : 0;
    const unnecessaryAdvancePenalty =
      currentDistance <= maxAttackDistance && nextDistance < currentDistance ? (currentDistance - nextDistance) * 8 : 0;
    const score =
      (option?.score ?? 0) +
      inRangeBonus -
      idealDistancePenalty -
      crowdingPenalty -
      unnecessaryAdvancePenalty -
      alignmentDistance * 2;
    if (score > bestScore) {
      bestScore = score;
      bestDirection = direction;
    }
  }

  return bestDirection;
}

function beginNpcWander(npc: NpcState): void {
  npc.aiMode = "wander";
  npc.targetGeneratorId = null;
  npc.wanderDirection = pickRandomDirection();
  npc.decisionRemainingMs = randomBetween(
    GAME_CONFIG.npcAi.wanderDecisionMinMs,
    GAME_CONFIG.npcAi.wanderDecisionMaxMs,
  );
}

function beginNpcGeneratorTask(state: MatchState, npc: NpcState): void {
  const generator = chooseNpcGeneratorTarget(state, npc);
  if (!generator) {
    beginNpcWander(npc);
    return;
  }

  npc.aiMode = "move_to_generator";
  npc.targetGeneratorId = generator.id;
  npc.decisionRemainingMs = randomBetween(
    GAME_CONFIG.npcAi.assistDecisionMinMs,
    GAME_CONFIG.npcAi.assistDecisionMaxMs,
  );
}

function getNpcThreatMove(state: MatchState, npc: NpcState, map = getMap(state)): Direction | null {
  const nearestSpringtrap = getNearestSpringtrap(state, npc);
  if (!nearestSpringtrap) {
    return null;
  }

  const seesSpringtrap = canSeePoint(npc, nearestSpringtrap, getVisionRadius("npc"), map.obstacles);
  const closeThreat = distance(npc, nearestSpringtrap) <= GAME_CONFIG.npcAi.threatRange;

  if (seesSpringtrap || closeThreat) {
    npc.aiMode = "flee";
    npc.decisionRemainingMs = GAME_CONFIG.npcAi.fleeResetMs;
    return chooseDirectionAway(state, npc, nearestSpringtrap);
  }

  return null;
}

function getNpcMove(state: MatchState, npc: NpcState, deltaMs: number): Direction | null {
  if (!isNpcAlive(npc)) {
    return null;
  }

  if (npc.lock.kind !== "none") {
    return null;
  }

  const threatMove = getNpcThreatMove(state, npc);
  if (threatMove) {
    return threatMove;
  }

  if (npc.aiMode === "flee") {
    npc.decisionRemainingMs -= deltaMs;
    if (npc.decisionRemainingMs > 0) {
      const nearestSpringtrap = getNearestSpringtrap(state, npc);
      return nearestSpringtrap ? chooseDirectionAway(state, npc, nearestSpringtrap) : null;
    }

    npc.aiMode = "wander";
    npc.decisionRemainingMs = 0;
  }

  const targetGenerator = getGeneratorById(state, npc.targetGeneratorId);
  if (targetGenerator?.completed) {
    npc.targetGeneratorId = null;
    npc.aiMode = "wander";
    npc.decisionRemainingMs = 0;
  }

  if (npc.aiMode === "move_to_generator" && targetGenerator) {
    if (distance(npc, targetGenerator) <= GAME_CONFIG.generator.repairRange - 2) {
      npc.aiMode = "repair_generator";
      return null;
    }

    return choosePathDirectionToward(state, npc, targetGenerator) ?? chooseAnyProgressDirection(state, npc);
  }

  if (npc.aiMode === "repair_generator" && targetGenerator) {
    if (distance(npc, targetGenerator) > GAME_CONFIG.generator.repairRange + 6) {
      npc.aiMode = "move_to_generator";
      return choosePathDirectionToward(state, npc, targetGenerator) ?? chooseAnyProgressDirection(state, npc);
    }

    npc.decisionRemainingMs -= deltaMs;
    if (npc.decisionRemainingMs <= 0) {
      if (Math.random() < 0.5) {
        beginNpcWander(npc);
      } else {
        beginNpcGeneratorTask(state, npc);
      }
    }
    return null;
  }

  npc.decisionRemainingMs -= deltaMs;
  if (npc.decisionRemainingMs <= 0) {
    if (Math.random() < 0.5) {
      beginNpcWander(npc);
    } else {
      beginNpcGeneratorTask(state, npc);
    }
  }

  if (npc.aiMode !== "wander") {
    return getNpcMove(state, npc, deltaMs);
  }

  if (!npc.wanderDirection || !canActorProgress(state, npc, npc.wanderDirection)) {
    npc.wanderDirection = chooseAnyProgressDirection(state, npc) ?? pickRandomDirection();
    npc.decisionRemainingMs = randomBetween(
      GAME_CONFIG.npcAi.wanderDecisionMinMs,
      GAME_CONFIG.npcAi.wanderDecisionMaxMs,
    );
  }

  return npc.wanderDirection;
}

function chooseSpringtrapRouteMove(
  state: MatchState,
  springtrap: SpringtrapState,
  target: Vec2 | null,
  deltaMs: number,
  seesLulu: boolean,
): Direction | null {
  const walkGrid = getSpringtrapWalkGrid(getMap(state));
  if (!target) {
    return chooseAnyProgressDirection(state, springtrap);
  }

  const shouldCommitRoute =
    springtrap.aiState === "search" || (springtrap.aiState === "chase" && !seesLulu);
  if (!shouldCommitRoute) {
    clearSpringtrapCommitDirection(springtrap);
    resetSpringtrapStuckWindow(springtrap);
    return (
      choosePathDirectionToward(state, springtrap, target, {
        walkGrid,
      }) ?? chooseAnyProgressDirection(state, springtrap)
    );
  }

  const excludedDirections: Direction[] = [];
  const tryBackoffMove = (blockedDirection: Direction | null): Direction | null => {
    if (!blockedDirection) {
      return null;
    }

    const backoffDirection = getOppositeDirection(blockedDirection);
    if (!canActorProgress(state, springtrap, backoffDirection)) {
      return null;
    }

    beginSpringtrapCommit(springtrap, backoffDirection, getSinglePlayerAiConfig().stuckBackoffMs);
    return backoffDirection;
  };
  const stuckDirection = updateSpringtrapCommitWindow(springtrap, target);
  if (stuckDirection) {
    const backoffMove = tryBackoffMove(stuckDirection);
    if (backoffMove) {
      return backoffMove;
    }
    excludedDirections.push(stuckDirection);
  }

  if (springtrap.aiCommitDirection) {
    excludedDirections.push(getOppositeDirection(springtrap.aiCommitDirection));
    springtrap.aiCommitRemainingMs = Math.max(0, springtrap.aiCommitRemainingMs - deltaMs);
    if (springtrap.aiCommitRemainingMs <= 0) {
      const expiredDirection = clearSpringtrapCommitAndRestartWindow(springtrap);
      if (expiredDirection) {
        excludedDirections.push(expiredDirection);
      }
    } else if (canActorProgress(state, springtrap, springtrap.aiCommitDirection)) {
      springtrap.aiBlockedCommitFrames = 0;
    } else {
      springtrap.aiBlockedCommitFrames += 1;
      if (springtrap.aiBlockedCommitFrames >= getSinglePlayerAiConfig().blockedCommitFrames) {
        const blockedDirection = clearSpringtrapCommitAndRestartWindow(springtrap);
        if (blockedDirection) {
          excludedDirections.push(blockedDirection);
        }
      }
    }
  }

  const move =
    choosePathDirectionToward(state, springtrap, target, {
      walkGrid,
      excludedDirections,
      preferredDirection: springtrap.aiCommitDirection,
      forceRoute: true,
    }) ?? chooseAnyProgressDirectionExcept(state, springtrap, excludedDirections);

  if (move && !springtrap.aiCommitDirection) {
    beginSpringtrapCommit(springtrap, move);
  }

  return move;
}

function getSpringtrapAiInput(
  state: MatchState,
  springtrap: SpringtrapState,
  deltaMs: number,
  luluMoveHint: Direction | null = null,
): MatchControls["springtrap"] {
  const aiConfig = getSinglePlayerAiConfig();
  const map = getMap(state);
  if (springtrap.flashOverlayRemainingMs > 0 || springtrap.lock.kind === "flashBlinded") {
    springtrap.aiLastConfirmedLuluDirection = null;
    return {
      move: null,
      actionPressed: false,
      actionHeld: false,
    };
  }

  const luluAlive = state.lulu.health !== "dead" && state.lulu.health !== "escaped";
  if (!luluAlive) {
    enterHunt(springtrap);
    return {
      move: null,
      actionPressed: false,
      actionHeld: false,
    };
  }

  const seesLulu = canSeePoint(springtrap, state.lulu, getVisionRadius("springtrap"), map.obstacles);
  const closeContact = distance(springtrap, state.lulu) <= aiConfig.closeContactRadiusPx;
  const repairCueTarget = getRepairCueTarget(state, springtrap);
  const hasStrongRepairCue = repairCueTarget !== null;
  const itemCueTarget = getSpringtrapItemCueTarget(state, springtrap);
  const hasStrongItemCue = itemCueTarget !== null;
  springtrap.aiPriorityChestId = null;
  const usingWrench = canSpringtrapThrowWrench(springtrap);
  const chooseMove = (target: Vec2 | null): Direction | null => {
    return chooseSpringtrapRouteMove(state, springtrap, target, deltaMs, seesLulu);
  };

  const chaseCueTarget = repairCueTarget ?? itemCueTarget;
  if (hasStrongRepairCue || hasStrongItemCue) {
    springtrap.aiPriorityChestId = null;
    if (springtrap.aiState !== "chase") {
      enterChase(state, springtrap, chaseCueTarget ?? state.lulu);
    } else {
      rememberConfirmedLulu(springtrap, state.lulu, chaseCueTarget ?? state.lulu);
      springtrap.aiChaseSightLossMs = 0;
    }

    if (springtrap.lock.kind === "openingChest") {
      return {
        move: moveIntentFromDirection(chooseMove(chaseCueTarget ?? state.lulu)),
        actionPressed: false,
        actionHeld: false,
      };
    }
  }

  if (springtrap.lock.kind === "none") {
    const predictedLuluAttackTarget = usingWrench
      ? getPredictedLuluWrenchTarget(state, springtrap, luluMoveHint)
      : getPredictedLuluAttackTarget(state, luluMoveHint);
    const attackOption = usingWrench
      ? getBestLuluWrenchAttackOption(state, springtrap, predictedLuluAttackTarget)
      : getBestLuluAttackOption(state, springtrap, predictedLuluAttackTarget);
    if (attackOption?.clean) {
      springtrap.facing = attackOption.facing;
      return {
        move: null,
        actionPressed: true,
        actionHeld: false,
      };
    }

    const attackPressureDistance = usingWrench
      ? getSpringtrapWrenchAttackMaxDistancePx(state, springtrap)
      : GAME_CONFIG.attack.range + TILE_SIZE;
    if (attackOption || distance(springtrap, state.lulu) <= attackPressureDistance) {
      const repositionMove = usingWrench
        ? chooseSpringtrapWrenchRepositionMove(state, springtrap, predictedLuluAttackTarget)
        : chooseSpringtrapAttackRepositionMove(state, springtrap, predictedLuluAttackTarget);
      if (repositionMove) {
        return {
          move: moveIntentFromDirection(repositionMove),
          actionPressed: false,
          actionHeld: false,
        };
      }
    }
  }

  const getCommittedDistractionTarget = (): NpcState | null => {
    if (!shouldAllowNpcDistraction(state, springtrap.aiState)) {
      springtrap.aiDistractionNpcId = null;
      return null;
    }

    const npc = getNpcById(state, springtrap.aiDistractionNpcId);
    if (!npc || !isNpcAlive(npc)) {
      springtrap.aiDistractionNpcId = null;
      return null;
    }

    if (
      distance(springtrap, npc) <= aiConfig.distractionCatchRangePx ||
      !canSeePoint(springtrap, npc, getVisionRadius("springtrap"), map.obstacles)
    ) {
      springtrap.aiDistractionNpcId = null;
      return null;
    }

    return npc;
  };

  const maybeStartDistraction = (): NpcState | null => {
    if (!shouldAllowNpcDistraction(state, springtrap.aiState)) {
      springtrap.aiDistractionNpcId = null;
      return null;
    }

    const npc = chooseVisibleSpringtrapDistractionNpc(state, springtrap);
    if (!npc) {
      springtrap.aiDistractionNpcId = null;
      return null;
    }

    if (springtrap.aiState === "hunt" && distance(springtrap, npc) > aiConfig.closeContactRadiusPx * 2) {
      springtrap.aiDistractionNpcId = null;
      return null;
    }

    springtrap.aiDistractionNpcId = npc.id;
    return npc;
  };

  for (let guard = 0; guard < 4; guard += 1) {
    if (springtrap.aiState === "hunt") {
      if (seesLulu || closeContact || hasStrongRepairCue || hasStrongItemCue) {
        enterChase(state, springtrap, chaseCueTarget ?? state.lulu);
        continue;
      }

      springtrap.aiHuntRetargetRemainingMs = Math.max(0, springtrap.aiHuntRetargetRemainingMs - deltaMs);
      if (!springtrap.aiHuntTarget || springtrap.aiHuntRetargetRemainingMs <= 0) {
        springtrap.aiHuntTarget = getCoarseHuntTarget(state);
        springtrap.aiHuntRetargetRemainingMs = aiConfig.huntRetargetMs;
      }

      const distractionTarget = getCommittedDistractionTarget() ?? maybeStartDistraction();
      if (distractionTarget) {
        return {
          move: moveIntentFromDirection(chooseMove(distractionTarget)),
          actionPressed: false,
          actionHeld: false,
        };
      }

      return {
        move: moveIntentFromDirection(chooseMove(springtrap.aiHuntTarget)),
        actionPressed: false,
        actionHeld: false,
      };
    }

    if (springtrap.aiState === "chase") {
      if (seesLulu || closeContact || hasStrongRepairCue || hasStrongItemCue) {
        rememberConfirmedLulu(springtrap, state.lulu, chaseCueTarget ?? state.lulu);
        springtrap.aiChaseSightLossMs = 0;
      } else {
        springtrap.aiChaseSightLossMs += deltaMs;
      }

      if (
        springtrap.aiChaseSightLossMs >= aiConfig.chaseSightLossMs &&
        hasWalkDistanceAtLeast(
          state,
          springtrap,
          state.lulu,
          aiConfig.chaseEscapeDistancePx,
          getSpringtrapWalkGrid(getMap(state)),
        )
      ) {
        enterSearch(state, springtrap);
        continue;
      }

      return {
        move: moveIntentFromDirection(
          chooseMove(getProjectedChaseTarget(state, springtrap) ?? springtrap.aiLastConfirmedLulu ?? state.lulu),
        ),
        actionPressed: false,
        actionHeld: false,
      };
    }

    if (springtrap.aiState === "search") {
      if (seesLulu || closeContact || hasStrongRepairCue || hasStrongItemCue) {
        enterChase(state, springtrap, chaseCueTarget ?? state.lulu);
        continue;
      }

      springtrap.aiStateRemainingMs = Math.max(0, springtrap.aiStateRemainingMs - deltaMs);
      if (springtrap.aiStateRemainingMs <= 0) {
        enterCooldown(state, springtrap);
        continue;
      }

      const distractionTarget = getCommittedDistractionTarget() ?? maybeStartDistraction();
      if (distractionTarget) {
        return {
          move: moveIntentFromDirection(chooseMove(distractionTarget)),
          actionPressed: false,
          actionHeld: false,
        };
      }

      if (springtrap.aiSearchWaypoints.length === 0) {
        springtrap.aiSearchWaypoints = buildSearchWaypoints(
          state,
          springtrap.aiLastConfirmedLulu ?? state.lulu,
          springtrap.aiLastConfirmedLuluDirection,
          getSpringtrapWalkGrid(getMap(state)),
        );
      }

      const waypoint =
        springtrap.aiSearchWaypoints[
          Math.min(springtrap.aiSearchWaypointIndex, Math.max(0, springtrap.aiSearchWaypoints.length - 1))
        ] ?? springtrap.aiLastConfirmedLulu ?? state.lulu;

      const move = chooseMove(waypoint);
      if (distance(springtrap, waypoint) <= aiConfig.searchWaypointReachPx || move === null) {
        springtrap.aiSearchWaypointIndex =
          (springtrap.aiSearchWaypointIndex + 1) % Math.max(1, springtrap.aiSearchWaypoints.length);
        if (move === null) {
          springtrap.aiSearchWaypoints = buildSearchWaypoints(
            state,
            springtrap.aiLastConfirmedLulu ?? state.lulu,
            springtrap.aiLastConfirmedLuluDirection,
            getSpringtrapWalkGrid(getMap(state)),
          );
        }
      }

      return {
        move: moveIntentFromDirection(move),
        actionPressed: false,
        actionHeld: false,
      };
    }

    if (seesLulu || closeContact || hasStrongRepairCue || hasStrongItemCue) {
      enterChase(state, springtrap, chaseCueTarget ?? state.lulu);
      continue;
    }

    springtrap.aiStateRemainingMs = Math.max(0, springtrap.aiStateRemainingMs - deltaMs);
    if (springtrap.aiStateRemainingMs <= 0) {
      enterHunt(springtrap);
      continue;
    }

    if (!springtrap.aiHuntTarget || distance(springtrap, springtrap.aiHuntTarget) <= aiConfig.searchWaypointReachPx) {
      springtrap.aiHuntTarget = pickRoamTarget(state);
    }

    const cooldownMove = chooseMove(springtrap.aiHuntTarget);
    if (cooldownMove === null) {
      springtrap.aiHuntTarget = pickRoamTarget(state);
    }

    return {
      move: moveIntentFromDirection(cooldownMove),
      actionPressed: false,
      actionHeld: false,
    };
  }

  return {
    move: null,
    actionPressed: false,
    actionHeld: false,
  };
}

function isSpringtrapSlowedByPallet(state: MatchState, springtrap: SpringtrapState): boolean {
  const springtrapRect = centeredRect(springtrap, springtrap.collider);
  return state.pallets.some(
    (pallet) =>
      pallet.state === "downed" && pallet.slowsSpringtrap && intersects(springtrapRect, getPalletSlowRect(pallet)),
  );
}

function getSpeedForActor(state: MatchState, actor: ActorBase): number {
  if (actor.kind === "lulu") {
    return (actor as LuluState).burstRemainingMs > 0 ? GAME_CONFIG.burst.speed : GAME_CONFIG.movement.lulu;
  }
  if (actor.kind === "springtrap") {
    const speed = GAME_CONFIG.movement.springtrap;
    return isSpringtrapSlowedByPallet(state, actor as SpringtrapState)
      ? speed * GAME_CONFIG.pallet.slowMultiplier
      : speed;
  }
  return GAME_CONFIG.movement.npc;
}

function getAttackLockFacing(actor: ActorBase): Direction | null {
  if (
    actor.lock.kind === "attackWindup" ||
    actor.lock.kind === "attackActive" ||
    actor.lock.kind === "attackRecovery"
  ) {
    return actor.lock.facing;
  }

  return null;
}

function canActorMoveWhileLocked(actor: ActorBase): boolean {
  return (
    actor.lock.kind === "attackWindup" ||
    actor.lock.kind === "attackActive" ||
    actor.lock.kind === "attackRecovery" ||
    (actor.kind === "lulu" && actor.lock.kind === "hitSpin")
  );
}

function updateFacing(actor: ActorBase, move: MoveIntent | null): void {
  if (
    actor.lock.kind === "flashBlinded" ||
    actor.lock.kind === "hitSpin" ||
    actor.lock.kind === "hitStunned"
  ) {
    return;
  }

  const lockedFacing = getAttackLockFacing(actor);
  if (lockedFacing) {
    actor.facing = lockedFacing;
    return;
  }

  const facing = getMoveIntentFacing(move);
  if (facing) {
    actor.facing = facing;
  }
}

function getPalletRect(pallet: Pick<PalletRuntime, "x" | "y" | "orientation">) {
  return pallet.orientation === "horizontal"
    ? { x: pallet.x - 14, y: pallet.y - 5, w: 28, h: 10 }
    : { x: pallet.x - 5, y: pallet.y - 14, w: 10, h: 28 };
}

function getPalletSlowRect(pallet: Pick<PalletRuntime, "x" | "y" | "orientation">) {
  const base = getPalletRect(pallet);
  const padding = GAME_CONFIG.pallet.slowZonePaddingPx;
  return {
    x: base.x - padding,
    y: base.y - padding,
    w: base.w + padding * 2,
    h: base.h + padding * 2,
  };
}

function getActorWorldBounds(actor: ActorBase, worldWidth: number, worldHeight: number) {
  const halfW = actor.collider.w * 0.5;
  const halfH = actor.collider.h * 0.5;
  const inset = GAME_CONFIG.map.actorBoundsInsetPx;
  const minX = Math.max(halfW, inset);
  const maxX = Math.max(minX, worldWidth - Math.max(halfW, inset));
  const minY = Math.max(halfH, inset);
  const maxY = Math.max(minY, worldHeight - Math.max(halfH, inset));
  return {
    halfW,
    halfH,
    minX,
    maxX,
    minY,
    maxY,
  };
}

function clampActorPosition(actor: ActorBase, position: Vec2, worldWidth: number, worldHeight: number): Vec2 {
  const bounds = getActorWorldBounds(actor, worldWidth, worldHeight);
  return {
    x: clamp(position.x, bounds.minX, bounds.maxX),
    y: clamp(position.y, bounds.minY, bounds.maxY),
  };
}

function resolveAxisMove(
  actor: ActorBase,
  moveBy: number,
  axis: "x" | "y",
  solids: { x: number; y: number; w: number; h: number }[],
  worldWidth: number,
  worldHeight: number,
): void {
  if (moveBy === 0) {
    return;
  }

  const next = { x: actor.x, y: actor.y };
  next[axis] += moveBy;

  const { halfW, halfH, minX, maxX, minY, maxY } = getActorWorldBounds(actor, worldWidth, worldHeight);

  if (axis === "x") {
    next.x = clamp(next.x, minX, maxX);
  } else {
    next.y = clamp(next.y, minY, maxY);
  }

  const before = centeredRect(actor, actor.collider);
  const adjusted = { ...next };

  for (const solid of solids) {
    const candidate = centeredRect(adjusted, actor.collider);
    if (!intersects(candidate, solid)) {
      continue;
    }

    const overlapX = Math.max(0, Math.min(candidate.x + candidate.w, solid.x + solid.w) - Math.max(candidate.x, solid.x));
    const overlapY = Math.max(0, Math.min(candidate.y + candidate.h, solid.y + solid.h) - Math.max(candidate.y, solid.y));

    if (axis === "x" && overlapY > 0 && overlapY <= GAME_CONFIG.pathing.cornerAssistPx) {
      const snapAbove = solid.y - halfH;
      const snapBelow = solid.y + solid.h + halfH;
      adjusted.y = Math.abs(adjusted.y - snapAbove) <= Math.abs(adjusted.y - snapBelow) ? snapAbove : snapBelow;
      if (!intersects(centeredRect(adjusted, actor.collider), solid)) {
        continue;
      }
    }

    if (axis === "y" && overlapX > 0 && overlapX <= GAME_CONFIG.pathing.cornerAssistPx) {
      const snapLeft = solid.x - halfW;
      const snapRight = solid.x + solid.w + halfW;
      adjusted.x = Math.abs(adjusted.x - snapLeft) <= Math.abs(adjusted.x - snapRight) ? snapLeft : snapRight;
      if (!intersects(centeredRect(adjusted, actor.collider), solid)) {
        continue;
      }
    }

    if (axis === "x") {
      if (moveBy > 0 && before.x + before.w <= solid.x + 1) {
        adjusted.x = solid.x - halfW;
      }
      if (moveBy < 0 && before.x >= solid.x + solid.w - 1) {
        adjusted.x = solid.x + solid.w + halfW;
      }
    } else {
      if (moveBy > 0 && before.y + before.h <= solid.y + 1) {
        adjusted.y = solid.y - halfH;
      }
      if (moveBy < 0 && before.y >= solid.y + solid.h - 1) {
        adjusted.y = solid.y + solid.h + halfH;
      }
    }
  }

  actor.x = clamp(adjusted.x, minX, maxX);
  actor.y = clamp(adjusted.y, minY, maxY);
}

function getActorMovementSolids(state: MatchState, actor: ActorBase) {
  const map = getMap(state);
  const solids = map.obstacles.map((entry) => ({
    x: entry.x,
    y: entry.y,
    w: entry.w,
    h: entry.h,
  }));

  for (const ledge of map.ledges) {
    solids.push({ x: ledge.x, y: ledge.y, w: ledge.w, h: ledge.h });
  }

  if (actor.kind === "lulu") {
    for (const springtrap of state.springtraps) {
      solids.push(centeredRect(springtrap, springtrap.collider));
    }
  }

  if (actor.kind === "springtrap") {
    solids.push(centeredRect(state.lulu, state.lulu.collider));
  }

  return solids;
}

function getTraverseDuration(actor: ActorBase): number {
  return actor.kind === "springtrap" ? GAME_CONFIG.vault.springtrapMs : GAME_CONFIG.vault.luluMs;
}

function createTraverseData(actor: ActorBase, destination: Vec2, barrier: LedgeData): TraverseData {
  return {
    remainingMs: getTraverseDuration(actor),
    totalMs: getTraverseDuration(actor),
    from: { x: actor.x, y: actor.y },
    to: destination,
    sourceId: barrier.id,
    sourceType: "ledge",
  };
}

function shouldStartLedgeTraverse(actor: ActorBase, move: Direction, barrier: LedgeData, deltaDistance: number): Vec2 | null {
  if (barrier.orientation === "horizontal" && (move === "up" || move === "down")) {
    const withinX =
      actor.x >= barrier.x - actor.collider.w * 0.5 && actor.x <= barrier.x + barrier.w + actor.collider.w * 0.5;
    if (!withinX) {
      return null;
    }

    if (move === "down") {
      const barrierTop = barrier.y;
      const reachesBarrier = actor.y + actor.collider.h * 0.5 + deltaDistance >= barrierTop;
      const fromAbove = actor.y <= barrierTop;
      if (!fromAbove || !reachesBarrier) {
        return null;
      }

      return { x: actor.x, y: barrier.y + barrier.h + actor.collider.h * 0.5 + 1 };
    }

    const barrierBottom = barrier.y + barrier.h;
    const reachesBarrier = actor.y - actor.collider.h * 0.5 - deltaDistance <= barrierBottom;
    const fromBelow = actor.y >= barrierBottom;
    if (!fromBelow || !reachesBarrier) {
      return null;
    }

    return { x: actor.x, y: barrier.y - actor.collider.h * 0.5 - 1 };
  }

  if (barrier.orientation === "vertical" && (move === "left" || move === "right")) {
    const withinY =
      actor.y >= barrier.y - actor.collider.h * 0.5 && actor.y <= barrier.y + barrier.h + actor.collider.h * 0.5;
    if (!withinY) {
      return null;
    }

    if (move === "right") {
      const barrierLeft = barrier.x;
      const reachesBarrier = actor.x + actor.collider.w * 0.5 + deltaDistance >= barrierLeft;
      const fromLeft = actor.x <= barrierLeft;
      if (!fromLeft || !reachesBarrier) {
        return null;
      }

      return { x: barrier.x + barrier.w + actor.collider.w * 0.5 + 1, y: actor.y };
    }

    const barrierRight = barrier.x + barrier.w;
    const reachesBarrier = actor.x - actor.collider.w * 0.5 - deltaDistance <= barrierRight;
    const fromRight = actor.x >= barrierRight;
    if (!fromRight || !reachesBarrier) {
      return null;
    }

    return { x: barrier.x - actor.collider.w * 0.5 - 1, y: actor.y };
  }

  return null;
}

function isTraverseDestinationClear(state: MatchState, actor: ActorBase, destination: Vec2): boolean {
  const map = getMap(state);
  const worldWidth = map.widthTiles * TILE_SIZE;
  const worldHeight = map.heightTiles * TILE_SIZE;
  const { minX, maxX, minY, maxY } = getActorWorldBounds(actor, worldWidth, worldHeight);
  const landingRect = centeredRect(destination, actor.collider);
  if (
    destination.x < minX ||
    destination.y < minY ||
    destination.x > maxX ||
    destination.y > maxY
  ) {
    return false;
  }

  if (map.obstacles.some((obstacle) => intersects(landingRect, obstacle))) {
    return false;
  }

  if (actor.kind === "lulu") {
    return !state.springtraps.some((springtrap) => intersects(landingRect, centeredRect(springtrap, springtrap.collider)));
  }

  if (actor.kind === "springtrap") {
    return !intersects(landingRect, centeredRect(state.lulu, state.lulu.collider));
  }

  return true;
}

function tryStartLedgeTraverse(
  state: MatchState,
  actor: ActorBase,
  move: Direction,
  barrier: LedgeData,
  deltaDistance: number,
): boolean {
  const destination = shouldStartLedgeTraverse(actor, move, barrier, deltaDistance);
  if (!destination) {
    return false;
  }
  const map = getMap(state);
  const worldWidth = map.widthTiles * TILE_SIZE;
  const worldHeight = map.heightTiles * TILE_SIZE;
  const clampedDestination = clampActorPosition(actor, destination, worldWidth, worldHeight);
  if (
    Math.abs(clampedDestination.x - actor.x) < 0.01 &&
    Math.abs(clampedDestination.y - actor.y) < 0.01
  ) {
    return false;
  }
  if (!isTraverseDestinationClear(state, actor, clampedDestination)) {
    return false;
  }

  actor.lock = {
    kind: "vault",
    ...createTraverseData(actor, clampedDestination, barrier),
  };
  return true;
}

function tryAttachLedgeTraverseToAttackLock(
  state: MatchState,
  actor: ActorBase,
  move: Direction,
  barrier: LedgeData,
  deltaDistance: number,
): boolean {
  if (
    actor.kind !== "springtrap" ||
    !(
      actor.lock.kind === "attackWindup" ||
      actor.lock.kind === "attackActive" ||
      actor.lock.kind === "attackRecovery"
    ) ||
    actor.lock.traverse
  ) {
    return false;
  }

  const destination = shouldStartLedgeTraverse(actor, move, barrier, deltaDistance);
  if (!destination) {
    return false;
  }

  const map = getMap(state);
  const worldWidth = map.widthTiles * TILE_SIZE;
  const worldHeight = map.heightTiles * TILE_SIZE;
  const clampedDestination = clampActorPosition(actor, destination, worldWidth, worldHeight);
  if (
    Math.abs(clampedDestination.x - actor.x) < 0.01 &&
    Math.abs(clampedDestination.y - actor.y) < 0.01
  ) {
    return false;
  }
  if (!isTraverseDestinationClear(state, actor, clampedDestination)) {
    return false;
  }

  actor.lock.traverse = createTraverseData(actor, clampedDestination, barrier);
  return true;
}

function moveActor(
  state: MatchState,
  actor: ActorBase,
  move: MoveIntent | null,
  deltaMs: number,
  options: MoveActorOptions = {},
): void {
  updateFacing(actor, move);

  const manualVaultPressed = options.manualVaultPressed ?? false;
  const combineManualVaultAttack = options.combineManualVaultAttack ?? false;
  const effectiveMove = isMoveIntentActive(move) ? move : manualVaultPressed ? moveIntentFromDirection(actor.facing) : null;
  if (!isMoveIntentActive(effectiveMove) || (actor.lock.kind !== "none" && !canActorMoveWhileLocked(actor))) {
    return;
  }

  if (actor.kind === "lulu" && (state.lulu.health === "dead" || state.lulu.health === "escaped")) {
    return;
  }

  const map = getMap(state);
  const worldWidth = map.widthTiles * TILE_SIZE;
  const worldHeight = map.heightTiles * TILE_SIZE;
  const speed = getSpeedForActor(state, actor);
  const delta = speed * (deltaMs / 1_000);
  const allowAutoVault = options.allowAutoVault ?? true;

  for (const ledgeMove of getMoveIntentDirections(effectiveMove)) {
    const approachedLedge = getBestApproachLedge(state, actor, ledgeMove);
    if (
      approachedLedge &&
      manualVaultPressed &&
      combineManualVaultAttack &&
      tryAttachLedgeTraverseToAttackLock(state, actor, ledgeMove, approachedLedge, delta)
    ) {
      return;
    }
    if (
      approachedLedge &&
      (allowAutoVault || manualVaultPressed) &&
      tryStartLedgeTraverse(state, actor, ledgeMove, approachedLedge, delta)
    ) {
      return;
    }
  }

  const moveComponents = getMoveIntentComponents(effectiveMove);
  let deltaX = moveComponents.x * delta;
  let deltaY = moveComponents.y * delta;
  if (moveComponents.x !== 0 && moveComponents.y !== 0) {
    deltaX *= Math.SQRT1_2;
    deltaY *= Math.SQRT1_2;
  }

  const solids = getActorMovementSolids(state, actor);

  resolveAxisMove(actor, deltaX, "x", solids, worldWidth, worldHeight);
  resolveAxisMove(actor, deltaY, "y", solids, worldWidth, worldHeight);
}

function shouldHumanControlledActorVault(
  state: MatchState,
  actor: ActorBase,
  move: MoveIntent | null,
  actionPressed: boolean,
): boolean {
  if (!isMoveIntentActive(move) || !actionPressed || actor.lock.kind !== "none") {
    return false;
  }

  for (const direction of getMoveIntentDirections(move)) {
    if (
      probeActorMove(state, actor, direction, {
        allowAutoVault: false,
        manualVaultPressed: true,
      }).startedVault
    ) {
      return true;
    }
  }

  return false;
}

export function canActorManualVaultWithFacing(state: MatchState, actor: ActorBase): boolean {
  return shouldHumanControlledActorVault(state, actor, moveIntentFromDirection(actor.facing), true);
}

function shouldHumanControlledSpringtrapVault(
  state: MatchState,
  springtrap: SpringtrapState,
  move: MoveIntent | null,
  actionPressed: boolean,
): boolean {
  if (shouldHumanControlledActorVault(state, springtrap, move, actionPressed)) {
    return true;
  }

  if (isMoveIntentActive(move) || !actionPressed || springtrap.lock.kind !== "none") {
    return false;
  }

  return shouldHumanControlledActorVault(state, springtrap, moveIntentFromDirection(springtrap.facing), true);
}

function buildAttackRect(killer: SpringtrapState, facing: Direction = killer.facing) {
  const range = GAME_CONFIG.attack.range;
  const width = GAME_CONFIG.attack.width;
  const halfWidth = width * 0.5;
  const halfKillerW = killer.collider.w * 0.5;
  const halfKillerH = killer.collider.h * 0.5;

  if (facing === "left") {
    return {
      x: killer.x - halfKillerW - range,
      y: killer.y - halfWidth,
      w: range,
      h: width,
    };
  }

  if (facing === "right") {
    return {
      x: killer.x + halfKillerW,
      y: killer.y - halfWidth,
      w: range,
      h: width,
    };
  }

  if (facing === "up") {
    return {
      x: killer.x - halfWidth,
      y: killer.y - halfKillerH - range,
      w: width,
      h: range,
    };
  }

  return {
    x: killer.x - halfWidth,
    y: killer.y + halfKillerH,
    w: width,
    h: range,
  };
}

function cancelHealing(state: MatchState): void {
  if (state.lulu.lock.kind === "healing") {
    const npc = getNpcById(state, state.lulu.lock.npcId);
    if (npc && npc.lock.kind === "healAssist") {
      npc.lock = { kind: "none" };
    }
    state.lulu.lock = { kind: "none" };
  }
  state.luluHealingNpcId = null;
}

function cancelChestOpening(state: MatchState, actor: ActorBase): void {
  if (actor.lock.kind !== "openingChest") {
    return;
  }

  actor.lock = { kind: "none" };
  if (actor.kind === "lulu") {
    state.luluOpeningChestId = null;
    return;
  }

  if (actor.kind === "springtrap") {
    state.springtrapOpeningChestId = null;
  }
}

function applyLuluDamage(state: MatchState): void {
  cancelHealing(state);
  cancelChestOpening(state, state.lulu);

  if (state.lulu.armorCharges > 0) {
    state.lulu.armorCharges = Math.max(0, state.lulu.armorCharges - 1);
    return;
  }

  if (state.lulu.health === "healthy") {
    state.lulu.health = "injured";
    state.lulu.burstRemainingMs = GAME_CONFIG.burst.durationMs;
  } else if (state.lulu.health === "injured") {
    state.lulu.health = "dead";
    state.result = "springtrap_win";
    state.resultReason = "lulu_killed";
  }
}

function applyNpcDamage(state: MatchState, npc: NpcState): void {
  if (!isNpcKillable(state)) {
    return;
  }

  if (state.luluHealingNpcId === npc.id) {
    cancelHealing(state);
  }

  if (npc.health === "healthy") {
    npc.health = "injured";
  } else if (npc.health === "injured") {
    npc.health = "dead";
    npc.aiMode = "wander";
    npc.targetGeneratorId = null;
    npc.wanderDirection = null;
    npc.decisionRemainingMs = 0;
    npc.lock = { kind: "none" };
    npc.dissolveRemainingMs = getMultiplayerNpcConfig().dissolveMs;
  }

  if (!isNpcAlive(npc)) {
    for (const springtrap of state.springtraps) {
      if (springtrap.aiDistractionNpcId === npc.id) {
        springtrap.aiDistractionNpcId = null;
      }
    }
  }
}

function canLuluReceiveSpringtrapHit(state: MatchState): boolean {
  return state.lulu.health !== "dead" && state.lulu.health !== "escaped" && state.lulu.lock.kind !== "hitSpin";
}

function canNpcReceiveSpringtrapHit(state: MatchState, npc: NpcState): boolean {
  return isNpcKillable(state) && isNpcAlive(npc) && npc.lock.kind !== "hitSpin";
}

function applyVictimHitSpin(actor: ActorBase): void {
  actor.lock = {
    kind: "hitSpin",
    remainingMs: GAME_CONFIG.attack.hitSpinMs,
    totalMs: GAME_CONFIG.attack.hitSpinMs,
  };
}

function applySpringtrapHitStun(springtrap: SpringtrapState): void {
  const totalMs = GAME_CONFIG.attack.hitSpinMs + GAME_CONFIG.attack.hitStunExtraMs;
  springtrap.lock = {
    kind: "hitStunned",
    remainingMs: totalMs,
    totalMs,
  };
}

function resolveSpringtrapHitOnLulu(state: MatchState, springtrap: SpringtrapState): void {
  applyLuluDamage(state);
  applyVictimHitSpin(state.lulu);
  applySpringtrapHitStun(springtrap);
}

function resolveSpringtrapHitOnNpc(state: MatchState, springtrap: SpringtrapState, npc: NpcState): boolean {
  if (!canNpcReceiveSpringtrapHit(state, npc)) {
    return false;
  }

  applyNpcDamage(state, npc);
  applyVictimHitSpin(npc);
  applySpringtrapHitStun(springtrap);
  return true;
}

function createProjectile(
  state: MatchState,
  owner: SpringtrapState,
  facing: Direction = owner.facing,
): ProjectileRuntime {
  const origin = getWrenchProjectileOrigin(owner, facing);

  return {
    id: `projectile-${state.nextProjectileId++}`,
    kind: "wrench",
    ownerId: owner.id,
    x: origin.x,
    y: origin.y,
    facing,
    remainingPx: GAME_CONFIG.boosts.wrenchProjectileRangePx,
  };
}

function startSpringtrapWrenchCooldown(springtrap: SpringtrapState): void {
  springtrap.wrenchCooldownRemainingMs = Math.min(
    Math.max(0, springtrap.wrenchRemainingMs),
    GAME_CONFIG.boosts.wrenchCooldownMs,
  );
}

function grantChestReward(state: MatchState, opener: ActorBase): ChestReward {
  if (opener.kind === "lulu") {
    const reward: ChestReward = Math.random() >= 0.5 ? "armor" : "flashlight";
    if (reward === "armor") {
      state.lulu.armorCharges = GAME_CONFIG.boosts.armorMaxCharges;
    } else {
      state.lulu.flashlightRemainingMs = GAME_CONFIG.boosts.flashlightDurationMs;
    }
    return reward;
  }

  const reward: ChestReward = Math.random() >= 0.5 ? "heart_charm" : "wrench";
  const springtrap = opener as SpringtrapState;
  springtrap.aiPriorityChestId = null;
  if (reward === "heart_charm") {
    springtrap.heartCharmRemainingMs = GAME_CONFIG.boosts.heartCharmDurationMs;
  } else {
    springtrap.wrenchRemainingMs = GAME_CONFIG.boosts.wrenchDurationMs;
    springtrap.wrenchCooldownRemainingMs = 0;
  }

  if (state.mode === "single") {
    const repairCueTarget = getRepairCueTarget(state, springtrap);
    const seesLulu = canSeePoint(springtrap, state.lulu, getVisionRadius("springtrap"), getMap(state).obstacles);
    const closeContact = distance(springtrap, state.lulu) <= getSinglePlayerAiConfig().closeContactRadiusPx;
    if (repairCueTarget || seesLulu || closeContact) {
      enterChase(state, springtrap, repairCueTarget ?? state.lulu);
    }
  }

  return reward;
}

function getDynamicPlacementPoints(state: MatchState, extraPoints: Vec2[] = []): Vec2[] {
  return [
    ...state.generators.map((generator) => ({ x: generator.x, y: generator.y })),
    { x: state.lulu.x, y: state.lulu.y },
    ...state.springtraps.map((springtrap) => ({ x: springtrap.x, y: springtrap.y })),
    ...state.npcs
      .filter((npc) => isNpcAlive(npc) || npc.dissolveRemainingMs > 0)
      .map((npc) => ({ x: npc.x, y: npc.y })),
    ...state.chests.map((chest) => ({ x: chest.x, y: chest.y })),
    ...extraPoints,
  ];
}

function spawnReplacementChest(state: MatchState): void {
  const closedChestCount = state.chests.filter((chest) => chest.state === "closed").length;
  if (closedChestCount >= GAME_CONFIG.treasure.activeCount) {
    return;
  }

  const map = getMap(state);
  const candidates = getGenericPlacementCandidates(
    map,
    GAME_CONFIG.treasure.chestSizePx * 0.78,
    getDynamicPlacementPoints(state),
  );
  const candidate = shufflePoints(candidates)[0];
  if (!candidate) {
    return;
  }

  state.chests.push(createTreasureChest(state.nextChestId++, candidate));
}

function finishChestOpen(state: MatchState, actor: ActorBase, chestId: string): void {
  const chest = state.chests.find((entry) => entry.id === chestId);
  if (!chest || chest.state !== "closed") {
    cancelChestOpening(state, actor);
    return;
  }

  chest.state = "opened";
  chest.openedBy = actor.kind === "lulu" ? "lulu" : "springtrap";
  chest.reward = grantChestReward(state, actor);
  chest.openedRemainingMs = GAME_CONFIG.treasure.openedDisplayMs;
  cancelChestOpening(state, actor);
  spawnReplacementChest(state);
}

function applyAttackHit(state: MatchState, killer: SpringtrapState, attackMode: "melee" | "projectile"): void {
  if (attackMode === "projectile") {
    startSpringtrapWrenchCooldown(killer);
    state.projectiles.push(createProjectile(state, killer, getAttackLockFacing(killer) ?? killer.facing));
    return;
  }

  const attackFacing = getAttackLockFacing(killer) ?? killer.facing;
  const attackRect = buildAttackRect(killer, attackFacing);

  if (canLuluReceiveSpringtrapHit(state)) {
    const luluRect = centeredRect(state.lulu, state.lulu.collider);
    if (intersects(attackRect, luluRect)) {
      resolveSpringtrapHitOnLulu(state, killer);
      return;
    }
  }

  for (const npc of state.npcs) {
    if (!canNpcReceiveSpringtrapHit(state, npc)) {
      continue;
    }

    if (intersects(attackRect, centeredRect(npc, npc.collider))) {
      resolveSpringtrapHitOnNpc(state, killer, npc);
      return;
    }
  }
}

function findNearbyUprightPallet(state: MatchState): PalletRuntime | undefined {
  return state.pallets.find(
    (pallet) => pallet.state === "upright" && distance(state.lulu, pallet) <= GAME_CONFIG.pallet.interactRangePx,
  );
}

function findNearbyRepairableGenerator(state: MatchState, actor: Vec2): GeneratorData | undefined {
  return [...state.generators]
    .filter((generator) => !generator.completed && distance(actor, generator) <= GAME_CONFIG.generator.repairRange)
    .sort((left, right) => distance(actor, left) - distance(actor, right))[0];
}

function findNearbyOpenableChest(state: MatchState, actor: Vec2): TreasureChestRuntime | undefined {
  return [...state.chests]
    .filter((chest) => chest.state === "closed" && distance(actor, chest) <= GAME_CONFIG.treasure.interactRange)
    .sort((left, right) => distance(actor, left) - distance(actor, right))[0];
}

function findNearbyHealerNpc(state: MatchState): NpcState | undefined {
  if (state.lulu.health !== "injured") {
    return undefined;
  }

  return [...state.npcs]
    .filter(
      (npc) =>
        canNpcHealLulu(state, npc) &&
        npc.lock.kind === "none" &&
        distance(state.lulu, npc) <= GAME_CONFIG.heal.range,
    )
    .sort((left, right) => distance(state.lulu, left) - distance(state.lulu, right))[0];
}

function getForwardEffectRect(actor: ActorBase, rangePx: number, widthPx: number) {
  const halfWidth = widthPx * 0.5;
  const halfActorW = actor.collider.w * 0.5;
  const halfActorH = actor.collider.h * 0.5;

  if (actor.facing === "left") {
    return {
      x: actor.x - halfActorW - rangePx,
      y: actor.y - halfWidth,
      w: rangePx,
      h: widthPx,
    };
  }

  if (actor.facing === "right") {
    return {
      x: actor.x + halfActorW,
      y: actor.y - halfWidth,
      w: rangePx,
      h: widthPx,
    };
  }

  if (actor.facing === "up") {
    return {
      x: actor.x - halfWidth,
      y: actor.y - halfActorH - rangePx,
      w: widthPx,
      h: rangePx,
    };
  }

  return {
    x: actor.x - halfWidth,
    y: actor.y + halfActorH,
    w: widthPx,
    h: rangePx,
  };
}

function getCharmPullDestination(state: MatchState, springtrap: SpringtrapState): Vec2 {
  const map = getMap(state);
  const worldWidth = map.widthTiles * TILE_SIZE;
  const worldHeight = map.heightTiles * TILE_SIZE;
  const totalDistance = GAME_CONFIG.boosts.charmPullDistancePx;
  const dx = springtrap.x - state.lulu.x;
  const dy = springtrap.y - state.lulu.y;
  const length = Math.hypot(dx, dy) || 1;
  const pullX = (dx / length) * totalDistance;
  const pullY = (dy / length) * totalDistance;
  const probe: LuluState = {
    ...state.lulu,
    lock: { kind: "none" },
  };
  const solids = getActorMovementSolids(state, probe);

  resolveAxisMove(probe, pullX, "x", solids, worldWidth, worldHeight);
  resolveAxisMove(probe, pullY, "y", solids, worldWidth, worldHeight);
  return { x: probe.x, y: probe.y };
}

function tryStartHealing(state: MatchState, controls: MatchControls): void {
  if (
    state.lulu.health !== "injured" ||
    state.lulu.lock.kind !== "none" ||
    !controls.lulu.actionHeld ||
    isMoveIntentActive(controls.lulu.move)
  ) {
    return;
  }

  if (findNearbyUprightPallet(state)) {
    return;
  }

  const healer = findNearbyHealerNpc(state);
  if (!healer) {
    return;
  }

  state.lulu.lock = {
    kind: "healing",
    remainingMs: GAME_CONFIG.heal.actionMs,
    totalMs: GAME_CONFIG.heal.actionMs,
    npcId: healer.id,
  };
  healer.lock = {
    kind: "healAssist",
    remainingMs: GAME_CONFIG.heal.actionMs,
    totalMs: GAME_CONFIG.heal.actionMs,
    luluId: state.lulu.id,
  };
  state.luluHealingNpcId = healer.id;
}

function updateHealing(state: MatchState, controls: MatchControls): void {
  if (state.lulu.lock.kind !== "healing") {
    state.luluHealingNpcId = null;
    tryStartHealing(state, controls);
    return;
  }

  const healer = getNpcById(state, state.lulu.lock.npcId);
  if (
    !healer ||
    !canNpcHealLulu(state, healer) ||
    !controls.lulu.actionHeld ||
    isMoveIntentActive(controls.lulu.move) ||
    state.lulu.health !== "injured" ||
    distance(state.lulu, healer) > GAME_CONFIG.heal.range
  ) {
    cancelHealing(state);
    return;
  }

  state.luluHealingNpcId = healer.id;
}

function finishPalletDrop(state: MatchState, palletId: string): void {
  const pallet = state.pallets.find((entry) => entry.id === palletId);
  if (!pallet || pallet.state !== "upright") {
    return;
  }

  pallet.state = "downed";
  pallet.slowsSpringtrap = true;
  pallet.downedVisibleRemainingMs = GAME_CONFIG.pallet.downedVisibleMs;
  pallet.respawnRemainingMs = GAME_CONFIG.pallet.respawnMs;
  const dropZone = getPalletRect(pallet);
  const expandedZone = {
    x: dropZone.x - 8,
    y: dropZone.y - 8,
    w: dropZone.w + 16,
    h: dropZone.h + 16,
  };
  let hitSpringtrap = false;
  for (const springtrap of state.springtraps) {
    if (
      intersects(expandedZone, centeredRect(springtrap, springtrap.collider)) ||
      distance(springtrap, pallet) <= GAME_CONFIG.pallet.hitRangePx
    ) {
      hitSpringtrap = true;
      const knockbackTo = getSpringtrapPalletKnockbackDestination(state, springtrap);
      springtrap.lock = {
        kind: "stunned",
        remainingMs: GAME_CONFIG.pallet.stunMs,
        knockbackElapsedMs: 0,
        knockbackDurationMs: GAME_CONFIG.pallet.knockbackMs,
        knockbackFrom: { x: springtrap.x, y: springtrap.y },
        knockbackTo,
      };
    }
  }

  if (hitSpringtrap) {
    pallet.state = "respawning";
    pallet.slowsSpringtrap = false;
    pallet.downedVisibleRemainingMs = 0;
  }
}

function getSpringtrapPalletKnockbackDestination(state: MatchState, springtrap: SpringtrapState): Vec2 {
  const map = getMap(state);
  const worldWidth = map.widthTiles * TILE_SIZE;
  const worldHeight = map.heightTiles * TILE_SIZE;
  const direction = getOppositeDirection(springtrap.facing);
  const distancePx = GAME_CONFIG.pallet.knockbackDistancePx;
  const probe: SpringtrapState = {
    ...springtrap,
    lock: { kind: "none" },
  };
  const solids = getActorMovementSolids(state, probe);

  if (direction === "left" || direction === "right") {
    resolveAxisMove(
      probe,
      direction === "left" ? -distancePx : distancePx,
      "x",
      solids,
      worldWidth,
      worldHeight,
    );
  } else {
    resolveAxisMove(
      probe,
      direction === "up" ? -distancePx : distancePx,
      "y",
      solids,
      worldWidth,
      worldHeight,
    );
  }

  return { x: probe.x, y: probe.y };
}

function updateTraversePosition(
  state: MatchState,
  actor: ActorBase,
  traverse: TraverseData,
  deltaMs: number,
): TraverseData | null {
  const map = getMap(state);
  const worldWidth = map.widthTiles * TILE_SIZE;
  const worldHeight = map.heightTiles * TILE_SIZE;
  const nextRemaining = traverse.remainingMs - deltaMs;
  const progress = clamp((traverse.totalMs - Math.max(nextRemaining, 0)) / traverse.totalMs, 0, 1);
  const nextPosition = clampActorPosition(
    actor,
    {
      x: traverse.from.x + (traverse.to.x - traverse.from.x) * progress,
      y: traverse.from.y + (traverse.to.y - traverse.from.y) * progress,
    },
    worldWidth,
    worldHeight,
  );
  actor.x = nextPosition.x;
  actor.y = nextPosition.y;

  if (nextRemaining <= 0) {
    return null;
  }

  return {
    ...traverse,
    remainingMs: nextRemaining,
  };
}

function updateLockTimers(state: MatchState, actor: ActorBase, deltaMs: number): void {
  if (actor.lock.kind === "none") {
    return;
  }

  if (actor.lock.kind === "vault") {
    const map = getMap(state);
    const worldWidth = map.widthTiles * TILE_SIZE;
    const worldHeight = map.heightTiles * TILE_SIZE;
    const nextRemaining = actor.lock.remainingMs - deltaMs;
    const progress = clamp((actor.lock.totalMs - Math.max(nextRemaining, 0)) / actor.lock.totalMs, 0, 1);
    const nextPosition = clampActorPosition(
      actor,
      {
        x: actor.lock.from.x + (actor.lock.to.x - actor.lock.from.x) * progress,
        y: actor.lock.from.y + (actor.lock.to.y - actor.lock.from.y) * progress,
      },
      worldWidth,
      worldHeight,
    );
    actor.x = nextPosition.x;
    actor.y = nextPosition.y;
    actor.lock.remainingMs = nextRemaining;
    if (actor.lock.remainingMs <= 0) {
      const finalPosition = clampActorPosition(actor, actor.lock.to, worldWidth, worldHeight);
      actor.x = finalPosition.x;
      actor.y = finalPosition.y;
      actor.lock = { kind: "none" };
    }
    return;
  }

  if (actor.lock.kind === "charmed") {
    const map = getMap(state);
    const worldWidth = map.widthTiles * TILE_SIZE;
    const worldHeight = map.heightTiles * TILE_SIZE;
    const nextRemaining = actor.lock.remainingMs - deltaMs;
    const progress = clamp((actor.lock.totalMs - Math.max(nextRemaining, 0)) / actor.lock.totalMs, 0, 1);
    const nextPosition = clampActorPosition(
      actor,
      {
        x: actor.lock.from.x + (actor.lock.to.x - actor.lock.from.x) * progress,
        y: actor.lock.from.y + (actor.lock.to.y - actor.lock.from.y) * progress,
      },
      worldWidth,
      worldHeight,
    );
    actor.x = nextPosition.x;
    actor.y = nextPosition.y;
    actor.lock.remainingMs = nextRemaining;
    if (actor.lock.remainingMs <= 0) {
      actor.x = actor.lock.to.x;
      actor.y = actor.lock.to.y;
      actor.lock = { kind: "none" };
      if (actor.kind === "lulu") {
        state.lulu.charmRecoveryRemainingMs = GAME_CONFIG.boosts.charmRecoveryMs;
      }
    }
    return;
  }

  if (actor.lock.kind === "attackWindup") {
    const nextTraverse = actor.lock.traverse ? updateTraversePosition(state, actor, actor.lock.traverse, deltaMs) : null;
    actor.lock.remainingMs -= deltaMs;
    if (actor.lock.remainingMs <= 0) {
      actor.lock = {
        kind: "attackActive",
        remainingMs: GAME_CONFIG.attack.activeMs,
        hitApplied: false,
        facing: actor.lock.facing,
        attackMode: actor.lock.attackMode,
        traverse: nextTraverse,
      };
    } else {
      actor.lock.traverse = nextTraverse;
    }
    return;
  }

  if (actor.lock.kind === "attackActive") {
    const nextTraverse = actor.lock.traverse ? updateTraversePosition(state, actor, actor.lock.traverse, deltaMs) : null;
    const attackMode = actor.lock.attackMode;
    if (!actor.lock.hitApplied && actor.kind === "springtrap") {
      applyAttackHit(state, actor as SpringtrapState, attackMode);
      if (actor.lock.kind !== "attackActive") {
        return;
      }
      actor.lock.hitApplied = true;
    }

    actor.lock.remainingMs -= deltaMs;
    if (actor.lock.remainingMs <= 0) {
      actor.lock = nextTraverse ? { kind: "vault", ...nextTraverse } : { kind: "none" };
    } else {
      actor.lock.traverse = nextTraverse;
    }
    return;
  }

  if (actor.lock.kind === "attackRecovery") {
    const nextTraverse = actor.lock.traverse ? updateTraversePosition(state, actor, actor.lock.traverse, deltaMs) : null;
    actor.lock.remainingMs -= deltaMs;
    if (actor.lock.remainingMs <= 0) {
      actor.lock = nextTraverse ? { kind: "vault", ...nextTraverse } : { kind: "none" };
    } else {
      actor.lock.traverse = nextTraverse;
    }
    return;
  }

  if (actor.lock.kind === "flashBlinded") {
    actor.lock.remainingMs -= deltaMs;
    if (actor.lock.remainingMs <= 0) {
      actor.lock = { kind: "none" };
    }
    return;
  }

  if (actor.lock.kind === "hitSpin" || actor.lock.kind === "hitStunned") {
    actor.lock.remainingMs -= deltaMs;
    if (actor.lock.remainingMs <= 0) {
      actor.lock = { kind: "none" };
    }
    return;
  }

  if (actor.lock.kind === "openingChest") {
    actor.lock.remainingMs -= deltaMs;
    if (actor.lock.remainingMs <= 0) {
      finishChestOpen(state, actor, actor.lock.chestId);
    }
    return;
  }

  if (actor.lock.kind === "stunned") {
    actor.lock.knockbackElapsedMs = Math.min(
      actor.lock.knockbackDurationMs,
      actor.lock.knockbackElapsedMs + deltaMs,
    );
    const progress =
      actor.lock.knockbackDurationMs <= 0
        ? 1
        : clamp(actor.lock.knockbackElapsedMs / actor.lock.knockbackDurationMs, 0, 1);
    actor.x = actor.lock.knockbackFrom.x + (actor.lock.knockbackTo.x - actor.lock.knockbackFrom.x) * progress;
    actor.y = actor.lock.knockbackFrom.y + (actor.lock.knockbackTo.y - actor.lock.knockbackFrom.y) * progress;
    actor.lock.remainingMs -= deltaMs;
    if (actor.lock.remainingMs <= 0) {
      actor.x = actor.lock.knockbackTo.x;
      actor.y = actor.lock.knockbackTo.y;
      actor.lock = { kind: "none" };
    }
    return;
  }

  if (actor.lock.kind === "palletDrop") {
    const palletId = actor.lock.palletId;
    actor.lock.remainingMs -= deltaMs;
    if (actor.lock.remainingMs <= 0) {
      finishPalletDrop(state, palletId);
      actor.lock = { kind: "none" };
    }
    return;
  }

  if (actor.lock.kind === "healing") {
    const npc = getNpcById(state, actor.lock.npcId);
    if (!npc || !canNpcHealLulu(state, npc) || distance(state.lulu, npc) > GAME_CONFIG.heal.range) {
      cancelHealing(state);
      return;
    }

    actor.lock.remainingMs -= deltaMs;
    if (actor.lock.remainingMs <= 0) {
      state.lulu.health = "healthy";
      npc.healChargesRemaining = Math.max(0, npc.healChargesRemaining - 1);
      npc.lock = { kind: "none" };
      actor.lock = { kind: "none" };
      state.luluHealingNpcId = null;
    }
    return;
  }

  if (actor.lock.kind === "healAssist") {
    actor.lock.remainingMs -= deltaMs;
    if (actor.lock.remainingMs <= 0) {
      actor.lock = { kind: "none" };
    }
    return;
  }

}

function updatePalletRespawns(state: MatchState, deltaMs: number): void {
  for (const pallet of state.pallets) {
    if (pallet.state === "upright") {
      continue;
    }

    pallet.respawnRemainingMs = Math.max(0, pallet.respawnRemainingMs - deltaMs);
    if (pallet.state === "downed") {
      pallet.downedVisibleRemainingMs = Math.max(0, pallet.downedVisibleRemainingMs - deltaMs);
      if (pallet.downedVisibleRemainingMs <= 0) {
        pallet.state = "respawning";
      }
    }

    if (pallet.respawnRemainingMs <= 0) {
      pallet.state = "upright";
      pallet.slowsSpringtrap = false;
      pallet.downedVisibleRemainingMs = 0;
    }
  }
}

function tryStartLuluChestOpening(
  state: MatchState,
  controls: MatchControls,
  palletOpportunity: PalletRuntime | undefined,
  healerOpportunity: NpcState | undefined,
): void {
  if (
    state.lulu.health === "dead" ||
    state.lulu.health === "escaped" ||
    state.lulu.lock.kind !== "none" ||
    !controls.lulu.actionHeld ||
    isMoveIntentActive(controls.lulu.move) ||
    palletOpportunity ||
    healerOpportunity
  ) {
    return;
  }

  const chest = findNearbyOpenableChest(state, state.lulu);
  if (!chest) {
    return;
  }

  state.lulu.lock = {
    kind: "openingChest",
    remainingMs: GAME_CONFIG.treasure.openDurationMs,
    totalMs: GAME_CONFIG.treasure.openDurationMs,
    chestId: chest.id,
  };
  state.luluOpeningChestId = chest.id;
}

function updateLuluChestOpening(state: MatchState, controls: MatchControls): void {
  const palletOpportunity = findNearbyUprightPallet(state);
  const healerOpportunity = findNearbyHealerNpc(state);
  if (state.lulu.lock.kind !== "openingChest") {
    state.luluOpeningChestId = null;
    tryStartLuluChestOpening(state, controls, palletOpportunity, healerOpportunity);
    return;
  }

  const chestId = state.lulu.lock.chestId;
  const chest = state.chests.find((entry) => entry.id === chestId && entry.state === "closed");
  if (
    !chest ||
    !controls.lulu.actionHeld ||
    isMoveIntentActive(controls.lulu.move) ||
    distance(state.lulu, chest) > GAME_CONFIG.treasure.interactRange
  ) {
    cancelChestOpening(state, state.lulu);
    return;
  }

  state.luluOpeningChestId = chest.id;
}

function updateSpringtrapChestOpening(
  state: MatchState,
  springtrap: SpringtrapState,
  input: MatchControls["springtrap"] | null | undefined,
  isHumanControlled: boolean,
): void {
  if (!isHumanControlled) {
    if (springtrap.lock.kind === "openingChest") {
      cancelChestOpening(state, springtrap);
    }
    return;
  }

  if (springtrap.lock.kind !== "openingChest") {
    if (
      springtrap.lock.kind !== "none" ||
      !input?.actionHeld ||
      isMoveIntentActive(input.move)
    ) {
      return;
    }

    const chest = findNearbyOpenableChest(state, springtrap);
    if (!chest) {
      return;
    }

    springtrap.lock = {
      kind: "openingChest",
      remainingMs: GAME_CONFIG.treasure.openDurationMs,
      totalMs: GAME_CONFIG.treasure.openDurationMs,
      chestId: chest.id,
    };
    state.springtrapOpeningChestId = chest.id;
    return;
  }

  const chestId = springtrap.lock.chestId;
  const chest = state.chests.find((entry) => entry.id === chestId && entry.state === "closed");
  if (
    !chest ||
    !input?.actionHeld ||
    isMoveIntentActive(input.move) ||
    distance(springtrap, chest) > GAME_CONFIG.treasure.interactRange
  ) {
    cancelChestOpening(state, springtrap);
    return;
  }

  state.springtrapOpeningChestId = chest.id;
}

function tryStartLuluAction(state: MatchState, actionPressed: boolean): void {
  if (!actionPressed || state.lulu.lock.kind !== "none") {
    return;
  }

  const pallet = findNearbyUprightPallet(state);
  if (pallet) {
    state.lulu.lock = {
      kind: "palletDrop",
      remainingMs: GAME_CONFIG.pallet.dropStartupMs,
      palletId: pallet.id,
    };
  }
}

function tryStartSpringtrapAction(springtrap: SpringtrapState, actionPressed: boolean): void {
  if (!actionPressed || springtrap.lock.kind !== "none") {
    return;
  }

  springtrap.lock = {
    kind: "attackWindup",
    remainingMs: GAME_CONFIG.attack.windupMs,
    facing: springtrap.facing,
    attackMode: canSpringtrapThrowWrench(springtrap) ? "projectile" : "melee",
    traverse: null,
  };
}

function applyFlashBlind(state: MatchState, springtrap: SpringtrapState): void {
  springtrap.trackerDisabledRemainingMs = GAME_CONFIG.boosts.trackerDisableMs;
  springtrap.flashOverlayRemainingMs = GAME_CONFIG.boosts.screenFlashMs;
  springtrap.aiLastConfirmedLuluDirection = null;
  resetSpringtrapCommitState(springtrap);
  state.lulu.flashlightCooldownRemainingMs = GAME_CONFIG.boosts.effectHitCooldownMs;

  if (springtrap.lock.kind === "stunned") {
    return;
  }

  cancelChestOpening(state, springtrap);
  springtrap.lock = {
    kind: "flashBlinded",
    remainingMs: GAME_CONFIG.boosts.screenFlashMs,
    totalMs: GAME_CONFIG.boosts.screenFlashMs,
  };
}

function updateLuluRepairCue(state: MatchState, controls: MatchControls): void {
  state.luluRepairingGeneratorId = null;

  if (
    state.lulu.health === "dead" ||
    state.lulu.health === "escaped" ||
    state.lulu.lock.kind !== "none" ||
    !controls.lulu.actionHeld ||
    isMoveIntentActive(controls.lulu.move)
  ) {
    return;
  }

  const generator = findNearbyRepairableGenerator(state, state.lulu);
  if (generator) {
    state.luluRepairingGeneratorId = generator.id;
  }
}

function updateGeneratorRepairs(state: MatchState, controls: MatchControls, deltaMs: number): void {
  updateLuluRepairCue(state, controls);

  if (state.luluRepairingGeneratorId) {
    const generator = findNearbyRepairableGenerator(state, state.lulu);
    if (generator) {
      repairGenerator(generator, deltaMs);
    }
  }

  for (const npc of state.npcs) {
    if (!isNpcAlive(npc) || npc.aiMode !== "repair_generator") {
      continue;
    }

    const generator = getGeneratorById(state, npc.targetGeneratorId);
    if (!generator || generator.completed || distance(npc, generator) > GAME_CONFIG.generator.repairRange + 4) {
      npc.targetGeneratorId = null;
      npc.aiMode = "wander";
      npc.decisionRemainingMs = 0;
      continue;
    }

    repairGenerator(generator, deltaMs, getNpcRepairMultiplier(state));
  }
}

function updateTreasureChests(state: MatchState, deltaMs: number): void {
  for (const chest of state.chests) {
    if (chest.state !== "opened") {
      continue;
    }

    chest.openedRemainingMs = Math.max(0, chest.openedRemainingMs - deltaMs);
  }

  state.chests = state.chests.filter((chest) => chest.state !== "opened" || chest.openedRemainingMs > 0);
  while (state.chests.filter((chest) => chest.state === "closed").length < GAME_CONFIG.treasure.activeCount) {
    const beforeCount = state.chests.length;
    spawnReplacementChest(state);
    if (state.chests.length === beforeCount) {
      break;
    }
  }
}

function updateNpcDissolves(state: MatchState, deltaMs: number): void {
  for (const npc of state.npcs) {
    if (npc.health !== "dead" || npc.dissolveRemainingMs <= 0) {
      continue;
    }

    npc.dissolveRemainingMs = Math.max(0, npc.dissolveRemainingMs - deltaMs);
  }
}

function updateBoosts(state: MatchState, deltaMs: number): void {
  state.lulu.flashlightRemainingMs = Math.max(0, state.lulu.flashlightRemainingMs - deltaMs);
  state.lulu.flashlightCooldownRemainingMs = Math.max(0, state.lulu.flashlightCooldownRemainingMs - deltaMs);
  state.lulu.charmRecoveryRemainingMs = Math.max(0, state.lulu.charmRecoveryRemainingMs - deltaMs);

  for (const springtrap of state.springtraps) {
    springtrap.trackerDisabledRemainingMs = Math.max(0, springtrap.trackerDisabledRemainingMs - deltaMs);
    springtrap.flashOverlayRemainingMs = Math.max(0, springtrap.flashOverlayRemainingMs - deltaMs);
    springtrap.heartCharmRemainingMs = Math.max(0, springtrap.heartCharmRemainingMs - deltaMs);
    springtrap.heartCharmCooldownRemainingMs = Math.max(0, springtrap.heartCharmCooldownRemainingMs - deltaMs);
    springtrap.wrenchRemainingMs = Math.max(0, springtrap.wrenchRemainingMs - deltaMs);
    springtrap.wrenchCooldownRemainingMs = Math.max(0, springtrap.wrenchCooldownRemainingMs - deltaMs);
    if (state.mode === "single") {
      updateSpringtrapAiItemCycle(springtrap, deltaMs);
    }
    if (springtrap.wrenchRemainingMs <= 0) {
      springtrap.wrenchCooldownRemainingMs = 0;
    }
  }

  if (state.lulu.flashlightRemainingMs > 0 && state.lulu.flashlightCooldownRemainingMs <= 0) {
    const flashlightRect = getForwardEffectRect(
      state.lulu,
      GAME_CONFIG.boosts.flashlightRangePx,
      GAME_CONFIG.boosts.flashlightWidthPx,
    );
    for (const springtrap of state.springtraps) {
      const insideFlashlightZone = intersects(flashlightRect, centeredRect(springtrap, springtrap.collider));
      if (insideFlashlightZone && !springtrap.insideFlashlightZone) {
        applyFlashBlind(state, springtrap);
      }
      springtrap.insideFlashlightZone = insideFlashlightZone;
    }
  } else {
    for (const springtrap of state.springtraps) {
      springtrap.insideFlashlightZone = false;
    }
  }

  if (
    state.lulu.health !== "dead" &&
    state.lulu.health !== "escaped" &&
    state.lulu.lock.kind === "none" &&
    state.lulu.charmRecoveryRemainingMs <= 0
  ) {
    for (const springtrap of state.springtraps) {
      if (springtrap.heartCharmRemainingMs <= 0 || springtrap.heartCharmCooldownRemainingMs > 0) {
        continue;
      }

      const heartRect = getForwardEffectRect(
        springtrap,
        GAME_CONFIG.boosts.heartCharmRangePx,
        GAME_CONFIG.boosts.heartCharmWidthPx,
      );
      if (!intersects(heartRect, centeredRect(state.lulu, state.lulu.collider))) {
        continue;
      }

      cancelHealing(state);
      cancelChestOpening(state, state.lulu);
      state.lulu.lock = {
        kind: "charmed",
        remainingMs: GAME_CONFIG.boosts.charmPullMs,
        totalMs: GAME_CONFIG.boosts.charmPullMs,
        from: { x: state.lulu.x, y: state.lulu.y },
        to: getCharmPullDestination(state, springtrap),
        sourceId: springtrap.id,
      };
      springtrap.heartCharmCooldownRemainingMs = GAME_CONFIG.boosts.effectHitCooldownMs;
      break;
    }
  }
}

function updateProjectiles(state: MatchState, deltaMs: number): void {
  if (state.projectiles.length === 0) {
    return;
  }

  const map = getMap(state);
  const worldWidth = map.widthTiles * TILE_SIZE;
  const worldHeight = map.heightTiles * TILE_SIZE;
  const movedProjectiles: ProjectileRuntime[] = [];

  for (const projectile of state.projectiles) {
    const owner = getSpringtrapById(state, projectile.ownerId);
    const distanceStep = Math.min(
      projectile.remainingPx,
      GAME_CONFIG.boosts.wrenchProjectileSpeedPx * (deltaMs / 1_000),
    );
    let nextX = projectile.x;
    let nextY = projectile.y;
    if (projectile.facing === "left") {
      nextX -= distanceStep;
    } else if (projectile.facing === "right") {
      nextX += distanceStep;
    } else if (projectile.facing === "up") {
      nextY -= distanceStep;
    } else {
      nextY += distanceStep;
    }

    const moved: ProjectileRuntime = {
      ...projectile,
      x: nextX,
      y: nextY,
      remainingPx: Math.max(0, projectile.remainingPx - distanceStep),
    };
    const rect = getPlacementRect({ x: moved.x, y: moved.y }, GAME_CONFIG.boosts.projectileSizePx);
    const outOfBounds =
      moved.x < 0 || moved.y < 0 || moved.x > worldWidth || moved.y > worldHeight || moved.remainingPx <= 0;
    const blocked = map.obstacles.some((obstacle) => intersects(rect, obstacle)) || intersects(rect, map.gate);

    if (blocked || outOfBounds) {
      continue;
    }

    if (intersects(rect, centeredRect(state.lulu, state.lulu.collider))) {
      if (owner && canLuluReceiveSpringtrapHit(state)) {
        resolveSpringtrapHitOnLulu(state, owner);
      }
      continue;
    }

    const hitNpc = state.npcs.find(
      (npc) => intersects(rect, centeredRect(npc, npc.collider)),
    );
    if (hitNpc) {
      if (owner) {
        resolveSpringtrapHitOnNpc(state, owner, hitNpc);
      }
      continue;
    }

    movedProjectiles.push(moved);
  }

  state.projectiles = movedProjectiles;
}

function updateExitGate(state: MatchState): void {
  if (!state.exitOpen && getCompletedGeneratorCount(state) >= GAME_CONFIG.generator.totalCount) {
    state.exitOpen = true;
  }

  if (!state.exitOpen || state.result !== "running") {
    return;
  }

  const map = getMap(state);
  const luluRect = centeredRect(state.lulu, state.lulu.collider);
  if (intersects(luluRect, map.gate as GateData)) {
    state.result = "lulu_win";
    state.resultReason = "escaped";
    state.lulu.health = "escaped";
  }
}

export function stepMatch(state: MatchState, controls: MatchControls, deltaMs: number): void {
  if (state.result !== "running") {
    return;
  }

  state.elapsedMs += deltaMs;
  const previousRepairingGeneratorId = state.luluRepairingGeneratorId;
  state.lulu.burstRemainingMs = Math.max(0, state.lulu.burstRemainingMs - deltaMs);
  updateLockTimers(state, state.lulu, deltaMs);
  for (const springtrap of state.springtraps) {
    updateLockTimers(state, springtrap, deltaMs);
  }
  for (const npc of state.npcs) {
    updateLockTimers(state, npc, deltaMs);
  }
  updatePalletRespawns(state, deltaMs);
  updateTreasureChests(state, deltaMs);
  updateNpcDissolves(state, deltaMs);
  updateBoosts(state, deltaMs);
  updateLuluRepairCue(state, controls);
  maybeRefreshSpringtrapRepairChase(state, previousRepairingGeneratorId);

  if (state.result !== "running") {
    return;
  }

  const primaryUsesHumanControls =
    state.mode === "multiplayer" ||
    isMoveIntentActive(controls.springtrap.move) ||
    controls.springtrap.actionPressed ||
    controls.springtrap.actionHeld;
  const effectiveSpringtrapControls = state.springtraps.map((springtrap, index) => {
    if (index === 0 && primaryUsesHumanControls) {
      return controls.springtrap;
    }

    return getSpringtrapAiInput(state, springtrap, deltaMs, getMoveIntentFacing(controls.lulu.move));
  });

  const luluWillManualVault = shouldHumanControlledActorVault(
    state,
    state.lulu,
    controls.lulu.move,
    controls.lulu.actionPressed,
  );
  const springtrapWillManualVault = state.springtraps.map((springtrap, index) => {
    const usesHumanControls = index === 0 && primaryUsesHumanControls;
    if (!usesHumanControls) {
      return false;
    }

    const input = effectiveSpringtrapControls[index];
    return shouldHumanControlledSpringtrapVault(
      state,
      springtrap,
      input?.move ?? null,
      input?.actionPressed ?? false,
    );
  });
  const springtrapWillAttackVault = state.springtraps.map(
    (_, index) => state.mode === "multiplayer" && index === 0 && primaryUsesHumanControls && springtrapWillManualVault[index],
  );

  tryStartLuluAction(state, controls.lulu.actionPressed && !luluWillManualVault);
  updateHealing(state, controls);
  updateLuluChestOpening(state, controls);
  state.springtrapOpeningChestId = null;
  for (let index = 0; index < state.springtraps.length; index += 1) {
    updateSpringtrapChestOpening(
      state,
      state.springtraps[index],
      effectiveSpringtrapControls[index],
      index === 0 && primaryUsesHumanControls,
    );
  }
  for (let index = 0; index < state.springtraps.length; index += 1) {
    tryStartSpringtrapAction(
      state.springtraps[index],
      (effectiveSpringtrapControls[index]?.actionPressed ?? false) &&
        (!springtrapWillManualVault[index] || springtrapWillAttackVault[index]),
    );
  }
  moveActor(state, state.lulu, controls.lulu.move, deltaMs, {
    allowAutoVault: false,
    manualVaultPressed: luluWillManualVault,
  });
  for (let index = 0; index < state.springtraps.length; index += 1) {
    moveActor(
      state,
      state.springtraps[index],
      effectiveSpringtrapControls[index]?.move ?? null,
      deltaMs,
        index === 0 && primaryUsesHumanControls
          ? {
            allowAutoVault: false,
            manualVaultPressed: springtrapWillManualVault[index],
            combineManualVaultAttack: springtrapWillAttackVault[index],
          }
          : undefined,
    );
  }
  for (const npc of state.npcs) {
    moveActor(state, npc, moveIntentFromDirection(getNpcMove(state, npc, deltaMs)), deltaMs);
  }
  updateGeneratorRepairs(state, controls, deltaMs);
  updateProjectiles(state, deltaMs);
  updateExitGate(state);
}
