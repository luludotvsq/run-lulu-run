import { CLIENT_CONFIG } from "../clientConfig.js";

const root = CLIENT_CONFIG.assets.publicRoot;

function at(path: string): string {
  return `${root}${path}`;
}

export const GAME_ASSET_MANIFEST = {
  characters: {
    lulu: {
      up: [at("/characters/lulu/up/frame-0.png"), at("/characters/lulu/up/frame-1.png"), at("/characters/lulu/up/frame-2.png")],
      down: [at("/characters/lulu/down/frame-0.png"), at("/characters/lulu/down/frame-1.png"), at("/characters/lulu/down/frame-2.png")],
      left: [at("/characters/lulu/left/frame-0.png"), at("/characters/lulu/left/frame-1.png"), at("/characters/lulu/left/frame-2.png")],
      right: [at("/characters/lulu/right/frame-0.png"), at("/characters/lulu/right/frame-1.png"), at("/characters/lulu/right/frame-2.png")],
    },
    springtrap: {
      up: [at("/characters/springtrap/up/frame-0.png"), at("/characters/springtrap/up/frame-1.png"), at("/characters/springtrap/up/frame-2.png")],
      down: [at("/characters/springtrap/down/frame-0.png"), at("/characters/springtrap/down/frame-1.png"), at("/characters/springtrap/down/frame-2.png")],
      left: [at("/characters/springtrap/left/frame-0.png"), at("/characters/springtrap/left/frame-1.png"), at("/characters/springtrap/left/frame-2.png")],
      right: [at("/characters/springtrap/right/frame-0.png"), at("/characters/springtrap/right/frame-1.png"), at("/characters/springtrap/right/frame-2.png")],
    },
    npc: {
      up: [at("/characters/npc/up/frame-0.png"), at("/characters/npc/up/frame-1.png"), at("/characters/npc/up/frame-2.png")],
      down: [at("/characters/npc/down/frame-0.png"), at("/characters/npc/down/frame-1.png"), at("/characters/npc/down/frame-2.png")],
      left: [at("/characters/npc/left/frame-0.png"), at("/characters/npc/left/frame-1.png"), at("/characters/npc/left/frame-2.png")],
      right: [at("/characters/npc/right/frame-0.png"), at("/characters/npc/right/frame-1.png"), at("/characters/npc/right/frame-2.png")],
    },
  },
  environment: {
    floor: {
      base: at("/environment/tiles/floor/base.png"),
      alt: at("/environment/tiles/floor/alt.png"),
    },
    obstacles: {
      wallHorizontal: at("/environment/obstacles/wall-horizontal.png"),
      wallVertical: at("/environment/obstacles/wall-vertical.png"),
      rock: at("/environment/obstacles/rock.png"),
    },
    interactables: {
      gateClosed: at("/environment/interactables/gate/closed.png"),
      gateOpen: at("/environment/interactables/gate/open.png"),
      palletUpright: at("/environment/interactables/pallet/upright.png"),
      palletDown: at("/environment/interactables/pallet/down.png"),
    },
  },
  audio: {
    music: {
      title: at("/audio/music/shared-theme.wav"),
      gameplayA: at("/audio/music/shared-theme.wav"),
      gameplayB: at("/audio/music/round-b-theme.wav"),
    },
  },
  ui: {
    titleSplash: at("/ui/title-splash.jpg"),
  },
} as const;
