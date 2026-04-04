import {
  GAME_CONFIG,
  authoredMapToRuntimeMap,
  cloneAuthoredMap,
  createBlankAuthoredMap,
  getBuiltInMaps,
  getMapById,
  parseAuthoredMapJson,
  runtimeMapToAuthoredMap,
  serializeAuthoredMap,
  validateAuthoredMap,
} from "@shared/index.js";
import type { AuthoredGate, TilePoint } from "@shared/mapFormat.js";
import type { GateData, LedgeOrientation, MapPalette, ObstacleKind } from "@shared/types.js";

const DISPLAY_TILE_SIZE = 20;

type EditorTool = "obstacle" | "ledge" | "pallet" | "generator" | "gate" | "spawn" | "erase";
type SpawnTarget = "lulu" | "springtrap" | "npc-1" | "npc-2" | "npc-3" | "npc-4";
type FeedbackTone = "neutral" | "success" | "error";

interface DragState {
  start: TilePoint;
  current: TilePoint;
}

export interface MapEditorSnapshot {
  mode: "map-editor";
  mapId: string;
  mapName: string;
  tool: EditorTool;
  issues: string[];
  counts: {
    obstacles: number;
    ledges: number;
    pallets: number;
    generators: number;
  };
}

interface EditorElements {
  canvas: HTMLCanvasElement;
  status: HTMLElement;
  feedback: HTMLElement;
  validation: HTMLElement;
  counts: HTMLElement;
  mapId: HTMLInputElement;
  mapName: HTMLInputElement;
  builtIn: HTMLSelectElement;
  obstacleKind: HTMLSelectElement;
  ledgeOrientation: HTMLSelectElement;
  palletOrientation: HTMLSelectElement;
  gateSide: HTMLSelectElement;
  spawnTarget: HTMLSelectElement;
  jsonArea: HTMLTextAreaElement;
  paletteInputs: Record<keyof MapPalette, HTMLInputElement>;
}

function colorHex(value: number): string {
  return `#${Math.max(0, Math.min(0xffffff, Math.round(value))).toString(16).padStart(6, "0")}`;
}

function colorNumber(value: string): number {
  return Number.parseInt(value.replace("#", ""), 16);
}

function isPointEqual(a: TilePoint | null, b: TilePoint): boolean {
  return a !== null && a.x === b.x && a.y === b.y;
}

function tileBounds(start: TilePoint, end: TilePoint) {
  return {
    tileX: Math.min(start.x, end.x),
    tileY: Math.min(start.y, end.y),
    tileW: Math.abs(end.x - start.x) + 1,
    tileH: Math.abs(end.y - start.y) + 1,
  };
}

function gateFootprint(gate: AuthoredGate | null) {
  if (!gate) {
    return null;
  }

  if (gate.side === "left" || gate.side === "right") {
    return {
      tileX: gate.tileX,
      tileY: gate.tileY,
      tileW: 1,
      tileH: 4,
    };
  }

  return {
    tileX: gate.tileX,
    tileY: gate.tileY,
    tileW: 4,
    tileH: 1,
  };
}

function tileInside(tile: TilePoint, rect: { tileX: number; tileY: number; tileW: number; tileH: number }): boolean {
  return (
    tile.x >= rect.tileX &&
    tile.x < rect.tileX + rect.tileW &&
    tile.y >= rect.tileY &&
    tile.y < rect.tileY + rect.tileH
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class MapEditorController {
  private readonly builtInMaps = getBuiltInMaps();
  private readonly handleWindowPointerUp = (event: PointerEvent) => {
    if (!this.dragState) {
      return;
    }

    const tile = this.tileFromPointer(event);
    if (tile) {
      this.dragState.current = tile;
      this.commitDrag();
      return;
    }

    this.dragState = null;
    this.drawCanvas();
  };

  private root: HTMLElement | null = null;
  private elements: EditorElements | null = null;
  private state = this.builtInMaps[0] ? runtimeMapToAuthoredMap(this.builtInMaps[0]) : createBlankAuthoredMap();
  private tool: EditorTool = "obstacle";
  private obstacleKind: ObstacleKind = "wall";
  private ledgeOrientation: LedgeOrientation = "horizontal";
  private palletOrientation: LedgeOrientation = "horizontal";
  private gateSide: GateData["side"] = "right";
  private spawnTarget: SpawnTarget = "lulu";
  private dragState: DragState | null = null;
  private hoverTile: TilePoint | null = null;
  private jsonBuffer = "";
  private builtInSelection = this.builtInMaps[0]?.id ?? "";
  private feedbackMessage =
    "The default QA map is loaded as a template. Build exactly 2 custom maps, export each one, then save both JSON files into maps/custom/. Runtime play stays blocked unless exactly 2 valid custom maps are present there.";
  private feedbackTone: FeedbackTone = "neutral";

  public mount(root: HTMLElement): void {
    this.root = root;
    this.render();
    window.addEventListener("pointerup", this.handleWindowPointerUp);
  }

  public getSnapshot(): MapEditorSnapshot {
    return {
      mode: "map-editor",
      mapId: this.state.id,
      mapName: this.state.name,
      tool: this.tool,
      issues: validateAuthoredMap(this.state),
      counts: {
        obstacles: this.state.obstacles.length,
        ledges: this.state.ledges.length,
        pallets: this.state.pallets.length,
        generators: this.state.generatorSpawns.length,
      },
    };
  }

  private render(): void {
    if (!this.root) {
      return;
    }

    const paletteControls = (Object.keys(this.state.palette) as Array<keyof MapPalette>)
      .map(
        (key) => `
          <label class="editor-color">
            <span>${key}</span>
            <input type="color" data-palette="${key}" value="${colorHex(this.state.palette[key])}" />
          </label>
        `,
      )
      .join("");

    const builtInOptions = this.builtInMaps
      .map((map) => `<option value="${map.id}">${map.name}</option>`)
      .join("");

    this.root.innerHTML = `
        <div class="editor-layout">
          <section class="editor-sidebar">
            <div class="editor-card">
              <div class="editor-card-header">
                <div>
                  <p class="eyebrow">Local Tool</p>
                  <h2>Map Editor</h2>
                </div>
              </div>
              <p class="editor-copy">The default QA map is loaded here as a template. Keep at least ${GAME_CONFIG.generator.totalCount} generator spawns, export authored JSON, and save exactly 2 valid custom-map files into <code>maps/custom/</code>. The main game blocks runtime play until both files are present and valid.</p>
            </div>

            <div class="editor-card">
              <h3>Map Meta</h3>
              <label class="field-label">
                <span>Map Id</span>
                <input id="editor-map-id" class="text-input" value="${this.state.id}" />
              </label>
              <label class="field-label">
                <span>Map Name</span>
                <input id="editor-map-name" class="text-input" value="${this.state.name}" />
              </label>
              <div class="editor-inline">
                <select id="editor-built-in" class="text-input">${builtInOptions}</select>
                <button class="ghost-button" data-action="load-built-in">Load Built-In</button>
              </div>
              <button class="ghost-button" data-action="new-blank">New Blank Map</button>
            </div>

            <div class="editor-card">
              <h3>Tools</h3>
              <div class="editor-tool-grid">
                <button class="tool-button" data-tool="obstacle">Obstacle</button>
                <button class="tool-button" data-tool="ledge">Ledge</button>
                <button class="tool-button" data-tool="pallet">Pallet</button>
                <button class="tool-button" data-tool="generator">Generator</button>
                <button class="tool-button" data-tool="gate">Gate</button>
                <button class="tool-button" data-tool="spawn">Spawn</button>
                <button class="tool-button" data-tool="erase">Erase</button>
              </div>
              <label class="field-label">
                <span>Obstacle Kind</span>
                <select id="editor-obstacle-kind" class="text-input">
                  <option value="wall">Wall</option>
                  <option value="rock">Rock</option>
                </select>
              </label>
              <label class="field-label">
                <span>Ledge Orientation</span>
                <select id="editor-ledge-orientation" class="text-input">
                  <option value="horizontal">Horizontal</option>
                  <option value="vertical">Vertical</option>
                </select>
              </label>
              <label class="field-label">
                <span>Pallet Orientation</span>
                <select id="editor-pallet-orientation" class="text-input">
                  <option value="horizontal">Horizontal</option>
                  <option value="vertical">Vertical</option>
                </select>
              </label>
              <label class="field-label">
                <span>Gate Side</span>
                <select id="editor-gate-side" class="text-input">
                  <option value="right">Right</option>
                  <option value="left">Left</option>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                </select>
              </label>
              <label class="field-label">
                <span>Spawn Target</span>
                <select id="editor-spawn-target" class="text-input">
                  <option value="lulu">LULU</option>
                  <option value="springtrap">Springtrap</option>
                  <option value="npc-1">NPC 1</option>
                  <option value="npc-2">NPC 2</option>
                  <option value="npc-3">NPC 3</option>
                  <option value="npc-4">NPC 4</option>
                </select>
              </label>
            </div>

            <div class="editor-card">
              <h3>Palette</h3>
              <div class="editor-color-grid">${paletteControls}</div>
            </div>

            <div class="editor-card">
              <h3>Validation</h3>
              <p id="editor-feedback" class="editor-feedback"></p>
              <div id="editor-counts" class="editor-counts"></div>
              <ul id="editor-validation" class="editor-validation"></ul>
            </div>
          </section>

          <section class="editor-stage-card">
            <div class="editor-stage-toolbar">
              <p id="editor-status" class="editor-status"></p>
              <div class="editor-stage-actions">
                <button class="ghost-button" data-action="export-json">Export JSON</button>
                <button class="ghost-button" data-action="download-json">Download JSON</button>
                <button class="ghost-button" data-action="import-json">Import JSON</button>
                <button class="ghost-button" data-action="copy-json">Copy JSON</button>
              </div>
            </div>
            <div class="editor-canvas-wrap">
              <canvas
                id="editor-canvas"
                width="${GAME_CONFIG.map.widthTiles * DISPLAY_TILE_SIZE}"
                height="${GAME_CONFIG.map.heightTiles * DISPLAY_TILE_SIZE}"
              ></canvas>
            </div>
            <textarea id="editor-json" class="editor-json" spellcheck="false" placeholder="Authored JSON appears here. Paste authored JSON here to import."></textarea>
          </section>
        </div>
    `;

    const canvas = this.root.querySelector<HTMLCanvasElement>("#editor-canvas");
    const status = this.root.querySelector<HTMLElement>("#editor-status");
    const feedback = this.root.querySelector<HTMLElement>("#editor-feedback");
    const validation = this.root.querySelector<HTMLElement>("#editor-validation");
    const counts = this.root.querySelector<HTMLElement>("#editor-counts");
    const mapId = this.root.querySelector<HTMLInputElement>("#editor-map-id");
    const mapName = this.root.querySelector<HTMLInputElement>("#editor-map-name");
    const builtIn = this.root.querySelector<HTMLSelectElement>("#editor-built-in");
    const obstacleKind = this.root.querySelector<HTMLSelectElement>("#editor-obstacle-kind");
    const ledgeOrientation = this.root.querySelector<HTMLSelectElement>("#editor-ledge-orientation");
    const palletOrientation = this.root.querySelector<HTMLSelectElement>("#editor-pallet-orientation");
    const gateSide = this.root.querySelector<HTMLSelectElement>("#editor-gate-side");
    const spawnTarget = this.root.querySelector<HTMLSelectElement>("#editor-spawn-target");
    const jsonArea = this.root.querySelector<HTMLTextAreaElement>("#editor-json");

    if (
      !canvas ||
      !status ||
      !feedback ||
      !validation ||
      !counts ||
      !mapId ||
      !mapName ||
      !builtIn ||
      !obstacleKind ||
      !ledgeOrientation ||
      !palletOrientation ||
      !gateSide ||
      !spawnTarget ||
      !jsonArea
    ) {
      throw new Error("Map editor UI failed to mount.");
    }

    const paletteInputs = {} as Record<keyof MapPalette, HTMLInputElement>;
    for (const key of Object.keys(this.state.palette) as Array<keyof MapPalette>) {
      const input = this.root.querySelector<HTMLInputElement>(`input[data-palette="${key}"]`);
      if (!input) {
        throw new Error(`Palette input missing for ${key}.`);
      }
      paletteInputs[key] = input;
    }

    this.elements = {
      canvas,
      status,
      feedback,
      validation,
      counts,
      mapId,
      mapName,
      builtIn,
      obstacleKind,
      ledgeOrientation,
      palletOrientation,
      gateSide,
      spawnTarget,
      jsonArea,
      paletteInputs,
    };

    builtIn.value = this.builtInSelection;
    obstacleKind.value = this.obstacleKind;
    ledgeOrientation.value = this.ledgeOrientation;
    palletOrientation.value = this.palletOrientation;
    gateSide.value = this.gateSide;
    spawnTarget.value = this.spawnTarget;
    jsonArea.value = this.jsonBuffer;

    this.bindEvents();
    this.syncInspector();
    this.drawCanvas();
  }

  private bindEvents(): void {
    const { root, elements } = this;
    if (!root || !elements) {
      return;
    }

    root.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((button) => {
      button.addEventListener("click", () => {
        this.tool = button.dataset.tool as EditorTool;
        this.syncInspector();
        this.drawCanvas();
      });
    });

    root.querySelector<HTMLButtonElement>('[data-action="new-blank"]')?.addEventListener("click", () => {
      this.state = createBlankAuthoredMap();
      this.feedback(`Started a fresh blank ${GAME_CONFIG.map.widthTiles}x${GAME_CONFIG.map.heightTiles} map.`, "success");
      this.syncInspector(true);
      this.drawCanvas();
    });

    root.querySelector<HTMLButtonElement>('[data-action="load-built-in"]')?.addEventListener("click", () => {
      const builtInId = elements.builtIn.value;
      this.state = runtimeMapToAuthoredMap(getMapById(builtInId));
      this.feedback(`Loaded built-in map "${this.state.name}".`, "success");
      this.syncInspector(true);
      this.drawCanvas();
    });

    root.querySelector<HTMLButtonElement>('[data-action="export-json"]')?.addEventListener("click", () => {
      const authoredMap = this.prepareAuthoredMap();
      if (!authoredMap) {
        return;
      }

      this.jsonBuffer = serializeAuthoredMap(authoredMap);
      elements.jsonArea.value = this.jsonBuffer;
      this.feedback("Exported pretty authored JSON.", "success");
      this.syncInspector();
    });

    root.querySelector<HTMLButtonElement>('[data-action="download-json"]')?.addEventListener("click", () => {
      const authoredMap = this.prepareAuthoredMap();
      if (!authoredMap) {
        return;
      }

      this.jsonBuffer = serializeAuthoredMap(authoredMap);
      elements.jsonArea.value = this.jsonBuffer;
      this.downloadJson(this.jsonBuffer, `${authoredMap.id}.json`);
      this.feedback(`Downloaded ${authoredMap.id}.json. Save it into maps/custom/ and keep exactly 2 valid runtime map files there.`, "success");
      this.syncInspector();
    });

    root.querySelector<HTMLButtonElement>('[data-action="import-json"]')?.addEventListener("click", () => {
      try {
        this.state = parseAuthoredMapJson(elements.jsonArea.value);
        this.jsonBuffer = elements.jsonArea.value;
        this.feedback(`Imported "${this.state.name}" from authored JSON.`, "success");
        this.syncInspector();
        this.drawCanvas();
      } catch (error) {
        this.feedback(error instanceof Error ? error.message : "Import failed.", "error");
        this.syncInspector();
      }
    });

    root.querySelector<HTMLButtonElement>('[data-action="copy-json"]')?.addEventListener("click", async () => {
      const text = elements.jsonArea.value.trim();
      if (!text) {
        this.feedback("Export JSON first, or paste authored JSON before copying.", "error");
        this.syncInspector();
        return;
      }

      try {
        await navigator.clipboard.writeText(text);
        this.feedback("Copied JSON to the clipboard.", "success");
      } catch {
        this.feedback("Clipboard write failed in this browser.", "error");
      }
      this.syncInspector();
    });

    elements.mapId.addEventListener("input", () => {
      this.state.id = elements.mapId.value.trim();
      this.syncInspector();
    });

    elements.mapName.addEventListener("input", () => {
      this.state.name = elements.mapName.value;
      this.syncInspector();
    });

    elements.builtIn.addEventListener("change", () => {
      this.builtInSelection = elements.builtIn.value;
    });

    elements.obstacleKind.addEventListener("change", () => {
      this.obstacleKind = elements.obstacleKind.value as ObstacleKind;
      this.syncInspector();
      this.drawCanvas();
    });

    elements.ledgeOrientation.addEventListener("change", () => {
      this.ledgeOrientation = elements.ledgeOrientation.value as LedgeOrientation;
      this.syncInspector();
      this.drawCanvas();
    });

    elements.palletOrientation.addEventListener("change", () => {
      this.palletOrientation = elements.palletOrientation.value as LedgeOrientation;
      this.syncInspector();
      this.drawCanvas();
    });

    elements.gateSide.addEventListener("change", () => {
      this.gateSide = elements.gateSide.value as GateData["side"];
      this.syncInspector();
      this.drawCanvas();
    });

    elements.spawnTarget.addEventListener("change", () => {
      this.spawnTarget = elements.spawnTarget.value as SpawnTarget;
      this.syncInspector();
      this.drawCanvas();
    });

    for (const [key, input] of Object.entries(elements.paletteInputs) as Array<[keyof MapPalette, HTMLInputElement]>) {
      input.addEventListener("input", () => {
        this.state.palette[key] = colorNumber(input.value);
        this.drawCanvas();
      });
    }

    elements.canvas.addEventListener("pointerdown", (event) => {
      const tile = this.tileFromPointer(event);
      if (!tile) {
        return;
      }

      if (this.tool === "obstacle" || this.tool === "ledge") {
        this.dragState = { start: tile, current: tile };
        elements.canvas.setPointerCapture(event.pointerId);
        this.drawCanvas();
        return;
      }

      this.applySingleTileTool(tile);
    });

    elements.canvas.addEventListener("pointermove", (event) => {
      const tile = this.tileFromPointer(event);
      this.hoverTile = tile;

      if (this.dragState && tile) {
        this.dragState.current = tile;
      }

      this.syncInspector();
      this.drawCanvas();
    });

    elements.canvas.addEventListener("pointerleave", () => {
      this.hoverTile = null;
      this.syncInspector();
      this.drawCanvas();
    });
  }

  private feedback(message: string, tone: FeedbackTone): void {
    this.feedbackMessage = message;
    this.feedbackTone = tone;
  }

  private prepareAuthoredMap() {
    const issues = validateAuthoredMap(this.state);
    if (issues.length > 0) {
      this.feedback(issues[0], "error");
      this.syncInspector();
      return null;
    }

    try {
      authoredMapToRuntimeMap(this.state);
      return cloneAuthoredMap(this.state);
    } catch (error) {
      this.feedback(error instanceof Error ? error.message : "Map conversion failed.", "error");
      this.syncInspector();
      return null;
    }
  }

  private downloadJson(contents: string, fileName: string): void {
    const blob = new Blob([contents], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(objectUrl);
  }

  private syncInspector(resetJson = false): void {
    if (!this.elements || !this.root) {
      return;
    }

    const issues = validateAuthoredMap(this.state);
    const statusParts = [
      `Tool: ${this.tool}`,
      this.hoverTile ? `Tile ${this.hoverTile.x}, ${this.hoverTile.y}` : "Hover the canvas",
    ];

    if (this.tool === "obstacle") {
      statusParts.push(`Kind ${this.obstacleKind}`);
    } else if (this.tool === "ledge") {
      statusParts.push(`Orientation ${this.ledgeOrientation}`);
    } else if (this.tool === "pallet") {
      statusParts.push(`Orientation ${this.palletOrientation}`);
    } else if (this.tool === "generator") {
      statusParts.push("Place generator spawns");
    } else if (this.tool === "gate") {
      statusParts.push(`Side ${this.gateSide}`);
    } else if (this.tool === "spawn") {
      statusParts.push(`Target ${this.spawnTarget}`);
    }

    this.elements.status.textContent = statusParts.join(" | ");
    this.elements.feedback.textContent = this.feedbackMessage;
    this.elements.feedback.dataset.tone = this.feedbackTone;
    this.elements.counts.textContent = `Obstacles ${this.state.obstacles.length} | Ledges ${this.state.ledges.length} | Pallets ${this.state.pallets.length} | Generators ${this.state.generatorSpawns.length}`;
    this.elements.validation.innerHTML =
      issues.length === 0
        ? '<li class="validation-ok">Ready to export or download.</li>'
        : issues.map((issue) => `<li>${issue}</li>`).join("");

    this.elements.mapId.value = this.state.id;
    this.elements.mapName.value = this.state.name;
    this.elements.builtIn.value = this.builtInSelection;
    this.elements.obstacleKind.value = this.obstacleKind;
    this.elements.ledgeOrientation.value = this.ledgeOrientation;
    this.elements.palletOrientation.value = this.palletOrientation;
    this.elements.gateSide.value = this.gateSide;
    this.elements.spawnTarget.value = this.spawnTarget;

    for (const [key, input] of Object.entries(this.elements.paletteInputs) as Array<[keyof MapPalette, HTMLInputElement]>) {
      input.value = colorHex(this.state.palette[key]);
    }

    if (resetJson) {
      this.jsonBuffer = "";
      this.elements.jsonArea.value = "";
    }

    this.root.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tool === this.tool);
    });
  }

  private drawCanvas(): void {
    const canvas = this.elements?.canvas;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    const tileSize = DISPLAY_TILE_SIZE;
    context.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < this.state.heightTiles; y += 1) {
      for (let x = 0; x < this.state.widthTiles; x += 1) {
        const fill = (x + y) % 2 === 0 ? this.state.palette.floorAlt : this.state.palette.floorAccent;
        context.fillStyle = colorHex(fill);
        context.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }

    context.globalAlpha = 0.4;
    context.fillStyle = colorHex(this.state.palette.floor);
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalAlpha = 1;

    const gate = gateFootprint(this.state.gate);
    if (gate) {
      context.fillStyle = "#52d97f";
      context.fillRect(gate.tileX * tileSize, gate.tileY * tileSize, gate.tileW * tileSize, gate.tileH * tileSize);
    }

    for (const entry of this.state.obstacles) {
      context.fillStyle =
        entry.kind === "wall"
          ? colorHex(this.state.palette.wall)
          : entry.kind === "car"
            ? colorHex(this.state.palette.car)
            : colorHex(this.state.palette.rock);
      context.fillRect(entry.tileX * tileSize, entry.tileY * tileSize, entry.tileW * tileSize, entry.tileH * tileSize);
      context.strokeStyle = "rgba(0, 0, 0, 0.4)";
      context.strokeRect(entry.tileX * tileSize, entry.tileY * tileSize, entry.tileW * tileSize, entry.tileH * tileSize);
    }

    for (const entry of this.state.ledges) {
      context.fillStyle = colorHex(this.state.palette.ledge);
      if (entry.orientation === "horizontal") {
        context.fillRect(
          entry.tileX * tileSize,
          entry.tileY * tileSize + tileSize * 0.4,
          entry.spanTiles * tileSize,
          Math.max(6, tileSize * 0.22),
        );
      } else {
        context.fillRect(
          entry.tileX * tileSize + tileSize * 0.4,
          entry.tileY * tileSize,
          Math.max(6, tileSize * 0.22),
          entry.spanTiles * tileSize,
        );
      }
    }

    for (const entry of this.state.pallets) {
      context.fillStyle = colorHex(this.state.palette.pallet);
      if (entry.orientation === "horizontal") {
        context.fillRect(entry.tileX * tileSize + 2, entry.tileY * tileSize + tileSize * 0.35, tileSize - 4, tileSize * 0.3);
      } else {
        context.fillRect(entry.tileX * tileSize + tileSize * 0.35, entry.tileY * tileSize + 2, tileSize * 0.3, tileSize - 4);
      }
    }

    for (const entry of this.state.generatorSpawns) {
      const x = entry.x * tileSize + tileSize * 0.2;
      const y = entry.y * tileSize + tileSize * 0.2;
      context.fillStyle = "#ffcf68";
      context.fillRect(x, y, tileSize * 0.6, tileSize * 0.6);
      context.fillStyle = "#12161d";
      context.font = "10px monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("G", entry.x * tileSize + tileSize * 0.5, entry.y * tileSize + tileSize * 0.52);
    }

    this.drawSpawn(context, this.state.spawns.lulu, "#ff93c4", "L");
    this.drawSpawn(context, this.state.spawns.springtrap, "#49b675", "S");
    this.state.spawns.npcs.forEach((entry, index) => {
      this.drawSpawn(context, entry, "#f8d26a", `${index + 1}`);
    });

    if (this.dragState) {
      this.drawDragPreview(context, this.dragState.start, this.dragState.current);
    }

    if (this.hoverTile) {
      context.strokeStyle = "rgba(255, 255, 255, 0.8)";
      context.lineWidth = 2;
      context.strokeRect(this.hoverTile.x * tileSize + 1, this.hoverTile.y * tileSize + 1, tileSize - 2, tileSize - 2);
    }

    context.strokeStyle = "rgba(255, 255, 255, 0.08)";
    context.lineWidth = 1;
    for (let x = 0; x <= this.state.widthTiles; x += 1) {
      context.beginPath();
      context.moveTo(x * tileSize + 0.5, 0);
      context.lineTo(x * tileSize + 0.5, canvas.height);
      context.stroke();
    }

    for (let y = 0; y <= this.state.heightTiles; y += 1) {
      context.beginPath();
      context.moveTo(0, y * tileSize + 0.5);
      context.lineTo(canvas.width, y * tileSize + 0.5);
      context.stroke();
    }
  }

  private drawSpawn(context: CanvasRenderingContext2D, point: TilePoint | null, color: string, label: string): void {
    if (!point) {
      return;
    }

    const centerX = point.x * DISPLAY_TILE_SIZE + DISPLAY_TILE_SIZE * 0.5;
    const centerY = point.y * DISPLAY_TILE_SIZE + DISPLAY_TILE_SIZE * 0.5;
    context.fillStyle = color;
    context.beginPath();
    context.arc(centerX, centerY, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#0c1117";
    context.font = "10px monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, centerX, centerY + 0.5);
  }

  private drawDragPreview(context: CanvasRenderingContext2D, start: TilePoint, end: TilePoint): void {
    context.save();
    context.globalAlpha = 0.7;
    context.fillStyle = this.tool === "obstacle" ? "#9ec3ff" : "#d9f0ff";
    context.strokeStyle = "#ffffff";
    context.setLineDash([6, 4]);

    if (this.tool === "obstacle") {
      const rect = tileBounds(start, end);
      context.fillRect(
        rect.tileX * DISPLAY_TILE_SIZE,
        rect.tileY * DISPLAY_TILE_SIZE,
        rect.tileW * DISPLAY_TILE_SIZE,
        rect.tileH * DISPLAY_TILE_SIZE,
      );
      context.strokeRect(
        rect.tileX * DISPLAY_TILE_SIZE + 1,
        rect.tileY * DISPLAY_TILE_SIZE + 1,
        rect.tileW * DISPLAY_TILE_SIZE - 2,
        rect.tileH * DISPLAY_TILE_SIZE - 2,
      );
    } else if (this.ledgeOrientation === "horizontal") {
      const tileX = Math.min(start.x, end.x);
      const spanTiles = Math.abs(end.x - start.x) + 1;
      context.fillRect(
        tileX * DISPLAY_TILE_SIZE,
        start.y * DISPLAY_TILE_SIZE + DISPLAY_TILE_SIZE * 0.4,
        spanTiles * DISPLAY_TILE_SIZE,
        Math.max(6, DISPLAY_TILE_SIZE * 0.22),
      );
    } else {
      const tileY = Math.min(start.y, end.y);
      const spanTiles = Math.abs(end.y - start.y) + 1;
      context.fillRect(
        start.x * DISPLAY_TILE_SIZE + DISPLAY_TILE_SIZE * 0.4,
        tileY * DISPLAY_TILE_SIZE,
        Math.max(6, DISPLAY_TILE_SIZE * 0.22),
        spanTiles * DISPLAY_TILE_SIZE,
      );
    }

    context.restore();
  }

  private tileFromPointer(event: PointerEvent): TilePoint | null {
    const canvas = this.elements?.canvas;
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const scaledX = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const scaledY = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const tileX = Math.floor(scaledX / DISPLAY_TILE_SIZE);
    const tileY = Math.floor(scaledY / DISPLAY_TILE_SIZE);

    if (tileX < 0 || tileY < 0 || tileX >= this.state.widthTiles || tileY >= this.state.heightTiles) {
      return null;
    }

    return { x: tileX, y: tileY };
  }

  private commitDrag(): void {
    if (!this.dragState) {
      return;
    }

    if (this.tool === "obstacle") {
      const rect = tileBounds(this.dragState.start, this.dragState.current);
      this.state.obstacles.push({
        id: this.nextId("obstacle"),
        kind: this.obstacleKind,
        ...rect,
      });
      this.feedback(`Placed ${this.obstacleKind} obstacle.`, "success");
    } else if (this.tool === "ledge") {
      if (this.ledgeOrientation === "horizontal") {
        this.state.ledges.push({
          id: this.nextId("ledge"),
          orientation: "horizontal",
          tileX: Math.min(this.dragState.start.x, this.dragState.current.x),
          tileY: this.dragState.start.y,
          spanTiles: Math.abs(this.dragState.current.x - this.dragState.start.x) + 1,
        });
      } else {
        this.state.ledges.push({
          id: this.nextId("ledge"),
          orientation: "vertical",
          tileX: this.dragState.start.x,
          tileY: Math.min(this.dragState.start.y, this.dragState.current.y),
          spanTiles: Math.abs(this.dragState.current.y - this.dragState.start.y) + 1,
        });
      }
      this.feedback(`Placed ${this.ledgeOrientation} ledge.`, "success");
    }

    this.dragState = null;
    this.syncInspector();
    this.drawCanvas();
  }

  private applySingleTileTool(tile: TilePoint): void {
    if (this.tool === "pallet") {
      const existing = this.state.pallets.find((entry) => entry.tileX === tile.x && entry.tileY === tile.y);
      if (existing) {
        existing.orientation = this.palletOrientation;
        this.feedback("Updated pallet orientation.", "success");
      } else {
        this.state.pallets.push({
          id: this.nextId("pallet"),
          tileX: tile.x,
          tileY: tile.y,
          orientation: this.palletOrientation,
        });
        this.feedback("Placed pallet.", "success");
      }
    } else if (this.tool === "generator") {
      const existing = this.state.generatorSpawns.find((entry) => entry.x === tile.x && entry.y === tile.y);
      if (existing) {
        this.feedback("Generator spawn already exists on that tile.", "error");
      } else {
        this.state.generatorSpawns.push(tile);
        this.feedback("Placed generator spawn.", "success");
      }
    } else if (this.tool === "gate") {
      this.state.gate = this.buildGateAtTile(tile);
      this.feedback(`Placed ${this.gateSide} gate.`, "success");
    } else if (this.tool === "spawn") {
      if (this.spawnTarget === "lulu") {
        this.state.spawns.lulu = tile;
      } else if (this.spawnTarget === "springtrap") {
        this.state.spawns.springtrap = tile;
      } else {
        const npcIndex = Number.parseInt(this.spawnTarget.replace("npc-", ""), 10) - 1;
        this.state.spawns.npcs[npcIndex] = tile;
      }
      this.feedback(`Placed ${this.spawnTarget} spawn.`, "success");
    } else if (this.tool === "erase") {
      this.eraseAtTile(tile);
    }

    this.syncInspector();
    this.drawCanvas();
  }

  private buildGateAtTile(tile: TilePoint): AuthoredGate {
    if (this.gateSide === "left") {
      return { side: "left", tileX: 0, tileY: clamp(tile.y, 0, this.state.heightTiles - 4) };
    }

    if (this.gateSide === "right") {
      return { side: "right", tileX: this.state.widthTiles - 1, tileY: clamp(tile.y, 0, this.state.heightTiles - 4) };
    }

    if (this.gateSide === "top") {
      return { side: "top", tileX: clamp(tile.x, 0, this.state.widthTiles - 4), tileY: 0 };
    }

    return { side: "bottom", tileX: clamp(tile.x, 0, this.state.widthTiles - 4), tileY: this.state.heightTiles - 1 };
  }

  private eraseAtTile(tile: TilePoint): void {
    if (isPointEqual(this.state.spawns.lulu, tile)) {
      this.state.spawns.lulu = null;
      this.feedback("Removed LULU spawn.", "success");
      return;
    }

    if (isPointEqual(this.state.spawns.springtrap, tile)) {
      this.state.spawns.springtrap = null;
      this.feedback("Removed Springtrap spawn.", "success");
      return;
    }

    const npcIndex = this.state.spawns.npcs.findIndex((entry) => isPointEqual(entry, tile));
    if (npcIndex >= 0) {
      this.state.spawns.npcs[npcIndex] = null;
      this.feedback(`Removed NPC ${npcIndex + 1} spawn.`, "success");
      return;
    }

    const palletIndex = this.state.pallets.findIndex((entry) => entry.tileX === tile.x && entry.tileY === tile.y);
    if (palletIndex >= 0) {
      this.state.pallets.splice(palletIndex, 1);
      this.feedback("Removed pallet.", "success");
      return;
    }

    const generatorIndex = this.state.generatorSpawns.findIndex((entry) => entry.x === tile.x && entry.y === tile.y);
    if (generatorIndex >= 0) {
      this.state.generatorSpawns.splice(generatorIndex, 1);
      this.feedback("Removed generator spawn.", "success");
      return;
    }

    const ledgeIndex = this.state.ledges.findIndex((entry) => {
      const rect =
        entry.orientation === "horizontal"
          ? { tileX: entry.tileX, tileY: entry.tileY, tileW: entry.spanTiles, tileH: 1 }
          : { tileX: entry.tileX, tileY: entry.tileY, tileW: 1, tileH: entry.spanTiles };
      return tileInside(tile, rect);
    });
    if (ledgeIndex >= 0) {
      this.state.ledges.splice(ledgeIndex, 1);
      this.feedback("Removed ledge.", "success");
      return;
    }

    const gate = gateFootprint(this.state.gate);
    if (gate && tileInside(tile, gate)) {
      this.state.gate = null;
      this.feedback("Removed gate.", "success");
      return;
    }

    const obstacleIndex = this.state.obstacles.findIndex((entry) =>
      tileInside(tile, { tileX: entry.tileX, tileY: entry.tileY, tileW: entry.tileW, tileH: entry.tileH }),
    );
    if (obstacleIndex >= 0) {
      this.state.obstacles.splice(obstacleIndex, 1);
      this.feedback("Removed obstacle.", "success");
      return;
    }

    this.feedback("Nothing removable on that tile.", "error");
  }

  private nextId(prefix: string): string {
    const used = new Set<string>([
      ...this.state.obstacles.map((entry) => entry.id),
      ...this.state.ledges.map((entry) => entry.id),
      ...this.state.pallets.map((entry) => entry.id),
    ]);

    let counter = 1;
    let candidate = `${prefix}-${counter}`;
    while (used.has(candidate)) {
      counter += 1;
      candidate = `${prefix}-${counter}`;
    }
    return candidate;
  }
}
