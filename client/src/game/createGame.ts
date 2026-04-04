import Phaser from "phaser";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "@shared/config.js";
import { GameScene } from "./GameScene.js";
import { CLIENT_CONFIG } from "./clientConfig.js";

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.CANVAS,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    parent,
    backgroundColor: CLIENT_CONFIG.presentation.backgroundColor,
    pixelArt: CLIENT_CONFIG.presentation.pixelArt,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    },
    scene: [GameScene],
    title: CLIENT_CONFIG.branding.displayTitle,
    render: {
      antialias: false,
      pixelArt: CLIENT_CONFIG.presentation.pixelArt,
    },
  });
}
