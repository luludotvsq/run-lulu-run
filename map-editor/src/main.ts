import "./styles.css";
import { APP_TITLE, GAME_CONFIG } from "@shared/index.js";
import { MapEditorController } from "./MapEditorController.js";

type DebugWindow = Window & {
  advanceTime?: (ms: number) => Promise<void>;
  render_game_to_text?: () => string;
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("App root not found.");
}

app.innerHTML = `
  <div class="editor-app">
    <header class="top-strip">
      <div>
        <p class="eyebrow">Separate Local Tool</p>
        <h1 class="shell-title">${APP_TITLE} Map Editor</h1>
      </div>
      <div class="top-strip-copy">
        <span>${GAME_CONFIG.map.widthTiles} x ${GAME_CONFIG.map.heightTiles} tiles</span>
        <span>${GAME_CONFIG.generator.totalCount}+ generator spawns</span>
        <span>Authored JSON</span>
        <span>maps/custom/</span>
      </div>
    </header>
    <section class="intro-card">
      <p>Create exactly 2 runtime maps here, place at least ${GAME_CONFIG.generator.totalCount} generator spawns on each one, export or download both JSON files, then copy them into <code>maps/custom/</code>. The game blocks runtime play unless there are exactly 2 valid custom maps there.</p>
      <p>The player-facing game stays separate at <a href="http://127.0.0.1:5173" target="_blank" rel="noreferrer">http://127.0.0.1:5173</a>.</p>
    </section>
    <div id="editor-root" class="editor-root"></div>
  </div>
`;

const editorRoot = document.querySelector<HTMLDivElement>("#editor-root");
if (!editorRoot) {
  throw new Error("Editor root not found.");
}

const controller = new MapEditorController();
controller.mount(editorRoot);

const debugWindow = window as DebugWindow;
debugWindow.advanceTime = async (ms: number) => {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
};
debugWindow.render_game_to_text = () =>
  JSON.stringify({
    coordinateSystem: "origin top-left, +x right, +y down",
    ...controller.getSnapshot(),
  });
