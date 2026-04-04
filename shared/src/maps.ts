import { GAME_CONFIG } from "./config.js";
import { authoredMapToRuntimeMap } from "./mapFormat.js";
import type {
  AuthoredGate,
  AuthoredLedge,
  AuthoredMapData,
  AuthoredObstacle,
  AuthoredPallet,
  TilePoint,
} from "./mapFormat.js";
import type { MapData, MapPalette, ObstacleKind, PalletSpawn } from "./types.js";

function clonePoint(point: { x: number; y: number }): { x: number; y: number } {
  return { x: point.x, y: point.y };
}

function cloneMap(map: MapData): MapData {
  return {
    id: map.id,
    name: map.name,
    widthTiles: map.widthTiles,
    heightTiles: map.heightTiles,
    palette: { ...map.palette },
    obstacles: map.obstacles.map((entry) => ({ ...entry })),
    ledges: map.ledges.map((entry) => ({ ...entry })),
    pallets: map.pallets.map((entry) => ({ ...entry })),
    generatorSpawns: map.generatorSpawns.map((entry) => clonePoint(entry)),
    gate: { ...map.gate },
    spawns: {
      lulu: clonePoint(map.spawns.lulu),
      springtrap: clonePoint(map.spawns.springtrap),
      npcs: map.spawns.npcs.map((entry) => clonePoint(entry)),
    },
  };
}

function tile(x: number, y: number): TilePoint {
  return { x, y };
}

function generatorSpawn(x: number, y: number): TilePoint {
  return tile(x, y);
}

function obstacle(
  id: string,
  tileX: number,
  tileY: number,
  tileW: number,
  tileH: number,
  kind: ObstacleKind,
): AuthoredObstacle {
  return { id, kind, tileX, tileY, tileW, tileH };
}

function hWall(id: string, tileX: number, tileY: number, spanTiles: number): AuthoredObstacle {
  return obstacle(id, tileX, tileY, spanTiles, 1, "wall");
}

function vWall(id: string, tileX: number, tileY: number, spanTiles: number): AuthoredObstacle {
  return obstacle(id, tileX, tileY, 1, spanTiles, "wall");
}

function rock(id: string, tileX: number, tileY: number, tileW: number, tileH: number): AuthoredObstacle {
  return obstacle(id, tileX, tileY, tileW, tileH, "rock");
}

function crate(id: string, tileX: number, tileY: number, tileW = 1, tileH = 1): AuthoredObstacle {
  return rock(id, tileX, tileY, tileW, tileH);
}

function pallet(id: string, tileX: number, tileY: number, orientation: PalletSpawn["orientation"]): AuthoredPallet {
  return { id, tileX, tileY, orientation };
}

function ledge(
  id: string,
  tileX: number,
  tileY: number,
  orientation: AuthoredLedge["orientation"],
  spanTiles: number,
): AuthoredLedge {
  return { id, tileX, tileY, orientation, spanTiles };
}

function gate(side: AuthoredGate["side"], tileX: number, tileY: number): AuthoredGate {
  return { side, tileX, tileY };
}

function authoredMap(
  id: string,
  name: string,
  palette: MapPalette,
  rest: Omit<AuthoredMapData, "id" | "name" | "palette" | "widthTiles" | "heightTiles">,
): AuthoredMapData {
  return {
    id,
    name,
    widthTiles: GAME_CONFIG.map.widthTiles,
    heightTiles: GAME_CONFIG.map.heightTiles,
    palette,
    ...rest,
  };
}

const yardMapAuthoring = authoredMap(
  "yard",
  "QA Grounds",
  {
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
  },
  {
    obstacles: [
      hWall("west-yard-top", 4, 4, 12),
      vWall("west-yard-left", 4, 4, 13),
      vWall("west-yard-right", 15, 4, 13),
      hWall("west-yard-bottom-left", 4, 16, 5),
      hWall("west-yard-bottom-right", 11, 16, 5),
      rock("west-yard-rock-a", 7, 8, 2, 2),
      rock("west-yard-rock-b", 10, 8, 2, 2),
      crate("west-yard-rock-c", 9, 10),
      crate("west-yard-inner-a", 6, 6),
      crate("west-yard-inner-b", 8, 6),
      crate("west-yard-inner-c", 13, 7),
      crate("west-yard-inner-d", 13, 12),
      rock("west-yard-inner-e", 6, 13, 2, 2),
      crate("west-yard-inner-f", 10, 13),
      hWall("warehouse-top-left", 22, 6, 6),
      hWall("warehouse-top-right", 30, 6, 8),
      vWall("warehouse-left", 22, 6, 14),
      vWall("warehouse-right", 37, 6, 14),
      hWall("warehouse-bottom", 22, 19, 16),
      rock("warehouse-pillar", 29, 11, 2, 4),
      rock("warehouse-yard-rock-a", 24, 8, 2, 2),
      rock("warehouse-yard-rock-b", 34, 8, 2, 2),
      crate("warehouse-inner-a", 24, 14),
      rock("warehouse-inner-b", 26, 9, 1, 2),
      rock("warehouse-inner-c", 26, 15, 1, 2),
      rock("warehouse-inner-d", 33, 9, 1, 2),
      rock("warehouse-inner-e", 33, 15, 1, 2),
      crate("warehouse-inner-f", 35, 12),
      rock("warehouse-inner-g", 28, 15, 2, 1),
      hWall("crusher-top", 44, 5, 13),
      vWall("crusher-right", 56, 5, 14),
      hWall("crusher-bottom", 44, 18, 13),
      vWall("crusher-left-top", 44, 5, 5),
      vWall("crusher-left-bottom", 44, 12, 7),
      rock("crusher-rock-a", 48, 9, 2, 2),
      rock("crusher-rock-b", 51, 9, 2, 2),
      rock("crusher-rock-c", 53, 10, 2, 2),
      crate("crusher-inner-a", 46, 7),
      crate("crusher-inner-b", 54, 7),
      rock("crusher-inner-c", 47, 13, 2, 2),
      rock("crusher-inner-d", 52, 14, 2, 2),
      crate("crusher-inner-e", 50, 16),
      hWall("sw-yard-top", 9, 28, 15),
      vWall("sw-yard-left", 9, 28, 13),
      hWall("sw-yard-bottom", 9, 40, 15),
      vWall("sw-yard-right-top", 23, 28, 5),
      vWall("sw-yard-right-bottom", 23, 35, 6),
      rock("sw-yard-rock", 14, 33, 3, 3),
      rock("sw-yard-rock-a", 11, 30, 2, 2),
      rock("sw-yard-rock-b", 19, 31, 2, 2),
      crate("sw-yard-inner-a", 12, 37),
      crate("sw-yard-inner-b", 15, 29),
      rock("sw-yard-inner-c", 18, 36, 2, 2),
      rock("sw-yard-inner-d", 20, 33, 1, 2),
      crate("sw-yard-inner-e", 12, 32),
      hWall("service-top", 33, 29, 17),
      vWall("service-left", 33, 29, 13),
      vWall("service-right", 49, 29, 13),
      hWall("service-bottom-left", 33, 41, 6),
      hWall("service-bottom-right", 41, 41, 9),
      rock("service-rock-a", 38, 33, 2, 2),
      rock("service-rock-b", 40, 33, 2, 2),
      rock("service-rock-c", 44, 35, 2, 2),
      rock("service-rock-d", 46, 36, 2, 2),
      vWall("service-inner-left-top", 36, 30, 3),
      vWall("service-inner-left-bottom", 36, 34, 3),
      hWall("service-inner-right-left", 42, 38, 2),
      hWall("service-inner-right-right", 45, 38, 2),
      crate("service-inner-a", 35, 31),
      crate("service-inner-b", 35, 35),
      rock("service-inner-c", 38, 36, 1, 2),
      crate("service-inner-d", 41, 31),
      rock("service-inner-e", 46, 31, 1, 2),
      crate("service-inner-f", 47, 35),
      rock("mid-rock", 18, 22, 3, 3),
      vWall("mid-barrier", 27, 24, 8),
      rock("east-rock", 52, 28, 4, 4),
      rock("south-rock-a", 6, 22, 2, 2),
      rock("south-rock-b", 9, 22, 2, 2),
      rock("north-rock", 18, 8, 3, 2),
      rock("mid-east-rock", 40, 22, 2, 2),
      rock("mid-pocket-a", 14, 20, 2, 2),
      rock("mid-pocket-b", 31, 23, 2, 2),
      rock("mid-pocket-c", 46, 23, 2, 2),
      rock("east-pocket-a", 57, 23, 2, 2),
      rock("east-pocket-b", 55, 34, 2, 2),
      rock("east-pocket-c", 58, 38, 2, 2),
      crate("west-yard-crate-i", 6, 12),
      crate("west-yard-crate-j", 12, 6, 1, 2),
      crate("warehouse-crate-i", 25, 11),
      crate("warehouse-crate-j", 34, 15),
      hWall("yard-scrap-top-left", 2, 24, 3),
      hWall("yard-scrap-top-right", 6, 24, 3),
      vWall("yard-scrap-left-top", 2, 24, 2),
      vWall("yard-scrap-left-bottom", 2, 27, 3),
      vWall("yard-scrap-right-top", 8, 24, 3),
      vWall("yard-scrap-right-bottom", 8, 28, 2),
      hWall("yard-scrap-bottom-left", 2, 29, 2),
      hWall("yard-scrap-bottom-mid", 5, 29, 1),
      hWall("yard-scrap-bottom-right", 7, 29, 2),
      crate("yard-crate-a", 4, 26),
      crate("yard-crate-b", 6, 27),
      crate("yard-crate-c", 24, 23),
      crate("yard-crate-d", 26, 25),
      crate("yard-crate-e", 39, 24),
      crate("yard-crate-f", 43, 24),
      rock("yard-rock-cluster", 54, 23, 2, 3),
      crate("yard-crate-g", 31, 38),
      crate("yard-crate-h", 52, 35),
      crate("yard-crate-i", 15, 24),
      crate("yard-crate-j", 41, 33),
      crate("yard-crate-k", 47, 26),
      crate("mid-lane-a", 17, 26),
      crate("mid-lane-b", 19, 26),
      crate("mid-lane-c", 21, 27),
      rock("mid-lane-d", 35, 23, 2, 2),
      rock("mid-lane-e", 36, 26, 2, 2),
      crate("mid-lane-f", 49, 24),
      crate("mid-lane-g", 51, 25),
      rock("north-pocket-a", 40, 11, 2, 2),
      crate("north-pocket-b", 41, 14),
      crate("east-pocket-d", 57, 27),
      crate("east-pocket-e", 58, 30),
    ],
    ledges: [
      ledge("west-yard-south-ledge", 9, 16, "horizontal", 2),
      ledge("warehouse-north-ledge", 28, 6, "horizontal", 2),
      ledge("crusher-west-ledge", 44, 10, "vertical", 2),
      ledge("sw-yard-east-ledge", 23, 33, "vertical", 2),
      ledge("service-south-ledge", 39, 41, "horizontal", 2),
      ledge("service-inner-left-ledge", 36, 33, "vertical", 1),
      ledge("service-inner-right-ledge", 44, 38, "horizontal", 1),
      ledge("yard-scrap-top-ledge", 5, 24, "horizontal", 1),
      ledge("yard-scrap-left-ledge", 2, 26, "vertical", 1),
      ledge("yard-scrap-right-ledge", 8, 27, "vertical", 1),
    ],
    pallets: [
      pallet("yard-pallet-west", 7, 18, "horizontal"),
      pallet("yard-pallet-mid", 20, 18, "vertical"),
      pallet("yard-pallet-center", 27, 22, "horizontal"),
      pallet("yard-pallet-east", 42, 20, "vertical"),
      pallet("yard-pallet-southwest", 25, 36, "vertical"),
      pallet("yard-pallet-southeast", 50, 27, "horizontal"),
      pallet("yard-pallet-west-inner", 13, 10, "vertical"),
      pallet("yard-pallet-service-inner", 39, 31, "vertical"),
    ],
    generatorSpawns: [
      generatorSpawn(6, 9),
      generatorSpawn(12, 21),
      generatorSpawn(20, 12),
      generatorSpawn(29, 24),
      generatorSpawn(31, 10),
      generatorSpawn(34, 36),
      generatorSpawn(41, 25),
      generatorSpawn(46, 10),
      generatorSpawn(54, 16),
      generatorSpawn(58, 36),
    ],
    gate: gate("right", 63, 22),
    spawns: {
      lulu: tile(5, 42),
      springtrap: tile(57, 6),
      npcs: [tile(12, 9), tile(26, 34), tile(47, 12), tile(55, 39)],
    },
  },
);

const BUILT_IN_AUTHORING_MAPS = [yardMapAuthoring];
const BUILT_IN_MAPS = BUILT_IN_AUTHORING_MAPS.map((entry) => authoredMapToRuntimeMap(entry));
const builtInMapIds = new Set(BUILT_IN_MAPS.map((entry) => entry.id));
export const DEFAULT_MAP_ID = BUILT_IN_MAPS[0].id;
export const REQUIRED_RUNTIME_CUSTOM_MAP_COUNT = 2;

export interface MapCatalogStatus {
  ready: boolean;
  message: string;
  customMapCount: number;
  requiredCustomMapCount: number;
  maps: MapData[];
}

let customMaps: MapData[] = [];
let orderedMaps: MapData[] = [];
let mapRegistry = new Map<string, MapData>(BUILT_IN_MAPS.map((entry) => [entry.id, cloneMap(entry)]));

function getCatalogMessage(customMapCount: number): string {
  if (customMapCount === REQUIRED_RUNTIME_CUSTOM_MAP_COUNT) {
    return `Runtime rotation is ready with ${customMapCount} custom maps.`;
  }

  return `Runtime rotation requires exactly ${REQUIRED_RUNTIME_CUSTOM_MAP_COUNT} valid custom maps in maps/custom/. Found ${customMapCount}.`;
}

function rebuildRegistry(): void {
  orderedMaps =
    customMaps.length === REQUIRED_RUNTIME_CUSTOM_MAP_COUNT ? customMaps.map((entry) => cloneMap(entry)) : [];
  mapRegistry = new Map<string, MapData>([
    ...BUILT_IN_MAPS.map((entry) => [entry.id, cloneMap(entry)] as const),
    ...customMaps.map((entry) => [entry.id, cloneMap(entry)] as const),
  ]);
  MAPS = orderedMaps;
}

function sortCustomMaps(maps: MapData[]): MapData[] {
  return maps
    .map((entry) => cloneMap(entry))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export let MAPS: MapData[] = orderedMaps;

export function getBuiltInMaps(): MapData[] {
  return BUILT_IN_MAPS.map((entry) => cloneMap(entry));
}

export function getMapCatalog(): MapData[] {
  return orderedMaps.map((entry) => cloneMap(entry));
}

export function getCustomMaps(): MapData[] {
  return customMaps.map((entry) => cloneMap(entry));
}

export function resetMapCatalog(): void {
  customMaps = [];
  rebuildRegistry();
}

export function setCustomMaps(maps: MapData[]): void {
  customMaps = sortCustomMaps(maps).filter((entry) => !builtInMapIds.has(entry.id));
  rebuildRegistry();
}

export function replaceMapCatalog(maps: MapData[]): void {
  setCustomMaps(maps.filter((map) => !builtInMapIds.has(map.id)));
}

export function registerRuntimeMap(map: MapData): void {
  const nextCustomMaps = customMaps.filter((entry) => entry.id !== map.id);
  nextCustomMaps.push(map);
  setCustomMaps(nextCustomMaps);
}

export function getMapCatalogStatus(): MapCatalogStatus {
  return {
    ready: customMaps.length === REQUIRED_RUNTIME_CUSTOM_MAP_COUNT,
    message: getCatalogMessage(customMaps.length),
    customMapCount: customMaps.length,
    requiredCustomMapCount: REQUIRED_RUNTIME_CUSTOM_MAP_COUNT,
    maps: getMapCatalog(),
  };
}

export function getMapById(mapId: string): MapData {
  const found = mapRegistry.get(mapId);
  if (!found) {
    throw new Error(`Unknown map: ${mapId}`);
  }
  return found;
}

export function getMapIdByCycle(index: number): string {
  if (orderedMaps.length === 0) {
    throw new Error(getCatalogMessage(customMaps.length));
  }
  const mapIds = orderedMaps.map((entry) => entry.id);
  return mapIds[((index % mapIds.length) + mapIds.length) % mapIds.length];
}
