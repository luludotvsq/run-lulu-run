import { TILE_SIZE } from "@shared/config.js";

const ASSET_PUBLIC_ROOT = "/game-assets";

export const CLIENT_CONFIG = {
  branding: {
    displayTitle: "Run, Lulu, Run",
    titleDisplayLines: ["Run,", "LULU,", "Run"],
    titleSplashImage: `${ASSET_PUBLIC_ROOT}/ui/title-splash.jpg`,
    audioHint: "Audio starts after your first input.",
  },
  presentation: {
    backgroundColor: "#09111d",
    pixelArt: true,
  },
  camera: {
    matchZoom: 1.08,
  },
  assets: {
    publicRoot: ASSET_PUBLIC_ROOT,
  },
  audio: {
    titleVolume: 0.36,
    gameplayVolume: 0.28,
    fadeDurationMs: 450,
    titleTrack: "title",
    gameplayTracks: ["gameplayC", "gameplayD"],
  },
  touchControls: {
    padMaxRadiusPx: 48,
    padDeadzonePx: 12,
    diagonalBias: 0.35,
    actionLabel: "",
    actionHint: "",
  },
  browser: {
    preventTouchZoom: true,
    doubleTapBlockWindowMs: 320,
  },
  worldVisuals: {
    cellSizePx: TILE_SIZE,
    walkFrameMs: 120,
    walkFrameGraceMs: 140,
    gateSizePx: TILE_SIZE * 4,
    chestSizePx: TILE_SIZE,
    chestRewardSizePx: TILE_SIZE * 0.9,
    projectileSizePx: TILE_SIZE * 0.72,
    effectIconSizePx: TILE_SIZE * 0.9,
  },
} as const;
