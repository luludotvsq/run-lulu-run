import { GAME_CONFIG } from "@shared/config.js";

export interface HudElements {
  root: HTMLElement;
  role: HTMLElement;
  generators: HTMLElement;
  gate: HTMLElement;
  health: HTMLElement;
  prompt: HTMLElement;
  aiDebug: HTMLElement;
}

export interface AppLayout {
  gameHost: HTMLDivElement;
  overlayRoot: HTMLElement;
  hud: HudElements;
}

function requireElement<T extends Element>(value: T | null, label: string): T {
  if (!value) {
    throw new Error(`${label} not found.`);
  }

  return value;
}

export function createAppLayout(appRoot: HTMLDivElement, appTitle: string): AppLayout {
  const generatorGoal = GAME_CONFIG.generator.totalCount;
  appRoot.innerHTML = `
    <div class="game-shell">
      <div class="game-stage">
        <div id="game-host" class="game-host" aria-label="${appTitle}"></div>
        <div id="hud-overlay" class="hud-overlay hidden">
          <div class="hud-row">
            <div class="hud-pill"><span>Role</span><strong id="hud-role">LULU</strong></div>
            <div class="hud-pill"><span>Generators</span><strong id="hud-generators">0 / ${generatorGoal}</strong></div>
            <div class="hud-pill"><span>Gate</span><strong id="hud-gate">Closed</strong></div>
            <div class="hud-pill"><span>Health</span><strong id="hud-health">Healthy</strong></div>
          </div>
          <div class="hud-prompt" id="hud-prompt">Repair all ${generatorGoal} generators, then escape.</div>
          <div id="hud-ai-debug" class="hud-debug hidden"></div>
        </div>
        <div id="screen-overlay" class="screen-overlay"></div>
      </div>
    </div>
  `;

  return {
    gameHost: requireElement(appRoot.querySelector<HTMLDivElement>("#game-host"), "Game host"),
    overlayRoot: requireElement(appRoot.querySelector<HTMLElement>("#screen-overlay"), "Overlay root"),
    hud: {
      root: requireElement(appRoot.querySelector<HTMLElement>("#hud-overlay"), "HUD overlay"),
      role: requireElement(appRoot.querySelector<HTMLElement>("#hud-role"), "HUD role"),
      generators: requireElement(appRoot.querySelector<HTMLElement>("#hud-generators"), "HUD generators"),
      gate: requireElement(appRoot.querySelector<HTMLElement>("#hud-gate"), "HUD gate"),
      health: requireElement(appRoot.querySelector<HTMLElement>("#hud-health"), "HUD health"),
      prompt: requireElement(appRoot.querySelector<HTMLElement>("#hud-prompt"), "HUD prompt"),
      aiDebug: requireElement(appRoot.querySelector<HTMLElement>("#hud-ai-debug"), "HUD AI debug"),
    },
  };
}
