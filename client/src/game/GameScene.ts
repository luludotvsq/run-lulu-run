import Phaser from "phaser";
import { CANVAS_HEIGHT, CANVAS_WIDTH, GAME_CONFIG, TILE_SIZE } from "@shared/config.js";
import { getMapById } from "@shared/maps.js";
import type { ActorBase, ChestReward, Direction, MapData, MatchState, Role } from "@shared/types.js";
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
  itemIcon: Phaser.GameObjects.Image | null;
  lastX: number;
  lastY: number;
  animElapsedMs: number;
  moveGraceRemainingMs: number;
  lastFacing: Direction;
}

interface ChestVisual {
  chest: Phaser.GameObjects.Image;
  reward: Phaser.GameObjects.Image;
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
  chestClosed: "chest-closed",
  chestOpen: "chest-open",
  palletUpright: "pallet-upright",
  palletDown: "pallet-down",
  pickupFlashlight: "pickup-flashlight",
  pickupWrench: "pickup-wrench",
  pickupHeartCharm: "pickup-heart-charm",
  pickupArmor: "pickup-armor",
  effectCharm: "effect-charm",
  effectFlashlight: "effect-flashlight",
} as const;

export class GameScene extends Phaser.Scene {
  private readonly managedTextureKeys = new Set<string>();
  private readonly staticVisuals: StaticVisual[] = [];
  private readonly palletSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly actorSprites = new Map<string, ActorVisual>();
  private readonly chestVisuals = new Map<string, ChestVisual>();
  private readonly projectileSprites = new Map<string, Phaser.GameObjects.Image>();

  private graphics!: Phaser.GameObjects.Graphics;
  private fogGraphics!: Phaser.GameObjects.Graphics;
  private worldOverlayGraphics!: Phaser.GameObjects.Graphics;
  private uiGraphics!: Phaser.GameObjects.Graphics;
  private currentMapId: string | null = null;
  private gateSprite: Phaser.GameObjects.Image | null = null;
  private generatedFloorTextureKey: string | null = null;
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
    this.queueImage(STATIC_TEXTURE_KEYS.chestClosed, GAME_ASSET_MANIFEST.environment.interactables.chestClosed);
    this.queueImage(STATIC_TEXTURE_KEYS.chestOpen, GAME_ASSET_MANIFEST.environment.interactables.chestOpen);
    this.queueImage(STATIC_TEXTURE_KEYS.palletUpright, GAME_ASSET_MANIFEST.environment.interactables.palletUpright);
    this.queueImage(STATIC_TEXTURE_KEYS.palletDown, GAME_ASSET_MANIFEST.environment.interactables.palletDown);
    this.queueImage(STATIC_TEXTURE_KEYS.pickupFlashlight, GAME_ASSET_MANIFEST.environment.pickups.flashlight);
    this.queueImage(STATIC_TEXTURE_KEYS.pickupWrench, GAME_ASSET_MANIFEST.environment.pickups.wrench);
    this.queueImage(STATIC_TEXTURE_KEYS.pickupHeartCharm, GAME_ASSET_MANIFEST.environment.pickups.heartCharm);
    this.queueImage(STATIC_TEXTURE_KEYS.pickupArmor, GAME_ASSET_MANIFEST.environment.pickups.armor);
    this.queueImage(STATIC_TEXTURE_KEYS.effectCharm, GAME_ASSET_MANIFEST.ui.effects.charm);
    this.queueImage(STATIC_TEXTURE_KEYS.effectFlashlight, GAME_ASSET_MANIFEST.ui.effects.flashlight);
  }

  public create(): void {
    this.graphics = this.add.graphics();
    this.fogGraphics = this.add.graphics();
    this.worldOverlayGraphics = this.add.graphics().setDepth(19_500);
    this.uiGraphics = this.add.graphics().setScrollFactor(0).setDepth(20_000);
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
    this.worldOverlayGraphics.clear();
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
    this.syncChestVisuals(state, map, viewer, visionRadius);
    this.syncProjectileVisuals(state, map, viewer, visionRadius);
    this.syncActorVisuals(state, map, viewer, visionRadius, localRole, deltaMs);

    this.graphics.clear();
    this.worldOverlayGraphics.clear();
    this.uiGraphics.clear();
    this.drawLedges(map);
    this.drawGenerators(state, map, viewer, visionRadius);
    this.drawHealingProgress(state);
    this.drawChestOpeningProgress(state, map, viewer, visionRadius);

    for (const springtrap of state.springtraps) {
      if (localRole !== "springtrap" && !canSeePoint(viewer, springtrap, visionRadius, map.obstacles)) {
        continue;
      }

      this.drawAttackIndicator(springtrap);
    }

    this.drawBoostEffects(state, map, viewer, visionRadius, focus.id, localRole);
    this.drawTrackerArrow(state, localRole);
    this.drawFog(map, viewer, visionRadius);
    this.drawFlashOverlay(state, localRole);
  }

  private syncMapVisuals(map: MapData): void {
    if (this.currentMapId === map.id) {
      return;
    }

    this.destroyMapVisuals();
    this.currentMapId = map.id;

    const cellSize = CLIENT_CONFIG.worldVisuals.cellSizePx;
    const worldWidth = map.widthTiles * TILE_SIZE;
    const worldHeight = map.heightTiles * TILE_SIZE;
    const floorTextureKey = this.buildFloorTexture(map);
    const floorSprite = this.add.image(0, 0, floorTextureKey).setOrigin(0, 0).setDepth(-200);
    floorSprite.setDisplaySize(worldWidth, worldHeight);
    this.staticVisuals.push(floorSprite);

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
    if (this.generatedFloorTextureKey && this.textures.exists(this.generatedFloorTextureKey)) {
      this.textures.remove(this.generatedFloorTextureKey);
    }
    this.generatedFloorTextureKey = null;

    this.gateSprite?.destroy();
    this.gateSprite = null;

    for (const palletSprite of this.palletSprites.values()) {
      palletSprite.destroy();
    }
    this.palletSprites.clear();

    for (const chestVisual of this.chestVisuals.values()) {
      chestVisual.chest.destroy();
      chestVisual.reward.destroy();
    }
    this.chestVisuals.clear();

    for (const projectileSprite of this.projectileSprites.values()) {
      projectileSprite.destroy();
    }
    this.projectileSprites.clear();

    for (const actorVisual of this.actorSprites.values()) {
      actorVisual.itemIcon?.destroy();
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
    for (const chestVisual of this.chestVisuals.values()) {
      chestVisual.chest.setVisible(visible);
      chestVisual.reward.setVisible(visible && chestVisual.reward.visible);
    }
    for (const projectileSprite of this.projectileSprites.values()) {
      projectileSprite.setVisible(visible && projectileSprite.visible);
    }
    if (!visible) {
      for (const actorVisual of this.actorSprites.values()) {
        actorVisual.sprite.setVisible(false);
        actorVisual.itemIcon?.setVisible(false);
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

  private buildFloorTexture(map: MapData): string {
    const textureKey = `floor-layer-${map.id}`;
    const worldWidth = map.widthTiles * TILE_SIZE;
    const worldHeight = map.heightTiles * TILE_SIZE;
    if (this.textures.exists(textureKey)) {
      this.textures.remove(textureKey);
    }

    const texture = this.textures.createCanvas(textureKey, worldWidth, worldHeight);
    if (!texture) {
      throw new Error(`Could not create floor texture for map ${map.id}.`);
    }
    const context = texture.getContext();
    context.imageSmoothingEnabled = false;

    for (let tileY = 0; tileY < map.heightTiles; tileY += 1) {
      for (let tileX = 0; tileX < map.widthTiles; tileX += 1) {
        const sourceKey = (tileX + tileY) % 3 === 0 ? STATIC_TEXTURE_KEYS.floorAlt : STATIC_TEXTURE_KEYS.floorBase;
        const x = tileX * TILE_SIZE;
        const y = tileY * TILE_SIZE;
        this.drawFloorTile(context, sourceKey, x, y, TILE_SIZE, sourceKey === STATIC_TEXTURE_KEYS.floorAlt ? map.palette.floorAlt : map.palette.floor);
      }
    }

    texture.refresh();
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.generatedFloorTextureKey = textureKey;
    return textureKey;
  }

  private drawFloorTile(
    context: CanvasRenderingContext2D,
    textureKey: string,
    x: number,
    y: number,
    size: number,
    fallbackColor: number,
  ): void {
    if (this.textures.exists(textureKey)) {
      const sourceImage = this.textures.get(textureKey).getSourceImage() as CanvasImageSource | null;
      if (sourceImage) {
        context.drawImage(sourceImage, x, y, size, size);
        return;
      }
    }

    context.fillStyle = `#${fallbackColor.toString(16).padStart(6, "0")}`;
    context.fillRect(x, y, size, size);
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

  private syncChestVisuals(
    state: MatchState,
    map: MapData,
    viewer: { x: number; y: number },
    visionRadius: number,
  ): void {
    const liveIds = new Set<string>();
    for (const chest of state.chests) {
      liveIds.add(chest.id);
      let visual = this.chestVisuals.get(chest.id);
      if (!visual) {
        visual = {
          chest: this.add.image(chest.x, chest.y, STATIC_TEXTURE_KEYS.chestClosed),
          reward: this.add.image(chest.x, chest.y, STATIC_TEXTURE_KEYS.pickupArmor),
        };
        this.chestVisuals.set(chest.id, visual);
      }

      visual.chest.setPosition(chest.x, chest.y);
      visual.chest.setDepth(chest.y + CLIENT_CONFIG.worldVisuals.chestSizePx * 0.18);
      visual.chest.setDisplaySize(CLIENT_CONFIG.worldVisuals.chestSizePx, CLIENT_CONFIG.worldVisuals.chestSizePx);
      visual.chest.setTexture(chest.state === "opened" ? STATIC_TEXTURE_KEYS.chestOpen : STATIC_TEXTURE_KEYS.chestClosed);
      const visible = canSeePoint(viewer, chest, visionRadius, map.obstacles);
      visual.chest.setVisible(visible);

      if (visible && chest.state === "opened" && chest.reward) {
        const progress = 1 - chest.openedRemainingMs / Math.max(1, GAME_CONFIG.treasure.openedDisplayMs);
        visual.reward.setTexture(this.getRewardTextureKey(chest.reward));
        visual.reward.setPosition(chest.x, chest.y - CLIENT_CONFIG.worldVisuals.chestRewardSizePx * (0.65 + progress * 0.6));
        visual.reward.setDisplaySize(
          CLIENT_CONFIG.worldVisuals.chestRewardSizePx,
          CLIENT_CONFIG.worldVisuals.chestRewardSizePx,
        );
        visual.reward.setDepth(visual.chest.depth + 2);
        visual.reward.setAlpha(1 - progress * 0.35);
        visual.reward.setVisible(true);
      } else {
        visual.reward.setVisible(false);
      }
    }

    for (const [id, visual] of this.chestVisuals.entries()) {
      if (liveIds.has(id)) {
        continue;
      }
      visual.chest.destroy();
      visual.reward.destroy();
      this.chestVisuals.delete(id);
    }
  }

  private syncProjectileVisuals(
    state: MatchState,
    map: MapData,
    viewer: { x: number; y: number },
    visionRadius: number,
  ): void {
    const liveIds = new Set<string>();
    for (const projectile of state.projectiles) {
      liveIds.add(projectile.id);
      let sprite = this.projectileSprites.get(projectile.id);
      if (!sprite) {
        sprite = this.add.image(projectile.x, projectile.y, STATIC_TEXTURE_KEYS.pickupWrench);
        this.projectileSprites.set(projectile.id, sprite);
      }

      sprite.setTexture(STATIC_TEXTURE_KEYS.pickupWrench);
      sprite.setPosition(projectile.x, projectile.y);
      sprite.setDisplaySize(CLIENT_CONFIG.worldVisuals.projectileSizePx, CLIENT_CONFIG.worldVisuals.projectileSizePx);
      sprite.setDepth(projectile.y + CLIENT_CONFIG.worldVisuals.projectileSizePx * 0.2);
      sprite.setAngle(projectile.facing === "left" ? 180 : projectile.facing === "up" ? -90 : projectile.facing === "down" ? 90 : 0);
      sprite.setVisible(canSeePoint(viewer, projectile, visionRadius, map.obstacles));
    }

    for (const [id, sprite] of this.projectileSprites.entries()) {
      if (liveIds.has(id)) {
        continue;
      }
      sprite.destroy();
      this.projectileSprites.delete(id);
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
    const hideLuluFromFlashedAyu = localRole === "springtrap" && state.springtrap.flashOverlayRemainingMs > 0;

    const syncActor = (actor: ActorBase, visible: boolean) => {
      liveIds.add(actor.id);
      let visual = this.actorSprites.get(actor.id);
      if (!visual) {
        visual = {
          sprite: this.add.image(actor.x, actor.y, this.getActorTextureKey(actor.kind, actor.facing, 0)),
          itemIcon: null,
          lastX: actor.x,
          lastY: actor.y,
          animElapsedMs: 0,
          moveGraceRemainingMs: 0,
          lastFacing: actor.facing,
        };
        this.actorSprites.set(actor.id, visual);
      }

      const distanceMoved = Math.hypot(actor.x - visual.lastX, actor.y - visual.lastY);
      const movedThisFrame = distanceMoved > 0.08 || actor.lock.kind === "vault" || actor.lock.kind === "charmed";
      const facingChanged = actor.facing !== visual.lastFacing;
      if (movedThisFrame) {
        if (facingChanged && visual.moveGraceRemainingMs <= 0) {
          visual.animElapsedMs = 0;
        }
        visual.animElapsedMs += deltaMs;
        visual.moveGraceRemainingMs = CLIENT_CONFIG.worldVisuals.walkFrameGraceMs;
      } else {
        visual.moveGraceRemainingMs = Math.max(0, visual.moveGraceRemainingMs - deltaMs);
        if (visual.moveGraceRemainingMs > 0) {
          visual.animElapsedMs += deltaMs;
        } else {
          visual.animElapsedMs = 0;
        }
      }

      const moving = movedThisFrame || visual.moveGraceRemainingMs > 0;
      const frameIndex = moving ? Math.floor(visual.animElapsedMs / CLIENT_CONFIG.worldVisuals.walkFrameMs) % 3 : 0;
      const textureKey = this.getActorTextureKey(actor.kind, actor.facing, frameIndex);
      if (this.textures.exists(textureKey)) {
        visual.sprite.setTexture(textureKey);
      }
      const actorDisplaySize = this.getActorDisplaySize();
      const displayY = actor.y + this.getActorVerticalOffset(actor, state);
      visual.sprite.setDisplaySize(actorDisplaySize, actorDisplaySize);
      visual.sprite.setPosition(actor.x, displayY);
      visual.sprite.setDepth(displayY + actorDisplaySize * 0.18);
      visual.sprite.setVisible(visible);
      visual.sprite.setAngle(this.getActorSpinAngle(actor));
      this.applyActorTint(visual.sprite, actor, state);
      visual.sprite.setAlpha(this.getActorAlpha(actor, state));
      const itemTextureKey = this.getActorItemTextureKey(actor, state);
      if (itemTextureKey) {
        if (!visual.itemIcon) {
          visual.itemIcon = this.add.image(actor.x, displayY, itemTextureKey).setOrigin(0.5, 1);
        }
        visual.itemIcon.setTexture(itemTextureKey);
        visual.itemIcon.setDisplaySize(
          CLIENT_CONFIG.worldVisuals.effectIconSizePx,
          CLIENT_CONFIG.worldVisuals.effectIconSizePx,
        );
        visual.itemIcon.setPosition(actor.x, displayY - actorDisplaySize * 0.42);
        visual.itemIcon.setDepth(visual.sprite.depth + actorDisplaySize * 0.3);
        visual.itemIcon.setVisible(visible);
        visual.itemIcon.setAlpha(this.getActorItemAlpha(actor, itemTextureKey, state, visual.sprite.alpha));
      } else if (visual.itemIcon) {
        visual.itemIcon.destroy();
        visual.itemIcon = null;
      }
      visual.lastFacing = actor.facing;
      visual.lastX = actor.x;
      visual.lastY = actor.y;
    };

    syncActor(
      state.lulu,
      !hideLuluFromFlashedAyu && (localRole === "lulu" || canSeePoint(viewer, state.lulu, visionRadius, map.obstacles)),
    );

    for (const springtrap of state.springtraps) {
      syncActor(
        springtrap,
        localRole === "springtrap" || canSeePoint(viewer, springtrap, visionRadius, map.obstacles),
      );
    }

    for (const npc of state.npcs) {
      if (npc.health === "dead" && npc.dissolveRemainingMs <= 0) {
        const visual = this.actorSprites.get(npc.id);
        if (visual) {
          visual.itemIcon?.destroy();
          visual.sprite.destroy();
          this.actorSprites.delete(npc.id);
        }
        continue;
      }

      syncActor(npc, canSeePoint(viewer, npc, visionRadius, map.obstacles));
    }

    for (const [id, visual] of this.actorSprites.entries()) {
      if (liveIds.has(id)) {
        continue;
      }

      visual.sprite.destroy();
      visual.itemIcon?.destroy();
      this.actorSprites.delete(id);
    }
  }

  private getActorTextureKey(kind: ActorKind, facing: Direction, frameIndex: number): string {
    return `${kind}-${facing}-${frameIndex}`;
  }

  private getRewardTextureKey(reward: ChestReward): string {
    if (reward === "flashlight") {
      return STATIC_TEXTURE_KEYS.pickupFlashlight;
    }
    if (reward === "wrench") {
      return STATIC_TEXTURE_KEYS.pickupWrench;
    }
    if (reward === "heart_charm") {
      return STATIC_TEXTURE_KEYS.pickupHeartCharm;
    }
    return STATIC_TEXTURE_KEYS.pickupArmor;
  }

  private getActorDisplaySize(): number {
    return CLIENT_CONFIG.worldVisuals.cellSizePx;
  }

  private getActorItemTextureKey(actor: ActorBase, state: MatchState): string | null {
    if (actor.kind === "lulu") {
      return state.lulu.flashlightRemainingMs > 0 ? STATIC_TEXTURE_KEYS.pickupFlashlight : null;
    }

    if (actor.kind !== "springtrap") {
      return null;
    }

    const springtrap = state.springtraps.find((entry) => entry.id === actor.id);
    if (!springtrap) {
      return null;
    }

    if (
      springtrap.heartCharmRemainingMs > 0 &&
      springtrap.heartCharmRemainingMs >= springtrap.wrenchRemainingMs
    ) {
      return STATIC_TEXTURE_KEYS.pickupHeartCharm;
    }

    if (springtrap.wrenchRemainingMs > 0) {
      return STATIC_TEXTURE_KEYS.pickupWrench;
    }

    return null;
  }

  private getActorItemAlpha(
    actor: ActorBase,
    itemTextureKey: string,
    state: MatchState,
    baseAlpha: number,
  ): number {
    if (actor.kind !== "springtrap" || itemTextureKey !== STATIC_TEXTURE_KEYS.pickupWrench) {
      return baseAlpha;
    }

    const springtrap = state.springtraps.find((entry) => entry.id === actor.id);
    if (!springtrap || springtrap.wrenchCooldownRemainingMs <= 0) {
      return baseAlpha;
    }

    return Math.floor(this.time.now / 140) % 2 === 0 ? baseAlpha : baseAlpha * 0.22;
  }

  private getActorSpinAngle(actor: ActorBase): number {
    if (actor.lock.kind !== "flashBlinded" && actor.lock.kind !== "hitSpin") {
      return 0;
    }

    const progress = Phaser.Math.Clamp(
      (actor.lock.totalMs - actor.lock.remainingMs) / Math.max(1, actor.lock.totalMs),
      0,
      1,
    );
    return progress * (actor.lock.kind === "flashBlinded" ? 720 : 360);
  }

  private getActorAlpha(actor: ActorBase, state: MatchState): number {
    if (actor.kind !== "npc") {
      return 1;
    }

    const npc = state.npcs.find((entry) => entry.id === actor.id);
    if (!npc || npc.health !== "dead") {
      return 1;
    }

    return Phaser.Math.Clamp(
      npc.dissolveRemainingMs / Math.max(1, GAME_CONFIG.multiplayer.npc.dissolveMs),
      0,
      1,
    );
  }

  private getActorVerticalOffset(actor: ActorBase, state: MatchState): number {
    if (actor.kind !== "npc") {
      return 0;
    }

    const npc = state.npcs.find((entry) => entry.id === actor.id);
    if (!npc || npc.health !== "dead") {
      return 0;
    }

    return -(1 - this.getActorAlpha(actor, state)) * 12;
  }

  private applyActorTint(sprite: Phaser.GameObjects.Image, actor: ActorBase, state: MatchState): void {
    sprite.clearTint();

    if (actor.kind === "lulu" && state.lulu.health === "injured") {
      sprite.setTint(0xffd4ec);
      return;
    }

    if (actor.kind === "lulu" && state.lulu.armorCharges > 0) {
      sprite.setTint(0xe8f8ff);
      return;
    }

    if (actor.kind === "npc") {
      const npc = state.npcs.find((entry) => entry.id === actor.id);
      if (npc?.health === "dead") {
        sprite.setTint(0xffe3ff);
        return;
      }
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

  private drawChestOpeningProgress(
    state: MatchState,
    map: MapData,
    viewer: { x: number; y: number },
    visionRadius: number,
  ): void {
    const openings = [
      state.lulu.lock.kind === "openingChest"
        ? {
            chestId: state.lulu.lock.chestId,
            progress: 1 - state.lulu.lock.remainingMs / Math.max(1, state.lulu.lock.totalMs),
          }
        : null,
      ...state.springtraps.map((springtrap) =>
        springtrap.lock.kind === "openingChest"
          ? {
              chestId: springtrap.lock.chestId,
              progress: 1 - springtrap.lock.remainingMs / Math.max(1, springtrap.lock.totalMs),
            }
          : null,
      ),
    ].filter((entry): entry is { chestId: string; progress: number } => Boolean(entry));

    for (const opening of openings) {
      const chest = state.chests.find((entry) => entry.id === opening.chestId);
      if (!chest || !canSeePoint(viewer, chest, visionRadius, map.obstacles)) {
        continue;
      }

      const width = 32;
      const height = 5;
      const x = chest.x - width * 0.5;
      const y = chest.y - CLIENT_CONFIG.worldVisuals.chestSizePx * 0.95;
      const progress = Phaser.Math.Clamp(opening.progress, 0, 1);

      this.worldOverlayGraphics.fillStyle(0x12161d, 0.92);
      this.worldOverlayGraphics.fillRect(x - 1, y - 1, width + 2, height + 2);
      this.worldOverlayGraphics.fillStyle(0xffcc5c, 1);
      this.worldOverlayGraphics.fillRect(x, y, width * progress, height);
    }
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

  private drawBoostEffects(
    state: MatchState,
    map: MapData,
    viewer: { x: number; y: number },
    visionRadius: number,
    viewerActorId: string,
    localRole: Role,
  ): void {
    const hideLuluFromFlashedAyu = localRole === "springtrap" && state.springtrap.flashOverlayRemainingMs > 0;
    const canViewerSeeActorEffect = (actor: ActorBase) => {
      if (actor.id === viewerActorId) {
        return true;
      }

      if (actor.kind === "lulu" && hideLuluFromFlashedAyu) {
        return false;
      }

      return canSeePoint(viewer, actor, visionRadius, map.obstacles);
    };

    if (state.lulu.armorCharges > 0 && canViewerSeeActorEffect(state.lulu)) {
      this.graphics.lineStyle(3, 0xb7ebff, 0.85);
      this.graphics.strokeCircle(state.lulu.x, state.lulu.y, CLIENT_CONFIG.worldVisuals.cellSizePx * 0.62);
    }

    if (
      state.lulu.flashlightRemainingMs > 0 &&
      state.lulu.flashlightCooldownRemainingMs <= 0 &&
      canViewerSeeActorEffect(state.lulu)
    ) {
      const rect = this.getForwardEffectRect(
        state.lulu,
        GAME_CONFIG.boosts.flashlightRangePx,
        GAME_CONFIG.boosts.flashlightWidthPx,
      );
      this.graphics.fillStyle(0xf7f9ff, 0.18);
      this.graphics.fillRect(rect.x, rect.y, rect.w, rect.h);
      this.graphics.lineStyle(2, 0xdde7ff, 0.35);
      this.graphics.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }

    for (const springtrap of state.springtraps) {
      if (springtrap.heartCharmRemainingMs <= 0 || springtrap.heartCharmCooldownRemainingMs > 0) {
        continue;
      }
      if (!canViewerSeeActorEffect(springtrap)) {
        continue;
      }
      const rect = this.getForwardEffectRect(
        springtrap,
        GAME_CONFIG.boosts.heartCharmRangePx,
        GAME_CONFIG.boosts.heartCharmWidthPx,
      );
      this.graphics.fillStyle(0xff72ba, 0.16);
      this.graphics.fillRect(rect.x, rect.y, rect.w, rect.h);
      this.graphics.lineStyle(2, 0xff9dd4, 0.42);
      this.graphics.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }

    if (localRole === "springtrap" && state.springtrap.trackerDisabledRemainingMs > 0) {
      const alpha = Phaser.Math.Clamp(
        state.springtrap.trackerDisabledRemainingMs / Math.max(1, GAME_CONFIG.boosts.trackerDisableMs),
        0.18,
        0.6,
      );
      this.uiGraphics.fillStyle(0x6c87ff, alpha * 0.12);
      this.uiGraphics.fillCircle(CANVAS_WIDTH - 84, 94, 24);
    }
  }

  private getForwardEffectRect(actor: ActorBase, rangePx: number, widthPx: number) {
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

  private drawTrackerArrow(state: MatchState, localRole: Role): void {
    if (state.mode !== "multiplayer" || localRole !== "springtrap") {
      return;
    }

    const trackerDisabled = state.springtrap.trackerDisabledRemainingMs > 0;
    const anchorX = CANVAS_WIDTH - 84;
    const anchorY = 94;
    const angle = trackerDisabled
      ? -Math.PI * 0.5
      : Math.atan2(state.lulu.y - state.springtrap.y, state.lulu.x - state.springtrap.x);
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

    this.uiGraphics.lineStyle(4, trackerDisabled ? 0x231e22 : 0x3f2308, 0.9);
    this.uiGraphics.lineBetween(anchorX, anchorY, baseX, baseY);
    this.uiGraphics.lineStyle(2, trackerDisabled ? 0xd2d7f3 : 0xffcc5c, 1);
    this.uiGraphics.lineBetween(anchorX, anchorY, baseX, baseY);

    this.uiGraphics.fillStyle(trackerDisabled ? 0xd2d7f3 : 0xffcc5c, 1);
    this.uiGraphics.fillTriangle(tipX, tipY, leftX, leftY, rightX, rightY);
    this.uiGraphics.fillStyle(0x3f2308, 0.35);
    this.uiGraphics.fillCircle(anchorX, anchorY, 6);

    if (trackerDisabled) {
      const xRadius = 20;
      const yRadius = 20;
      this.uiGraphics.lineStyle(6, 0xff496b, 0.95);
      this.uiGraphics.lineBetween(anchorX - xRadius, anchorY - yRadius, anchorX + xRadius, anchorY + yRadius);
      this.uiGraphics.lineBetween(anchorX - xRadius, anchorY + yRadius, anchorX + xRadius, anchorY - yRadius);
    }
  }

  private drawFlashOverlay(state: MatchState, localRole: Role): void {
    if (localRole !== "springtrap" || state.springtrap.flashOverlayRemainingMs <= 0) {
      return;
    }

    this.uiGraphics.fillStyle(0xffffff, 1);
    this.uiGraphics.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
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
