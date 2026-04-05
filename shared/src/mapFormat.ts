import { GAME_CONFIG, TILE_SIZE } from "./config.js";
import type {
  GateData,
  LedgeOrientation,
  MapData,
  MapPalette,
  ObstacleKind,
  PalletSpawn,
  Vec2,
} from "./types.js";

export type MapJsonData = AuthoredMapData;

export interface TilePoint {
  x: number;
  y: number;
}

export interface AuthoredObstacle {
  id: string;
  kind: ObstacleKind;
  tileX: number;
  tileY: number;
  tileW: number;
  tileH: number;
}

export interface AuthoredLedge {
  id: string;
  orientation: LedgeOrientation;
  tileX: number;
  tileY: number;
  spanTiles: number;
}

export interface AuthoredPallet {
  id: string;
  tileX: number;
  tileY: number;
  orientation: PalletSpawn["orientation"];
}

export interface AuthoredGate {
  side: GateData["side"];
  tileX: number;
  tileY: number;
}

export interface AuthoredSpawns {
  lulu: TilePoint | null;
  springtrap: TilePoint | null;
  npcs: Array<TilePoint | null>;
}

export interface AuthoredMapData {
  id: string;
  name: string;
  widthTiles: number;
  heightTiles: number;
  palette: MapPalette;
  obstacles: AuthoredObstacle[];
  ledges: AuthoredLedge[];
  pallets: AuthoredPallet[];
  generatorSpawns: TilePoint[];
  gate: AuthoredGate | null;
  spawns: AuthoredSpawns;
}

export const DEFAULT_MAP_PALETTE: MapPalette = {
  floor: 0x1d2c2c,
  floorAlt: 0x233635,
  floorAccent: 0x304947,
  wall: 0x50616f,
  rock: 0x75828a,
  car: 0x823a35,
  ledge: 0xb1c6d9,
  pallet: 0xc38b4d,
  brokenPallet: 0x6e5539,
  gateClosed: 0x6a7b7f,
  gateOpen: 0x4bd27b,
  boundary: 0x0f181b,
};

const GATE_SPAN_TILES = 4;

function clonePoint(point: TilePoint | null): TilePoint | null {
  if (!point) {
    return null;
  }

  return { x: point.x, y: point.y };
}

function tileCenter(tileX: number, tileY: number): Vec2 {
  return {
    x: tileX * TILE_SIZE + TILE_SIZE * 0.5,
    y: tileY * TILE_SIZE + TILE_SIZE * 0.5,
  };
}

export function createBlankAuthoredMap(): AuthoredMapData {
  return {
    id: "custom-map",
    name: "Custom Map",
    widthTiles: GAME_CONFIG.map.widthTiles,
    heightTiles: GAME_CONFIG.map.heightTiles,
    palette: { ...DEFAULT_MAP_PALETTE },
    obstacles: [],
    ledges: [],
    pallets: [],
    generatorSpawns: [],
    gate: null,
    spawns: {
      lulu: null,
      springtrap: null,
      npcs: [null, null, null, null],
    },
  };
}

export function cloneAuthoredMap(map: AuthoredMapData): AuthoredMapData {
  return {
    id: map.id,
    name: map.name,
    widthTiles: map.widthTiles,
    heightTiles: map.heightTiles,
    palette: { ...map.palette },
    obstacles: map.obstacles.map((entry) => ({ ...entry })),
    ledges: map.ledges.map((entry) => ({ ...entry })),
    pallets: map.pallets.map((entry) => ({ ...entry })),
    generatorSpawns: map.generatorSpawns.map((entry) => ({ ...entry })),
    gate: map.gate ? { ...map.gate } : null,
    spawns: {
      lulu: clonePoint(map.spawns.lulu),
      springtrap: clonePoint(map.spawns.springtrap),
      npcs: map.spawns.npcs.map((entry) => clonePoint(entry)),
    },
  };
}

export function getGateSpanTiles(side: GateData["side"]): number {
  return side === "left" || side === "right" ? GATE_SPAN_TILES : GATE_SPAN_TILES;
}

function gateFootprint(gate: AuthoredGate): { tileX: number; tileY: number; tileW: number; tileH: number } {
  if (gate.side === "left" || gate.side === "right") {
    return {
      tileX: gate.tileX,
      tileY: gate.tileY,
      tileW: 1,
      tileH: GATE_SPAN_TILES,
    };
  }

  return {
    tileX: gate.tileX,
    tileY: gate.tileY,
    tileW: GATE_SPAN_TILES,
    tileH: 1,
  };
}

export function authoredMapToRuntimeMap(map: AuthoredMapData): MapData {
  const issues = validateAuthoredMap(map);
  if (issues.length > 0) {
    throw new Error(issues[0]);
  }

  const gate = map.gate as AuthoredGate;
  const gateIsVertical = gate.side === "left" || gate.side === "right";

  return {
    id: map.id,
    name: map.name,
    widthTiles: map.widthTiles,
    heightTiles: map.heightTiles,
    palette: { ...map.palette },
    obstacles: map.obstacles.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      blocksSight: true,
      x: entry.tileX * TILE_SIZE,
      y: entry.tileY * TILE_SIZE,
      w: entry.tileW * TILE_SIZE,
      h: entry.tileH * TILE_SIZE,
    })),
    ledges: map.ledges.map((entry) => {
      if (entry.orientation === "horizontal") {
        return {
          id: entry.id,
          orientation: entry.orientation,
          x: entry.tileX * TILE_SIZE,
          y: entry.tileY * TILE_SIZE + 11,
          w: entry.spanTiles * TILE_SIZE,
          h: 10,
        };
      }

      return {
        id: entry.id,
        orientation: entry.orientation,
        x: entry.tileX * TILE_SIZE + 11,
        y: entry.tileY * TILE_SIZE,
        w: 10,
        h: entry.spanTiles * TILE_SIZE,
      };
    }),
    pallets: map.pallets.map((entry) => ({
      id: entry.id,
      x: entry.tileX * TILE_SIZE + TILE_SIZE * 0.5,
      y: entry.tileY * TILE_SIZE + TILE_SIZE * 0.5,
      orientation: entry.orientation,
    })),
    generatorSpawns: map.generatorSpawns.map((entry, index) => ({
      id: `generator-spawn-${index + 1}`,
      x: entry.x * TILE_SIZE + TILE_SIZE * 0.5,
      y: entry.y * TILE_SIZE + TILE_SIZE * 0.5,
    })),
    gate: {
      side: gate.side,
      x: gateIsVertical ? gate.tileX * TILE_SIZE : gate.tileX * TILE_SIZE,
      y: gateIsVertical ? gate.tileY * TILE_SIZE : gate.tileY * TILE_SIZE,
      w: gateIsVertical ? TILE_SIZE : GATE_SPAN_TILES * TILE_SIZE,
      h: gateIsVertical ? GATE_SPAN_TILES * TILE_SIZE : TILE_SIZE,
    },
    spawns: {
      lulu: tileCenter((map.spawns.lulu as TilePoint).x, (map.spawns.lulu as TilePoint).y),
      springtrap: tileCenter((map.spawns.springtrap as TilePoint).x, (map.spawns.springtrap as TilePoint).y),
      npcs: map.spawns.npcs.map((entry) => tileCenter((entry as TilePoint).x, (entry as TilePoint).y)),
    },
  };
}

export function runtimeMapToAuthoredMap(map: MapData): AuthoredMapData {
  return {
    id: map.id,
    name: map.name,
    widthTiles: map.widthTiles,
    heightTiles: map.heightTiles,
    palette: { ...map.palette },
    obstacles: map.obstacles.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      tileX: Math.round(entry.x / TILE_SIZE),
      tileY: Math.round(entry.y / TILE_SIZE),
      tileW: Math.round(entry.w / TILE_SIZE),
      tileH: Math.round(entry.h / TILE_SIZE),
    })),
    ledges: map.ledges.map((entry) => ({
      id: entry.id,
      orientation: entry.orientation,
      tileX: entry.orientation === "horizontal" ? Math.round(entry.x / TILE_SIZE) : Math.round((entry.x - 11) / TILE_SIZE),
      tileY: entry.orientation === "horizontal" ? Math.round((entry.y - 11) / TILE_SIZE) : Math.round(entry.y / TILE_SIZE),
      spanTiles:
        entry.orientation === "horizontal" ? Math.round(entry.w / TILE_SIZE) : Math.round(entry.h / TILE_SIZE),
    })),
    pallets: map.pallets.map((entry) => ({
      id: entry.id,
      tileX: Math.round((entry.x - TILE_SIZE * 0.5) / TILE_SIZE),
      tileY: Math.round((entry.y - TILE_SIZE * 0.5) / TILE_SIZE),
      orientation: entry.orientation,
    })),
    generatorSpawns: map.generatorSpawns.map((entry) => ({
      x: Math.round((entry.x - TILE_SIZE * 0.5) / TILE_SIZE),
      y: Math.round((entry.y - TILE_SIZE * 0.5) / TILE_SIZE),
    })),
    gate: {
      side: map.gate.side,
      tileX: Math.round(map.gate.x / TILE_SIZE),
      tileY: Math.round(map.gate.y / TILE_SIZE),
    },
    spawns: {
      lulu: {
        x: Math.round((map.spawns.lulu.x - TILE_SIZE * 0.5) / TILE_SIZE),
        y: Math.round((map.spawns.lulu.y - TILE_SIZE * 0.5) / TILE_SIZE),
      },
      springtrap: {
        x: Math.round((map.spawns.springtrap.x - TILE_SIZE * 0.5) / TILE_SIZE),
        y: Math.round((map.spawns.springtrap.y - TILE_SIZE * 0.5) / TILE_SIZE),
      },
      npcs: map.spawns.npcs.map((entry) => ({
        x: Math.round((entry.x - TILE_SIZE * 0.5) / TILE_SIZE),
        y: Math.round((entry.y - TILE_SIZE * 0.5) / TILE_SIZE),
      })),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function readNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return value;
}

function readInteger(value: unknown, label: string): number {
  const parsed = readNumber(value, label);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer.`);
  }

  return parsed;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
  }

  return value as T;
}

function readVec2(value: unknown, label: string): Vec2 {
  const record = asRecord(value, label);
  return {
    x: readNumber(record.x, `${label}.x`),
    y: readNumber(record.y, `${label}.y`),
  };
}

function readTilePoint(value: unknown, label: string): TilePoint {
  const record = asRecord(value, label);
  return {
    x: readInteger(record.x, `${label}.x`),
    y: readInteger(record.y, `${label}.y`),
  };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value;
}

function readPalette(value: unknown): MapPalette {
  const record = asRecord(value, "palette");
  return {
    floor: readNumber(record.floor, "palette.floor"),
    floorAlt: readNumber(record.floorAlt, "palette.floorAlt"),
    floorAccent: readNumber(record.floorAccent, "palette.floorAccent"),
    wall: readNumber(record.wall, "palette.wall"),
    rock: readNumber(record.rock, "palette.rock"),
    car: readNumber(record.car, "palette.car"),
    ledge: readNumber(record.ledge, "palette.ledge"),
    pallet: readNumber(record.pallet, "palette.pallet"),
    brokenPallet: readNumber(record.brokenPallet, "palette.brokenPallet"),
    gateClosed: readNumber(record.gateClosed, "palette.gateClosed"),
    gateOpen: readNumber(record.gateOpen, "palette.gateOpen"),
    boundary: readNumber(record.boundary, "palette.boundary"),
  };
}

export function parseAuthoredMapData(value: unknown): AuthoredMapData {
  const record = asRecord(value, "map");
  const obstacles = Array.isArray(record.obstacles) ? record.obstacles : [];
  const ledges = Array.isArray(record.ledges) ? record.ledges : [];
  const pallets = Array.isArray(record.pallets) ? record.pallets : [];
  const generatorSpawns = Array.isArray(record.generatorSpawns) ? record.generatorSpawns : [];
  const spawnsRecord = asRecord(record.spawns, "spawns");
  const rawNpcSpawns = Array.isArray(spawnsRecord.npcs) ? spawnsRecord.npcs : [];
  const gateRecord = record.gate === null ? null : asRecord(record.gate, "gate");

  if (rawNpcSpawns.length !== 4) {
    throw new Error("spawns.npcs must contain exactly 4 entries.");
  }

  const map: AuthoredMapData = {
    id: readString(record.id, "id"),
    name: readString(record.name, "name"),
    widthTiles: readInteger(record.widthTiles, "widthTiles"),
    heightTiles: readInteger(record.heightTiles, "heightTiles"),
    palette: readPalette(record.palette),
    obstacles: obstacles.map((entry, index) => {
      const obstacle = asRecord(entry, `obstacles[${index}]`);
      return {
        id: readString(obstacle.id, `obstacles[${index}].id`),
        kind: readEnum(obstacle.kind, ["wall", "rock", "car"], `obstacles[${index}].kind`),
        tileX: readInteger(obstacle.tileX, `obstacles[${index}].tileX`),
        tileY: readInteger(obstacle.tileY, `obstacles[${index}].tileY`),
        tileW: readInteger(obstacle.tileW, `obstacles[${index}].tileW`),
        tileH: readInteger(obstacle.tileH, `obstacles[${index}].tileH`),
      };
    }),
    ledges: ledges.map((entry, index) => {
      const ledge = asRecord(entry, `ledges[${index}]`);
      return {
        id: readString(ledge.id, `ledges[${index}].id`),
        orientation: readEnum(ledge.orientation, ["horizontal", "vertical"], `ledges[${index}].orientation`),
        tileX: readInteger(ledge.tileX, `ledges[${index}].tileX`),
        tileY: readInteger(ledge.tileY, `ledges[${index}].tileY`),
        spanTiles: readInteger(ledge.spanTiles, `ledges[${index}].spanTiles`),
      };
    }),
    pallets: pallets.map((entry, index) => {
      const pallet = asRecord(entry, `pallets[${index}]`);
      return {
        id: readString(pallet.id, `pallets[${index}].id`),
        tileX: readInteger(pallet.tileX, `pallets[${index}].tileX`),
        tileY: readInteger(pallet.tileY, `pallets[${index}].tileY`),
        orientation: readEnum(pallet.orientation, ["horizontal", "vertical"], `pallets[${index}].orientation`),
      };
    }),
    generatorSpawns: generatorSpawns.map((entry, index) => readTilePoint(entry, `generatorSpawns[${index}]`)),
    gate: gateRecord
      ? {
          side: readEnum(gateRecord.side, ["top", "right", "bottom", "left"], "gate.side"),
          tileX: readInteger(gateRecord.tileX, "gate.tileX"),
          tileY: readInteger(gateRecord.tileY, "gate.tileY"),
        }
      : null,
    spawns: {
      lulu: spawnsRecord.lulu === null ? null : readTilePoint(spawnsRecord.lulu, "spawns.lulu"),
      springtrap: spawnsRecord.springtrap === null ? null : readTilePoint(spawnsRecord.springtrap, "spawns.springtrap"),
      npcs: rawNpcSpawns.map((entry, index) => (entry === null ? null : readTilePoint(entry, `spawns.npcs[${index}]`))),
    },
  };

  const issues = validateAuthoredMap(map);
  if (issues.length > 0) {
    throw new Error(issues[0]);
  }

  return map;
}

export function parseAuthoredMapJson(json: string): AuthoredMapData {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Invalid JSON.");
  }

  return parseAuthoredMapData(parsed);
}

export function serializeAuthoredMap(map: AuthoredMapData): string {
  return JSON.stringify(map, null, 2);
}

export function parseRuntimeMapData(value: unknown): MapData {
  const record = asRecord(value, "map");
  const obstacles = Array.isArray(record.obstacles) ? record.obstacles : [];
  const ledges = Array.isArray(record.ledges) ? record.ledges : [];
  const pallets = Array.isArray(record.pallets) ? record.pallets : [];
  const generatorSpawns = Array.isArray(record.generatorSpawns) ? record.generatorSpawns : [];
  const spawnsRecord = asRecord(record.spawns, "spawns");
  const gateRecord = asRecord(record.gate, "gate");
  const npcSpawns = Array.isArray(spawnsRecord.npcs) ? spawnsRecord.npcs : [];

  if (npcSpawns.length !== 4) {
    throw new Error("spawns.npcs must contain exactly 4 entries.");
  }

  return {
    id: readString(record.id, "id"),
    name: readString(record.name, "name"),
    widthTiles: readNumber(record.widthTiles, "widthTiles"),
    heightTiles: readNumber(record.heightTiles, "heightTiles"),
    palette: readPalette(record.palette),
    obstacles: obstacles.map((entry, index) => {
      const obstacle = asRecord(entry, `obstacles[${index}]`);
      return {
        id: readString(obstacle.id, `obstacles[${index}].id`),
        kind: readEnum(obstacle.kind, ["wall", "rock", "car"], `obstacles[${index}].kind`),
        blocksSight: obstacle.blocksSight === undefined ? true : Boolean(obstacle.blocksSight),
        x: readNumber(obstacle.x, `obstacles[${index}].x`),
        y: readNumber(obstacle.y, `obstacles[${index}].y`),
        w: readNumber(obstacle.w, `obstacles[${index}].w`),
        h: readNumber(obstacle.h, `obstacles[${index}].h`),
      };
    }),
    ledges: ledges.map((entry, index) => {
      const ledge = asRecord(entry, `ledges[${index}]`);
      return {
        id: readString(ledge.id, `ledges[${index}].id`),
        orientation: readEnum(ledge.orientation, ["horizontal", "vertical"], `ledges[${index}].orientation`),
        x: readNumber(ledge.x, `ledges[${index}].x`),
        y: readNumber(ledge.y, `ledges[${index}].y`),
        w: readNumber(ledge.w, `ledges[${index}].w`),
        h: readNumber(ledge.h, `ledges[${index}].h`),
      };
    }),
    pallets: pallets.map((entry, index) => {
      const pallet = asRecord(entry, `pallets[${index}]`);
      return {
        id: readString(pallet.id, `pallets[${index}].id`),
        x: readNumber(pallet.x, `pallets[${index}].x`),
        y: readNumber(pallet.y, `pallets[${index}].y`),
        orientation: readEnum(pallet.orientation, ["horizontal", "vertical"], `pallets[${index}].orientation`),
      };
    }),
    generatorSpawns: generatorSpawns.map((entry, index) => readVec2(entry, `generatorSpawns[${index}]`)),
    gate: {
      side: readEnum(gateRecord.side, ["top", "right", "bottom", "left"], "gate.side"),
      x: readNumber(gateRecord.x, "gate.x"),
      y: readNumber(gateRecord.y, "gate.y"),
      w: readNumber(gateRecord.w, "gate.w"),
      h: readNumber(gateRecord.h, "gate.h"),
    },
    spawns: {
      lulu: readVec2(spawnsRecord.lulu, "spawns.lulu"),
      springtrap: readVec2(spawnsRecord.springtrap, "spawns.springtrap"),
      npcs: npcSpawns.map((entry, index) => readVec2(entry, `spawns.npcs[${index}]`)),
    },
  };
}

export function parseRuntimeMapJson(json: string): MapData {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Invalid JSON.");
  }

  return parseRuntimeMapData(parsed);
}

export function serializeRuntimeMap(map: MapData): string {
  return JSON.stringify(map, null, 2);
}

export function validateAuthoredMap(map: AuthoredMapData): string[] {
  const issues: string[] = [];
  const pointKeys = new Set<string>();
  const occupiedPoints = new Map<string, string>();
  const gateTiles = map.gate ? gateFootprint(map.gate) : null;

  function pointInsideRect(point: TilePoint, rect: { tileX: number; tileY: number; tileW: number; tileH: number }): boolean {
    return (
      point.x >= rect.tileX &&
      point.x < rect.tileX + rect.tileW &&
      point.y >= rect.tileY &&
      point.y < rect.tileY + rect.tileH
    );
  }

  function pointInsideObstacle(point: TilePoint): boolean {
    return map.obstacles.some((obstacle) =>
      pointInsideRect(point, {
        tileX: obstacle.tileX,
        tileY: obstacle.tileY,
        tileW: obstacle.tileW,
        tileH: obstacle.tileH,
      }),
    );
  }

  function pointInsideLedge(point: TilePoint): boolean {
    return map.ledges.some((ledge) => {
      if (ledge.orientation === "horizontal") {
        return point.y === ledge.tileY && point.x >= ledge.tileX && point.x < ledge.tileX + ledge.spanTiles;
      }

      return point.x === ledge.tileX && point.y >= ledge.tileY && point.y < ledge.tileY + ledge.spanTiles;
    });
  }

  function pointInsidePallet(point: TilePoint): boolean {
    return map.pallets.some((pallet) => pallet.tileX === point.x && pallet.tileY === point.y);
  }

  function pointInBounds(point: TilePoint, label: string): void {
    if (point.x < 0 || point.y < 0 || point.x >= map.widthTiles || point.y >= map.heightTiles) {
      issues.push(`${label} must stay within the map bounds.`);
    }
  }

  function pointBlocked(point: TilePoint, label: string): void {
    if (pointInsideObstacle(point)) {
      issues.push(`${label} cannot be placed inside an obstacle.`);
      return;
    }

    if (pointInsideLedge(point)) {
      issues.push(`${label} cannot be placed on a ledge.`);
      return;
    }

    if (pointInsidePallet(point)) {
      issues.push(`${label} cannot be placed on a pallet.`);
      return;
    }

    if (gateTiles && pointInsideRect(point, gateTiles)) {
      issues.push(`${label} cannot be placed inside the gate footprint.`);
    }
  }

  function pointOverlapsAnotherPlacement(point: TilePoint, label: string): void {
    const key = `${point.x},${point.y}`;
    const existing = occupiedPoints.get(key);
    if (existing) {
      issues.push(`${label} overlaps ${existing}.`);
      return;
    }
    occupiedPoints.set(key, label);
  }

  if (!map.id.trim()) {
    issues.push("Map id is required.");
  } else if (!/^[a-z0-9-]+$/.test(map.id.trim())) {
    issues.push("Map id must use lowercase letters, numbers, and hyphens only.");
  }

  if (!map.name.trim()) {
    issues.push("Map name is required.");
  }

  if (map.widthTiles !== GAME_CONFIG.map.widthTiles || map.heightTiles !== GAME_CONFIG.map.heightTiles) {
    issues.push(`Editor maps must stay at ${GAME_CONFIG.map.widthTiles}x${GAME_CONFIG.map.heightTiles} tiles.`);
  }

  if (!map.gate) {
    issues.push("Gate placement is required.");
  }

  if (!map.spawns.lulu) {
    issues.push("LULU spawn is required.");
  }

  if (!map.spawns.springtrap) {
    issues.push("AYU spawn is required.");
  }

  if (map.spawns.npcs.length !== 4 || map.spawns.npcs.some((entry) => !entry)) {
    issues.push("Exactly 4 NPC spawns are required.");
  }

  if (map.generatorSpawns.length < GAME_CONFIG.generator.totalCount) {
    issues.push(`At least ${GAME_CONFIG.generator.totalCount} generator spawns are required.`);
  }

  for (const [index, generator] of map.generatorSpawns.entries()) {
    pointInBounds(generator, `generatorSpawns[${index}]`);
    pointBlocked(generator, `generatorSpawns[${index}]`);
    pointOverlapsAnotherPlacement(generator, `generatorSpawns[${index}]`);
    const key = `${generator.x},${generator.y}`;
    if (pointKeys.has(`generator:${key}`)) {
      issues.push(`generatorSpawns[${index}] duplicates another generator spawn.`);
      break;
    }
    pointKeys.add(`generator:${key}`);
  }

  if (map.spawns.lulu) {
    pointInBounds(map.spawns.lulu, "spawns.lulu");
    pointBlocked(map.spawns.lulu, "spawns.lulu");
    pointOverlapsAnotherPlacement(map.spawns.lulu, "spawns.lulu");
  }

  if (map.spawns.springtrap) {
    pointInBounds(map.spawns.springtrap, "spawns.springtrap");
    pointBlocked(map.spawns.springtrap, "spawns.springtrap");
    pointOverlapsAnotherPlacement(map.spawns.springtrap, "spawns.springtrap");
  }

  for (const [index, npcSpawn] of map.spawns.npcs.entries()) {
    if (!npcSpawn) {
      continue;
    }
    pointInBounds(npcSpawn, `spawns.npcs[${index}]`);
    pointBlocked(npcSpawn, `spawns.npcs[${index}]`);
    pointOverlapsAnotherPlacement(npcSpawn, `spawns.npcs[${index}]`);
  }

  for (const obstacle of map.obstacles) {
    if (obstacle.tileW <= 0 || obstacle.tileH <= 0) {
      issues.push(`Obstacle "${obstacle.id}" must have a positive tile size.`);
      break;
    }
  }

  for (const ledge of map.ledges) {
    if (ledge.spanTiles <= 0) {
      issues.push(`Ledge "${ledge.id}" must span at least 1 tile.`);
      break;
    }
  }

  return issues;
}
