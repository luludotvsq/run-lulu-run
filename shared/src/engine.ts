import { FIXED_STEP_MS, GAME_CONFIG, TILE_SIZE } from "./config.js";
import { clamp, centeredRect, distance, intersects } from "./math.js";
import { DEFAULT_MAP_ID, getMapById } from "./maps.js";
import { canSeePoint, getVisionRadius } from "./vision.js";
import type {
  ActorBase,
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
  SpringtrapAiState,
  SpringtrapState,
  Vec2,
} from "./types.js";

function createLulu(mapId: string): LuluState {
  const map = getMapById(mapId);
  return {
    id: "lulu",
    kind: "lulu",
    x: map.spawns.lulu.x,
    y: map.spawns.lulu.y,
    facing: "right",
    collider: GAME_CONFIG.collider.lulu,
    lock: { kind: "none" },
    health: "healthy",
    burstRemainingMs: 0,
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
    aiCommitDirection: null,
    aiCommitRemainingMs: 0,
    aiBlockedCommitFrames: 0,
    aiStuckFrames: 0,
    aiStuckAnchor: null,
  };
}

function createSpringtraps(mode: MatchMode, mapId: string): SpringtrapState[] {
  const map = getMapById(mapId);
  if (mode !== "single") {
    return [createSpringtrapAt(map.spawns.springtrap, "springtrap")];
  }

  const desiredCount = Math.max(1, GAME_CONFIG.singlePlayer.springtrapCount);
  const picks: Vec2[] = [{ x: map.spawns.springtrap.x, y: map.spawns.springtrap.y }];
  const candidatePoints = [
    ...map.generatorSpawns,
    ...map.spawns.npcs,
    { x: map.gate.x + map.gate.w * 0.5, y: map.gate.y + map.gate.h * 0.5 },
    { x: map.widthTiles * TILE_SIZE * 0.5, y: map.heightTiles * TILE_SIZE * 0.5 },
  ];
  const uniqueCandidates = new Map<string, Vec2>();
  for (const point of candidatePoints) {
    uniqueCandidates.set(`${Math.round(point.x)}:${Math.round(point.y)}`, point);
  }

  const sortedCandidates = [...uniqueCandidates.values()].sort((left, right) => {
    const leftDistance = distance(left, map.spawns.lulu);
    const rightDistance = distance(right, map.spawns.lulu);
    return rightDistance - leftDistance;
  });

  for (const candidate of sortedCandidates) {
    if (picks.length >= desiredCount) {
      break;
    }

    const alreadyPicked = picks.some((entry) => distance(entry, candidate) < TILE_SIZE * 2);
    if (alreadyPicked) {
      continue;
    }

    picks.push({ x: candidate.x, y: candidate.y });
  }

  while (picks.length < desiredCount) {
    picks.push({ x: map.spawns.springtrap.x, y: map.spawns.springtrap.y });
  }

  return picks.map((spawn, index) =>
    createSpringtrapAt(spawn, index === 0 ? "springtrap" : `springtrap-${index + 1}`, index === 0 ? "left" : "up"),
  );
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
  return shufflePoints(map.generatorSpawns)
    .slice(0, GAME_CONFIG.generator.totalCount)
    .map((spawn, index) => ({
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
    downedVisibleRemainingMs: 0,
    respawnRemainingMs: 0,
  }));
}

export function createMatch(mode: MatchMode, mapId = DEFAULT_MAP_ID): MatchState {
  const springtraps = createSpringtraps(mode, mapId);
  return {
    mode,
    mapId,
    elapsedMs: 0,
    exitOpen: false,
    result: "running",
    resultReason: null,
    lulu: createLulu(mapId),
    springtrap: springtraps[0],
    springtraps,
    npcs: createNpcs(mapId),
    generators: createGenerators(mapId),
    luluRepairingGeneratorId: null,
    luluHealingNpcId: null,
    pallets: createPallets(mapId),
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
}

function clearSpringtrapCommitDirection(springtrap: SpringtrapState): Direction | null {
  const previousDirection = springtrap.aiCommitDirection;
  springtrap.aiCommitDirection = null;
  springtrap.aiCommitRemainingMs = 0;
  springtrap.aiBlockedCommitFrames = 0;
  return previousDirection;
}

function beginSpringtrapCommit(springtrap: SpringtrapState, direction: Direction): void {
  springtrap.aiCommitDirection = direction;
  springtrap.aiCommitRemainingMs = getSinglePlayerAiConfig().routeCommitMs;
  springtrap.aiBlockedCommitFrames = 0;
  springtrap.aiStuckFrames = 0;
  springtrap.aiStuckAnchor = { x: springtrap.x, y: springtrap.y };
}

function clearSpringtrapCommitAndRestartWindow(springtrap: SpringtrapState): Direction | null {
  const previousDirection = clearSpringtrapCommitDirection(springtrap);
  springtrap.aiStuckFrames = 0;
  springtrap.aiStuckAnchor = { x: springtrap.x, y: springtrap.y };
  return previousDirection;
}

function updateSpringtrapCommitWindow(
  springtrap: SpringtrapState,
  target: Vec2,
): Direction | null {
  const aiConfig = getSinglePlayerAiConfig();
  if (!springtrap.aiStuckAnchor) {
    springtrap.aiStuckAnchor = { x: springtrap.x, y: springtrap.y };
    springtrap.aiStuckFrames = 0;
    return null;
  }

  const improvement =
    distance(springtrap.aiStuckAnchor, target) - distance(springtrap, target);
  if (springtrap.aiCommitDirection && improvement >= 16) {
    clearSpringtrapCommitDirection(springtrap);
    springtrap.aiStuckAnchor = { x: springtrap.x, y: springtrap.y };
    springtrap.aiStuckFrames = 0;
    return null;
  }

  const withinStuckBox =
    Math.abs(springtrap.x - springtrap.aiStuckAnchor.x) <= aiConfig.stuckBBoxPx &&
    Math.abs(springtrap.y - springtrap.aiStuckAnchor.y) <= aiConfig.stuckBBoxPx;

  if (withinStuckBox) {
    springtrap.aiStuckFrames += 1;
  } else {
    springtrap.aiStuckAnchor = { x: springtrap.x, y: springtrap.y };
    springtrap.aiStuckFrames = 0;
  }

  if (springtrap.aiCommitDirection && springtrap.aiStuckFrames >= aiConfig.stuckFrames) {
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
  resetSpringtrapCommitState(springtrap);
}

function enterChase(state: MatchState, springtrap: SpringtrapState, point: Vec2 = state.lulu): void {
  springtrap.aiState = "chase";
  springtrap.aiStateRemainingMs = 0;
  springtrap.aiChaseSightLossMs = 0;
  springtrap.aiSearchWaypointIndex = 0;
  springtrap.aiSearchWaypoints = [];
  springtrap.aiDistractionNpcId = null;
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
  resetSpringtrapCommitState(springtrap);
}

function enterCooldown(state: MatchState, springtrap: SpringtrapState): void {
  springtrap.aiState = "cooldown";
  springtrap.aiStateRemainingMs = getSinglePlayerAiConfig().cooldownDurationMs;
  springtrap.aiChaseSightLossMs = 0;
  springtrap.aiSearchWaypointIndex = 0;
  springtrap.aiSearchWaypoints = [];
  springtrap.aiDistractionNpcId = null;
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
    springtrap.aiStuckFrames = 0;
    springtrap.aiStuckAnchor = { x: springtrap.x, y: springtrap.y };
    return (
      choosePathDirectionToward(state, springtrap, target, {
        walkGrid,
      }) ?? chooseAnyProgressDirection(state, springtrap)
    );
  }

  const excludedDirections: Direction[] = [];
  const stuckDirection = updateSpringtrapCommitWindow(springtrap, target);
  if (stuckDirection) {
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
  const predictedLuluAttackTarget = getPredictedLuluAttackTarget(state, luluMoveHint);

  if (springtrap.lock.kind === "none") {
    const attackOption = getBestLuluAttackOption(state, springtrap, predictedLuluAttackTarget);
    if (attackOption?.clean) {
      springtrap.facing = attackOption.facing;
      return {
        move: null,
        actionPressed: true,
        actionHeld: false,
      };
    }

    if (attackOption || distance(springtrap, state.lulu) <= GAME_CONFIG.attack.range + TILE_SIZE) {
      const repositionMove = chooseSpringtrapAttackRepositionMove(state, springtrap, predictedLuluAttackTarget);
      if (repositionMove) {
        return {
          move: moveIntentFromDirection(repositionMove),
          actionPressed: false,
          actionHeld: false,
        };
      }
    }
  }

  const chooseMove = (target: Vec2 | null): Direction | null => {
    return chooseSpringtrapRouteMove(state, springtrap, target, deltaMs, seesLulu);
  };

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
      if (seesLulu || closeContact || hasStrongRepairCue) {
        enterChase(state, springtrap, repairCueTarget ?? state.lulu);
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
      if (seesLulu || closeContact || hasStrongRepairCue) {
        rememberConfirmedLulu(springtrap, state.lulu, repairCueTarget ?? state.lulu);
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
      if (seesLulu || closeContact || hasStrongRepairCue) {
        enterChase(state, springtrap, repairCueTarget ?? state.lulu);
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

    if (seesLulu || closeContact || hasStrongRepairCue) {
      enterChase(state, springtrap, repairCueTarget ?? state.lulu);
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

function getSpeedForActor(actor: ActorBase): number {
  if (actor.kind === "lulu") {
    return (actor as LuluState).burstRemainingMs > 0 ? GAME_CONFIG.burst.speed : GAME_CONFIG.movement.lulu;
  }
  if (actor.kind === "springtrap") {
    return GAME_CONFIG.movement.springtrap;
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

function updateFacing(actor: ActorBase, move: MoveIntent | null): void {
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

function getPalletRect(pallet: PalletRuntime) {
  return pallet.orientation === "horizontal"
    ? { x: pallet.x - 14, y: pallet.y - 5, w: 28, h: 10 }
    : { x: pallet.x - 5, y: pallet.y - 14, w: 10, h: 28 };
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

function getTraverseDuration(actor: ActorBase): number {
  return actor.kind === "springtrap" ? GAME_CONFIG.vault.springtrapMs : GAME_CONFIG.vault.luluMs;
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
    remainingMs: getTraverseDuration(actor),
    totalMs: getTraverseDuration(actor),
    from: { x: actor.x, y: actor.y },
    to: clampedDestination,
    sourceId: barrier.id,
    sourceType: "ledge",
  };
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

  if (!isMoveIntentActive(move) || actor.lock.kind !== "none") {
    return;
  }

  if (actor.kind === "lulu" && (state.lulu.health === "dead" || state.lulu.health === "escaped")) {
    return;
  }

  const map = getMap(state);
  const worldWidth = map.widthTiles * TILE_SIZE;
  const worldHeight = map.heightTiles * TILE_SIZE;
  const speed = getSpeedForActor(actor);
  const delta = speed * (deltaMs / 1_000);
  const allowAutoVault = options.allowAutoVault ?? true;
  const manualVaultPressed = options.manualVaultPressed ?? false;

  for (const ledgeMove of getMoveIntentDirections(move)) {
    const approachedLedge = getBestApproachLedge(state, actor, ledgeMove);
    if (
      approachedLedge &&
      (allowAutoVault || manualVaultPressed) &&
      tryStartLedgeTraverse(state, actor, ledgeMove, approachedLedge, delta)
    ) {
      return;
    }
  }

  const moveComponents = getMoveIntentComponents(move);
  let deltaX = moveComponents.x * delta;
  let deltaY = moveComponents.y * delta;
  if (moveComponents.x !== 0 && moveComponents.y !== 0) {
    deltaX *= Math.SQRT1_2;
    deltaY *= Math.SQRT1_2;
  }

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

function applyAttackHit(state: MatchState, killer: SpringtrapState): void {
  const attackFacing = getAttackLockFacing(killer) ?? killer.facing;
  const attackRect = buildAttackRect(killer, attackFacing);

  if (state.lulu.health !== "dead" && state.lulu.health !== "escaped") {
    const luluRect = centeredRect(state.lulu, state.lulu.collider);
    if (intersects(attackRect, luluRect)) {
      cancelHealing(state);
      if (state.lulu.health === "healthy") {
        state.lulu.health = "injured";
        state.lulu.burstRemainingMs = GAME_CONFIG.burst.durationMs;
      } else if (state.lulu.health === "injured") {
        state.lulu.health = "dead";
        state.result = "springtrap_win";
        state.resultReason = "lulu_killed";
      }
      return;
    }
  }

  for (const npc of state.npcs) {
    if (!isNpcAlive(npc)) {
      continue;
    }

    if (intersects(attackRect, centeredRect(npc, npc.collider))) {
      if (!isNpcKillable(state)) {
        return;
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
      }

      if (!isNpcAlive(npc)) {
        for (const springtrap of state.springtraps) {
          if (springtrap.aiDistractionNpcId === npc.id) {
            springtrap.aiDistractionNpcId = null;
          }
        }
      }
      return;
    }
  }
}

function findNearbyUprightPallet(state: MatchState): PalletRuntime | undefined {
  return state.pallets.find((pallet) => pallet.state === "upright" && distance(state.lulu, pallet) <= 28);
}

function findNearbyRepairableGenerator(state: MatchState, actor: Vec2): GeneratorData | undefined {
  return [...state.generators]
    .filter((generator) => !generator.completed && distance(actor, generator) <= GAME_CONFIG.generator.repairRange)
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
  pallet.downedVisibleRemainingMs = GAME_CONFIG.pallet.downedVisibleMs;
  pallet.respawnRemainingMs = GAME_CONFIG.pallet.respawnMs;
  const dropZone = getPalletRect(pallet);
  const expandedZone = {
    x: dropZone.x - 8,
    y: dropZone.y - 8,
    w: dropZone.w + 16,
    h: dropZone.h + 16,
  };
  for (const springtrap of state.springtraps) {
    if (intersects(expandedZone, centeredRect(springtrap, springtrap.collider))) {
      springtrap.lock = {
        kind: "stunned",
        remainingMs: GAME_CONFIG.pallet.stunMs,
      };
    }
  }
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

  if (actor.lock.kind === "attackWindup") {
    actor.lock.remainingMs -= deltaMs;
    if (actor.lock.remainingMs <= 0) {
      actor.lock = {
        kind: "attackActive",
        remainingMs: GAME_CONFIG.attack.activeMs,
        hitApplied: false,
        facing: actor.lock.facing,
      };
    }
    return;
  }

  if (actor.lock.kind === "attackActive") {
    if (!actor.lock.hitApplied && actor.kind === "springtrap") {
      applyAttackHit(state, actor as SpringtrapState);
      actor.lock.hitApplied = true;
    }

    actor.lock.remainingMs -= deltaMs;
    if (actor.lock.remainingMs <= 0) {
      actor.lock = {
        kind: "attackRecovery",
        remainingMs: GAME_CONFIG.attack.recoveryMs,
        facing: actor.lock.facing,
      };
    }
    return;
  }

  if (actor.lock.kind === "attackRecovery" || actor.lock.kind === "stunned") {
    actor.lock.remainingMs -= deltaMs;
    if (actor.lock.remainingMs <= 0) {
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
      pallet.downedVisibleRemainingMs = 0;
    }
  }
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
  };
}

function updateGeneratorRepairs(state: MatchState, controls: MatchControls, deltaMs: number): void {
  state.luluRepairingGeneratorId = null;
  const palletOpportunity = findNearbyUprightPallet(state);
  const healerOpportunity = findNearbyHealerNpc(state);

  if (
    state.lulu.health !== "dead" &&
    state.lulu.health !== "escaped" &&
    state.lulu.lock.kind === "none" &&
    controls.lulu.actionHeld &&
    !isMoveIntentActive(controls.lulu.move) &&
    !palletOpportunity &&
    !healerOpportunity
  ) {
    const generator = findNearbyRepairableGenerator(state, state.lulu);
    if (generator) {
      repairGenerator(generator, deltaMs);
      state.luluRepairingGeneratorId = generator.id;
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
  state.lulu.burstRemainingMs = Math.max(0, state.lulu.burstRemainingMs - deltaMs);
  updateLockTimers(state, state.lulu, deltaMs);
  for (const springtrap of state.springtraps) {
    updateLockTimers(state, springtrap, deltaMs);
  }
  for (const npc of state.npcs) {
    updateLockTimers(state, npc, deltaMs);
  }
  updatePalletRespawns(state, deltaMs);

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
    return shouldHumanControlledActorVault(
      state,
      springtrap,
      input?.move ?? null,
      input?.actionPressed ?? false,
    );
  });

  tryStartLuluAction(state, controls.lulu.actionPressed && !luluWillManualVault);
  updateHealing(state, controls);
  for (let index = 0; index < state.springtraps.length; index += 1) {
    tryStartSpringtrapAction(
      state.springtraps[index],
      (effectiveSpringtrapControls[index]?.actionPressed ?? false) && !springtrapWillManualVault[index],
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
          }
        : undefined,
    );
  }
  for (const npc of state.npcs) {
    moveActor(state, npc, moveIntentFromDirection(getNpcMove(state, npc, deltaMs)), deltaMs);
  }
  updateGeneratorRepairs(state, controls, deltaMs);
  updateExitGate(state);
}
