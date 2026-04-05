export interface Vec2 {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Direction = "up" | "down" | "left" | "right";
export interface MoveIntent {
  primary: Direction;
  secondary: Direction | null;
}

export type Role = "lulu" | "springtrap";
export type MatchMode = "single" | "multiplayer";
export type MatchResult = "running" | "lulu_win" | "springtrap_win";
export type HealthState = "healthy" | "injured" | "dead" | "escaped";
export type NpcHealthState = "healthy" | "injured" | "dead";
export type NpcAiMode = "wander" | "move_to_generator" | "repair_generator" | "flee";
export type SpringtrapAiState = "hunt" | "chase" | "search" | "cooldown";
export type ObstacleKind = "wall" | "rock" | "car";
export type LedgeOrientation = "horizontal" | "vertical";
export type PalletState = "upright" | "downed" | "respawning";
export type ChestState = "closed" | "opened";
export type ChestReward = "armor" | "flashlight" | "heart_charm" | "wrench";
export type ProjectileKind = "wrench";

export interface ObstacleData extends Rect {
  id: string;
  kind: ObstacleKind;
  blocksSight: boolean;
}

export interface LedgeData extends Rect {
  id: string;
  orientation: LedgeOrientation;
}

export interface PalletSpawn {
  id: string;
  x: number;
  y: number;
  orientation: LedgeOrientation;
}

export interface GateData extends Rect {
  side: "top" | "right" | "bottom" | "left";
}

export interface GeneratorData extends Vec2 {
  id: string;
  progress: number;
  completed: boolean;
}

export interface MapPalette {
  floor: number;
  floorAlt: number;
  floorAccent: number;
  wall: number;
  rock: number;
  car: number;
  ledge: number;
  pallet: number;
  brokenPallet: number;
  gateClosed: number;
  gateOpen: number;
  boundary: number;
}

export interface MapData {
  id: string;
  name: string;
  widthTiles: number;
  heightTiles: number;
  palette: MapPalette;
  obstacles: ObstacleData[];
  ledges: LedgeData[];
  pallets: PalletSpawn[];
  generatorSpawns: Vec2[];
  gate: GateData;
  spawns: {
    lulu: Vec2;
    springtrap: Vec2;
    npcs: Vec2[];
  };
}

export type ActorLock =
  | { kind: "none" }
  | {
      kind: "vault";
      remainingMs: number;
      totalMs: number;
      from: Vec2;
      to: Vec2;
      sourceId: string;
      sourceType: "ledge" | "pallet";
    }
  | {
      kind: "charmed";
      remainingMs: number;
      totalMs: number;
      from: Vec2;
      to: Vec2;
      sourceId: string;
    }
  | {
      kind: "stunned";
      remainingMs: number;
      knockbackElapsedMs: number;
      knockbackDurationMs: number;
      knockbackFrom: Vec2;
      knockbackTo: Vec2;
    }
  | { kind: "flashBlinded"; remainingMs: number; totalMs: number }
  | { kind: "attackWindup"; remainingMs: number; facing: Direction; attackMode: "melee" | "projectile" }
  | { kind: "attackActive"; remainingMs: number; hitApplied: boolean; facing: Direction; attackMode: "melee" | "projectile" }
  | { kind: "attackRecovery"; remainingMs: number; facing: Direction; attackMode: "melee" | "projectile" }
  | { kind: "palletDrop"; remainingMs: number; palletId: string }
  | { kind: "openingChest"; remainingMs: number; totalMs: number; chestId: string }
  | { kind: "healing"; remainingMs: number; totalMs: number; npcId: string }
  | { kind: "healAssist"; remainingMs: number; totalMs: number; luluId: string };

export interface ActorBase {
  id: string;
  kind: "lulu" | "springtrap" | "npc";
  x: number;
  y: number;
  facing: Direction;
  collider: Size;
  lock: ActorLock;
}

export interface LuluState extends ActorBase {
  kind: "lulu";
  health: HealthState;
  burstRemainingMs: number;
  armorCharges: number;
  flashlightRemainingMs: number;
  flashlightCooldownRemainingMs: number;
  charmRecoveryRemainingMs: number;
}

export interface SpringtrapState extends ActorBase {
  kind: "springtrap";
  aiState: SpringtrapAiState;
  aiStateRemainingMs: number;
  aiChaseSightLossMs: number;
  aiLastConfirmedLulu: Vec2 | null;
  aiLastConfirmedLuluDirection: Direction | null;
  aiHuntTarget: Vec2 | null;
  aiHuntRetargetRemainingMs: number;
  aiSearchWaypointIndex: number;
  aiSearchWaypoints: Vec2[];
  aiDistractionNpcId: string | null;
  aiCommitDirection: Direction | null;
  aiCommitRemainingMs: number;
  aiBlockedCommitFrames: number;
  aiStuckFrames: number;
  aiStuckAnchor: Vec2 | null;
  trackerDisabledRemainingMs: number;
  flashOverlayRemainingMs: number;
  insideFlashlightZone: boolean;
  heartCharmRemainingMs: number;
  heartCharmCooldownRemainingMs: number;
  wrenchRemainingMs: number;
}

export interface NpcState extends ActorBase {
  kind: "npc";
  health: NpcHealthState;
  aiMode: NpcAiMode;
  wanderDirection: Direction | null;
  decisionRemainingMs: number;
  targetGeneratorId: string | null;
  healChargesRemaining: number;
}

export interface PalletRuntime {
  id: string;
  x: number;
  y: number;
  orientation: LedgeOrientation;
  state: PalletState;
  slowsSpringtrap: boolean;
  downedVisibleRemainingMs: number;
  respawnRemainingMs: number;
}

export interface TreasureChestRuntime {
  id: string;
  x: number;
  y: number;
  state: ChestState;
  reward: ChestReward | null;
  openedBy: Role | null;
  openedRemainingMs: number;
}

export interface ProjectileRuntime {
  id: string;
  kind: ProjectileKind;
  ownerId: string;
  x: number;
  y: number;
  facing: Direction;
  remainingPx: number;
}

export interface MatchState {
  mode: MatchMode;
  mapId: string;
  elapsedMs: number;
  exitOpen: boolean;
  result: MatchResult;
  resultReason: string | null;
  lulu: LuluState;
  springtrap: SpringtrapState;
  springtraps: SpringtrapState[];
  npcs: NpcState[];
  generators: GeneratorData[];
  luluRepairingGeneratorId: string | null;
  luluHealingNpcId: string | null;
  luluOpeningChestId: string | null;
  springtrapOpeningChestId: string | null;
  pallets: PalletRuntime[];
  chests: TreasureChestRuntime[];
  projectiles: ProjectileRuntime[];
  nextChestId: number;
  nextProjectileId: number;
  roundNumber: number;
}

export interface MatchInput {
  move: MoveIntent | null;
  actionPressed: boolean;
  actionHeld: boolean;
}

export interface MatchControls {
  lulu: MatchInput;
  springtrap: MatchInput;
}
