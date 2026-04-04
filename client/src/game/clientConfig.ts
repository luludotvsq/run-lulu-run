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
    gameplayTracks: ["gameplayA", "gameplayB"],
  },
  worldVisuals: {
    cellSizePx: TILE_SIZE,
    walkFrameMs: 120,
    gateSizePx: TILE_SIZE * 4,
  },
} as const;
