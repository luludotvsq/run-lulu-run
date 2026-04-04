import Phaser from "phaser";
import { CANVAS_HEIGHT, CANVAS_WIDTH, GAME_CONFIG, TILE_SIZE } from "@shared/config.js";
import { getMapById } from "@shared/maps.js";
import type { ActorBase, Direction, MapData, MatchState, Role } from "@shared/types.js";
import { canSeePoint, getVisionRadius } from "@shared/vision.js";
import { GAME_ASSET_MANIFEST } from "./assets/manifest.js";
import { CLIENT_CONFIG } from "./clientConfig.js";
import { gameInput } from "./gameInput.js";
import { gameRuntime } from "./runtime.js";

const KEY_TO_DIRECTION: Record<string, Direction | undefined> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
};

type ActorKind = ActorBase["kind"];

interface ActorVisual {
  sprite: Phaser.GameObjects.Image;
  lastX: number;
  lastY: number;
  animElapsedMs: number;
  lastFacing: Direction;
  wasMoving: boolean;
}

type StaticVisual = Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

function directionFrames(source: Record<Direction, readonly string[]>) {
  return source;
}

const CHARACTER_FRAME_URLS = {
  lulu: directionFrames(GAME_ASSET_MANIFEST.characters.lulu),
  springtrap: directionFrames(GAME_ASSET_MANIFEST.characters.springtrap),
  npc: directionFrames(GAME_ASSET_MANIFEST.characters.npc),
} as const;

const STATIC_TEXTURE_KEYS = {
  floorBase: "floor-base",
  floorAlt: "floor-alt",
  wallHorizontal: "wall-horizontal",
  wallVertical: "wall-vertical",
  rock: "obstacle-rock",
  gateClosed: "gate-closed",
  gateOpen: "gate-open",
  palletUpright: "pallet-upright",
  palletDown: "pallet-down",
} as const;

export class GameScene extends Phaser.Scene {
  private readonly managedTextureKeys = new Set<string>();
  private readonly staticVisuals: StaticVisual[] = [];
  private readonly palletSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly actorSprites = new Map<string, ActorVisual>();

  private graphics!: Phaser.GameObjects.Graphics;
  private fogGraphics!: Phaser.GameObjects.Graphics;
  private uiGraphics!: Phaser.GameObjects.Graphics;
  private currentMapId: string | null = null;
  private gateSprite: Phaser.GameObjects.Image | null = null;
  private readonly handleWindowBlur = () => {
    gameInput.reset();
  };

  public constructor() {
    super("game");
  }

  public preload(): void {
    this.loadDirectionalSet("lulu", CHARACTER_FRAME_URLS.lulu);
    this.loadDirectionalSet("springtrap", CHARACTER_FRAME_URLS.springtrap);
    this.loadDirectionalSet("npc", CHARACTER_FRAME_URLS.npc);

    this.queueImage(STATIC_TEXTURE_KEYS.floorBase, GAME_ASSET_MANIFEST.environment.floor.base);
    this.queueImage(STATIC_TEXTURE_KEYS.floorAlt, GAME_ASSET_MANIFEST.environment.floor.alt);
    this.queueImage(STATIC_TEXTURE_KEYS.wallHorizontal, GAME_ASSET_MANIFEST.environment.obstacles.wallHorizontal);
    this.queueImage(STATIC_TEXTURE_KEYS.wallVertical, GAME_ASSET_MANIFEST.environment.obstacles.wallVertical);
    this.queueImage(STATIC_TEXTURE_KEYS.rock, GAME_ASSET_MANIFEST.environment.obstacles.rock);
    this.queueImage(STATIC_TEXTURE_KEYS.gateClosed, GAME_ASSET_MANIFEST.environment.interactables.gateClosed);
    this.queueImage(STATIC_TEXTURE_KEYS.gateOpen, GAME_ASSET_MANIFEST.environment.interactables.gateOpen);
    this.queueImage(STATIC_TEXTURE_KEYS.palletUpright, GAME_ASSET_MANIFEST.environment.interactables.palletUpright);
    this.queueImage(STATIC_TEXTURE_KEYS.palletDown, GAME_ASSET_MANIFEST.environment.interactables.palletDown);
  }

  public create(): void {
    this.graphics = this.add.graphics();
    this.fogGraphics = this.add.graphics();
    this.uiGraphics = this.add.graphics().setScrollFactor(0);
    this.cameras.main.roundPixels = true;
    this.applyTextureFilters();

    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      const direction = KEY_TO_DIRECTION[event.code];
      if (direction) {
        gameInput.setKeyboardDirectionActive(direction, true);
      }

      if (event.code === "Space" && !event.repeat) {
        gameInput.pressAction("keyboard");
      }

      if (event.code === "KeyF") {
        if (this.scale.isFullscreen) {
          this.scale.stopFullscreen();
        } else {
          void this.scale.startFullscreen();
        }
      }
    });

    this.input.keyboard?.on("keyup", (event: KeyboardEvent) => {
      const direction = KEY_TO_DIRECTION[event.code];
      if (direction) {
        gameInput.setKeyboardDirectionActive(direction, false);
      }

      if (event.code === "Space") {
        gameInput.releaseAction("keyboard");
      }
    });

    window.addEventListener("blur", this.handleWindowBlur);
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      window.removeEventListener("blur", this.handleWindowBlur);
      gameInput.reset();
    });
  }

  public update(_time: number, delta: number): void {
    const session = gameRuntime.getSession();
    if (!session) {
      this.renderBackdrop();
      return;
    }

    session.setMoveIntent(gameInput.getMoveIntent());
    session.setActionHeld(gameInput.isActionHeld());
    if (gameInput.consumeQueuedAction()) {
      session.queueAction();
    }
    session.update(delta);

    const state = session.getState();
    if (!state) {
      this.renderBackdrop();
      return;
    }

    this.renderMatch(state, session.getLocalRole(), delta);
  }

  private queueImage(key: string, url: string): void {
    this.load.image(key, url);
    this.managedTextureKeys.add(key);
  }

  private loadDirectionalSet(prefix: ActorKind, source: Record<Direction, readonly string[]>): void {
    for (const direction of Object.keys(source) as Direction[]) {
      source[direction].forEach((url, frameIndex) => {
        this.queueImage(`${prefix}-${direction}-${frameIndex}`, url);
      });
    }
  }

  private applyTextureFilters(): void {
    for (const key of this.managedTextureKeys) {
      if (this.textures.exists(key)) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }
  }

  private renderBackdrop(): void {
    const camera = this.cameras.main;
    camera.setZoom(1);
    camera.setBounds(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    camera.scrollX = 0;
    camera.scrollY = 0;
    this.setWorldVisualsVisible(false);

    this.graphics.clear();
    this.fogGraphics.clear();
    this.uiGraphics.clear();
    this.graphics.fillStyle(0x070c12, 1);
    this.graphics.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  private renderMatch(state: MatchState, localRole: Role, deltaMs: number): void {
    const map = getMapById(state.mapId);
    const worldWidth = map.widthTiles * TILE_SIZE;
    const worldHeight = map.heightTiles * TILE_SIZE;
    const camera = this.cameras.main;
    camera.setZoom(CLIENT_CONFIG.camera.matchZoom);
    camera.setBounds(0, 0, worldWidth, worldHeight);

    const focus = localRole === "lulu" ? state.lulu : state.springtrap;
    const viewer = { x: focus.x, y: focus.y };
    const visionRadius = getVisionRadius(localRole);
    camera.scrollX = Phaser.Math.Clamp(
      focus.x - camera.width * 0.5 / camera.zoom,
      0,
      Math.max(0, worldWidth - camera.width / camera.zoom),
    );
    camera.scrollY = Phaser.Math.Clamp(
      focus.y - camera.height * 0.5 / camera.zoom,
      0,
      Math.max(0, worldHeight - camera.height / camera.zoom),
    );

    this.syncMapVisuals(map);
    this.setWorldVisualsVisible(true);
    this.syncGateVisual(map, state.exitOpen);
    this.syncPalletVisuals(state);
    this.syncActorVisuals(state, map, viewer, visionRadius, localRole, deltaMs);

    this.graphics.clear();
    this.uiGraphics.clear();
    this.drawLedges(map);
    this.drawGenerators(state, map, viewer, visionRadius);
    this.drawHealingProgress(state);

    for (const npc of state.npcs) {
      if (!canSeePoint(viewer, npc, visionRadius, map.obstacles) || npc.health !== "dead") {
        continue;
      }
      this.drawNpcCorpse(npc);
    }

    for (const springtrap of state.springtraps) {
      if (localRole !== "springtrap" && !canSeePoint(viewer, springtrap, visionRadius, map.obstacles)) {
        continue;
      }

      this.drawAttackIndicator(springtrap);
    }

    this.drawRepairArrow(state, localRole);
    this.drawFog(map, viewer, visionRadius);
  }

  private syncMapVisuals(map: MapData): void {
    if (this.currentMapId === map.id) {
      return;
    }

    this.destroyMapVisuals();
    this.currentMapId = map.id;

    const cellSize = CLIENT_CONFIG.worldVisuals.cellSizePx;

    for (let tileY = 0; tileY < map.heightTiles; tileY += 1) {
      for (let tileX = 0; tileX < map.widthTiles; tileX += 1) {
        const textureKey = (tileX + tileY) % 3 === 0 ? STATIC_TEXTURE_KEYS.floorAlt : STATIC_TEXTURE_KEYS.floorBase;
        const centerX = tileX * TILE_SIZE + TILE_SIZE * 0.5;
        const centerY = tileY * TILE_SIZE + TILE_SIZE * 0.5;
        const floorSprite = this.add.image(centerX, centerY, textureKey).setDepth(-200);
        floorSprite.setDisplaySize(cellSize, cellSize);
        this.staticVisuals.push(floorSprite);
      }
    }

    for (const obstacle of map.obstacles) {
      const tileColumns = Math.max(1, Math.round(obstacle.w / TILE_SIZE));
      const tileRows = Math.max(1, Math.round(obstacle.h / TILE_SIZE));
      const textureKey = this.getObstacleTextureKey(obstacle.kind, obstacle.w, obstacle.h);
      const fallbackColor = obstacle.kind === "wall" ? map.palette.wall : map.palette.rock;

      for (let row = 0; row < tileRows; row += 1) {
        for (let column = 0; column < tileColumns; column += 1) {
          const centerX = obstacle.x + column * TILE_SIZE + TILE_SIZE * 0.5;
          const centerY = obstacle.y + row * TILE_SIZE + TILE_SIZE * 0.5;
          const tileSprite = this.createStaticImage(
            textureKey,
            centerX,
            centerY,
            cellSize,
            cellSize,
            centerY,
            fallbackColor,
          );
          this.staticVisuals.push(tileSprite);
        }
      }
    }

    for (const pallet of map.pallets) {
      const palletSprite = this.add
        .image(pallet.x, pallet.y, STATIC_TEXTURE_KEYS.palletUpright)
        .setDisplaySize(cellSize, cellSize)
        .setAngle(pallet.orientation === "horizontal" ? 90 : 0)
        .setDepth(pallet.y + cellSize * 0.5);
      this.palletSprites.set(pallet.id, palletSprite);
    }

    const gateCenterX = map.gate.x + map.gate.w * 0.5;
    const gateCenterY = map.gate.y + map.gate.h * 0.5;
    const gateDisplaySize = Math.max(CLIENT_CONFIG.worldVisuals.gateSizePx, map.gate.w, map.gate.h);
    this.gateSprite = this.add
      .image(gateCenterX, gateCenterY, STATIC_TEXTURE_KEYS.gateClosed)
      .setDisplaySize(gateDisplaySize, gateDisplaySize)
      .setAngle(map.gate.side === "left" || map.gate.side === "right" ? 90 : 0)
      .setDepth(map.gate.y + map.gate.h + 8);
  }

  private destroyMapVisuals(): void {
    for (const visual of this.staticVisuals) {
      visual.destroy();
    }
    this.staticVisuals.length = 0;

    this.gateSprite?.destroy();
    this.gateSprite = null;

    for (const palletSprite of this.palletSprites.values()) {
      palletSprite.destroy();
    }
    this.palletSprites.clear();

    for (const actorVisual of this.actorSprites.values()) {
      actorVisual.sprite.destroy();
    }
    this.actorSprites.clear();
  }

  private setWorldVisualsVisible(visible: boolean): void {
    for (const visual of this.staticVisuals) {
      visual.setVisible(visible);
    }
    this.gateSprite?.setVisible(visible);
    for (const palletSprite of this.palletSprites.values()) {
      palletSprite.setVisible(visible);
    }
    if (!visible) {
      for (const actorVisual of this.actorSprites.values()) {
        actorVisual.sprite.setVisible(false);
      }
    }
  }

  private createStaticImage(
    textureKey: string,
    x: number,
    y: number,
    width: number,
    height: number,
    depth: number,
    fallbackColor: number,
  ): StaticVisual {
    if (this.textures.exists(textureKey)) {
      return this.add.image(x, y, textureKey).setDisplaySize(width, height).setDepth(depth);
    }

    return this.add.rectangle(x, y, width, height, fallbackColor).setDepth(depth);
  }

  private getObstacleTextureKey(kind: MapData["obstacles"][number]["kind"], width: number, height: number): string {
    if (kind === "rock" || kind === "car") {
      return STATIC_TEXTURE_KEYS.rock;
    }
    return width >= height ? STATIC_TEXTURE_KEYS.wallHorizontal : STATIC_TEXTURE_KEYS.wallVertical;
  }

  private syncGateVisual(map: MapData, exitOpen: boolean): void {
    if (!this.gateSprite) {
      return;
    }

    this.gateSprite.setTexture(exitOpen ? STATIC_TEXTURE_KEYS.gateOpen : STATIC_TEXTURE_KEYS.gateClosed);
    this.gateSprite.setPosition(map.gate.x + map.gate.w * 0.5, map.gate.y + map.gate.h * 0.5);
  }

  private syncPalletVisuals(state: MatchState): void {
    for (const pallet of state.pallets) {
      const sprite = this.palletSprites.get(pallet.id);
      if (!sprite) {
        continue;
      }

      if (pallet.state === "respawning") {
        sprite.setVisible(false);
        continue;
      }

      const upright = pallet.state === "upright";
      sprite.setTexture(upright ? STATIC_TEXTURE_KEYS.palletUpright : STATIC_TEXTURE_KEYS.palletDown);
      sprite.setAlpha(1);
      sprite.setVisible(true);
    }
  }

  private syncActorVisuals(
    state: MatchState,
    map: MapData,
    viewer: { x: number; y: number },
    visionRadius: number,
    localRole: Role,
    deltaMs: number,
  ): void {
    const liveIds = new Set<string>();

    const syncActor = (actor: ActorBase, visible: boolean) => {
      liveIds.add(actor.id);
      let visual = this.actorSprites.get(actor.id);
      if (!visual) {
        visual = {
          sprite: this.add.image(actor.x, actor.y, this.getActorTextureKey(actor.kind, actor.facing, 0)),
          lastX: actor.x,
          lastY: actor.y,
          animElapsedMs: 0,
          lastFacing: actor.facing,
          wasMoving: false,
        };
        this.actorSprites.set(actor.id, visual);
      }

      const distanceMoved = Math.hypot(actor.x - visual.lastX, actor.y - visual.lastY);
      const moving = distanceMoved > 0.35 || actor.lock.kind === "vault";
      if (!moving) {
        visual.animElapsedMs = 0;
      } else if (!visual.wasMoving || visual.lastFacing !== actor.facing) {
        visual.animElapsedMs = 0;
      } else {
        visual.animElapsedMs += deltaMs;
      }

      const frameIndex = moving
        ? Math.floor(visual.animElapsedMs / CLIENT_CONFIG.worldVisuals.walkFrameMs) % 3
        : 0;
      const textureKey = this.getActorTextureKey(actor.kind, actor.facing, frameIndex);
      if (this.textures.exists(textureKey)) {
        visual.sprite.setTexture(textureKey);
      }
      const actorDisplaySize = this.getActorDisplaySize();
      visual.sprite.setDisplaySize(actorDisplaySize, actorDisplaySize);
      visual.sprite.setPosition(actor.x, actor.y);
      visual.sprite.setDepth(actor.y + actorDisplaySize * 0.18);
      visual.sprite.setVisible(visible);
      this.applyActorTint(visual.sprite, actor, state);
      visual.lastFacing = actor.facing;
      visual.wasMoving = moving;
      visual.lastX = actor.x;
      visual.lastY = actor.y;
    };

    syncActor(state.lulu, localRole === "lulu" || canSeePoint(viewer, state.lulu, visionRadius, map.obstacles));

    for (const springtrap of state.springtraps) {
      syncActor(
        springtrap,
        localRole === "springtrap" || canSeePoint(viewer, springtrap, visionRadius, map.obstacles),
      );
    }

    for (const npc of state.npcs) {
      const visual = this.actorSprites.get(npc.id);
      if (npc.health === "dead") {
        if (visual) {
          visual.sprite.setVisible(false);
        }
        liveIds.add(npc.id);
        continue;
      }

      syncActor(npc, canSeePoint(viewer, npc, visionRadius, map.obstacles));
    }

    for (const [id, visual] of this.actorSprites.entries()) {
      if (liveIds.has(id)) {
        continue;
      }

      visual.sprite.destroy();
      this.actorSprites.delete(id);
    }
  }

  private getActorTextureKey(kind: ActorKind, facing: Direction, frameIndex: number): string {
    return `${kind}-${facing}-${frameIndex}`;
  }

  private getActorDisplaySize(): number {
    return CLIENT_CONFIG.worldVisuals.cellSizePx;
  }

  private applyActorTint(sprite: Phaser.GameObjects.Image, actor: ActorBase, state: MatchState): void {
    sprite.clearTint();

    if (actor.kind === "lulu" && state.lulu.health === "injured") {
      sprite.setTint(0xffd4ec);
      return;
    }

    if (actor.kind === "npc") {
      const npc = state.npcs.find((entry) => entry.id === actor.id);
      if (npc?.health === "injured") {
        sprite.setTint(0xffd6b0);
      }
    }
  }

  private drawLedges(map: MapData): void {
    this.graphics.lineStyle(4, map.palette.ledge, 0.92);
    for (const ledge of map.ledges) {
      if (ledge.orientation === "horizontal") {
        this.graphics.lineBetween(ledge.x, ledge.y + ledge.h * 0.5, ledge.x + ledge.w, ledge.y + ledge.h * 0.5);
      } else {
        this.graphics.lineBetween(ledge.x + ledge.w * 0.5, ledge.y, ledge.x + ledge.w * 0.5, ledge.y + ledge.h);
      }
    }
  }

  private drawGenerators(
    state: MatchState,
    map: MapData,
    viewer: { x: number; y: number },
    visionRadius: number,
  ): void {
    for (const generator of state.generators) {
      if (!canSeePoint(viewer, generator, visionRadius, map.obstacles)) {
        continue;
      }

      const x = generator.x - 14;
      const y = generator.y - 14;
      this.graphics.fillStyle(generator.completed ? 0x68d188 : 0x595e6e, 0.95);
      this.graphics.fillRoundedRect(x, y, 28, 28, 5);
      this.graphics.lineStyle(2, 0x0b0f14, 0.28);
      this.graphics.strokeRoundedRect(x, y, 28, 28, 5);

      this.graphics.fillStyle(0x12161d, 0.9);
      this.graphics.fillRect(x - 2, y + 30, 32, 5);
      this.graphics.fillStyle(generator.completed ? 0x7bf1a0 : 0xffcc5c, 1);
      this.graphics.fillRect(x - 1, y + 31, 30 * generator.progress, 3);
    }
  }

  private drawHealingProgress(state: MatchState): void {
    if (state.lulu.lock.kind !== "healing") {
      return;
    }

    const progress = 1 - state.lulu.lock.remainingMs / Math.max(1, state.lulu.lock.totalMs);
    const width = 32;
    const height = 5;
    const x = state.lulu.x - width * 0.5;
    const y = state.lulu.y - CLIENT_CONFIG.worldVisuals.cellSizePx * 0.8;

    this.graphics.fillStyle(0x12161d, 0.9);
    this.graphics.fillRect(x - 1, y - 1, width + 2, height + 2);
    this.graphics.fillStyle(0x7bf1a0, 1);
    this.graphics.fillRect(x, y, width * progress, height);
  }

  private drawNpcCorpse(actor: { x: number; y: number }): void {
    const x = actor.x - 8;
    const y = actor.y - 4;
    this.graphics.fillStyle(0x5e4f40, 0.9);
    this.graphics.fillRoundedRect(x, y, 16, 8, 3);
    this.graphics.lineStyle(2, 0x20160f, 0.65);
    this.graphics.lineBetween(x + 1, y + 1, x + 15, y + 7);
    this.graphics.lineBetween(x + 15, y + 1, x + 1, y + 7);
  }

  private drawAttackIndicator(springtrap: MatchState["springtrap"]): void {
    if (springtrap.lock.kind !== "attackWindup" && springtrap.lock.kind !== "attackActive") {
      return;
    }

    const halfWidth = GAME_CONFIG.attack.width * 0.5;
    const halfKillerW = springtrap.collider.w * 0.5;
    const halfKillerH = springtrap.collider.h * 0.5;

    let x = 0;
    let y = 0;
    let width = 0;
    let height = 0;

    if (springtrap.facing === "left") {
      x = springtrap.x - halfKillerW - GAME_CONFIG.attack.range;
      y = springtrap.y - halfWidth;
      width = GAME_CONFIG.attack.range;
      height = GAME_CONFIG.attack.width;
    } else if (springtrap.facing === "right") {
      x = springtrap.x + halfKillerW;
      y = springtrap.y - halfWidth;
      width = GAME_CONFIG.attack.range;
      height = GAME_CONFIG.attack.width;
    } else if (springtrap.facing === "up") {
      x = springtrap.x - halfWidth;
      y = springtrap.y - halfKillerH - GAME_CONFIG.attack.range;
      width = GAME_CONFIG.attack.width;
      height = GAME_CONFIG.attack.range;
    } else {
      x = springtrap.x - halfWidth;
      y = springtrap.y + halfKillerH;
      width = GAME_CONFIG.attack.width;
      height = GAME_CONFIG.attack.range;
    }

    this.graphics.fillStyle(springtrap.lock.kind === "attackActive" ? 0xff6161 : 0xffc857, 0.32);
    this.graphics.fillRect(x, y, width, height);
  }

  private drawRepairArrow(state: MatchState, localRole: Role): void {
    if (state.mode !== "multiplayer" || localRole !== "springtrap" || !state.luluRepairingGeneratorId) {
      return;
    }

    const generator = state.generators.find((entry) => entry.id === state.luluRepairingGeneratorId);
    if (!generator) {
      return;
    }

    const anchorX = CANVAS_WIDTH - 84;
    const anchorY = 94;
    const angle = Math.atan2(generator.y - state.springtrap.y, generator.x - state.springtrap.x);
    const tailLength = 18;
    const tipLength = 24;
    const wingLength = 9;
    const baseX = anchorX + Math.cos(angle) * tailLength;
    const baseY = anchorY + Math.sin(angle) * tailLength;
    const tipX = anchorX + Math.cos(angle) * (tailLength + tipLength);
    const tipY = anchorY + Math.sin(angle) * (tailLength + tipLength);
    const leftX = baseX + Math.cos(angle + Math.PI * 0.66) * wingLength;
    const leftY = baseY + Math.sin(angle + Math.PI * 0.66) * wingLength;
    const rightX = baseX + Math.cos(angle - Math.PI * 0.66) * wingLength;
    const rightY = baseY + Math.sin(angle - Math.PI * 0.66) * wingLength;

    this.uiGraphics.lineStyle(4, 0x3f2308, 0.9);
    this.uiGraphics.lineBetween(anchorX, anchorY, baseX, baseY);
    this.uiGraphics.lineStyle(2, 0xffcc5c, 1);
    this.uiGraphics.lineBetween(anchorX, anchorY, baseX, baseY);

    this.uiGraphics.fillStyle(0xffcc5c, 1);
    this.uiGraphics.fillTriangle(tipX, tipY, leftX, leftY, rightX, rightY);
    this.uiGraphics.fillStyle(0x3f2308, 0.35);
    this.uiGraphics.fillCircle(anchorX, anchorY, 6);
  }

  private drawFog(map: MapData, viewer: { x: number; y: number }, visionRadius: number): void {
    this.fogGraphics.clear();
    this.fogGraphics.fillStyle(0x02060a, 0.68);

    for (let tileY = 0; tileY < map.heightTiles; tileY += 1) {
      for (let tileX = 0; tileX < map.widthTiles; tileX += 1) {
        const center = {
          x: tileX * TILE_SIZE + TILE_SIZE * 0.5,
          y: tileY * TILE_SIZE + TILE_SIZE * 0.5,
        };

        if (!canSeePoint(viewer, center, visionRadius, map.obstacles)) {
          this.fogGraphics.fillRect(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }
}
