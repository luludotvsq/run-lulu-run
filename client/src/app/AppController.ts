import { APP_TITLE, getMapById } from "@shared/index.js";
import type { MatchState, Role } from "@shared/types.js";
import { createGame } from "../game/createGame.js";
import { CLIENT_CONFIG } from "../game/clientConfig.js";
import { LocalSinglePlayerSession } from "../game/LocalSinglePlayerSession.js";
import { NetworkSession } from "../game/NetworkSession.js";
import { refreshMapCatalog, primeMapCatalog } from "../game/mapCatalog.js";
import { gameRuntime } from "../game/runtime.js";
import { AudioController, type MusicCue } from "./audioController.js";
import { buildTextStatePayload } from "./debugState.js";
import { createAppLayout, type AppLayout } from "./createAppLayout.js";
import { getStateSummary, syncHud } from "./hud.js";
import type { DebugWindow, PendingAction, UiState } from "./types.js";

export class AppController {
  private readonly appTitle: string;
  private readonly audio = new AudioController();
  private readonly layout: AppLayout;
  private readonly params = new URLSearchParams(window.location.search);
  private readonly debugAi = this.params.get("debugAi") === "1";
  private readonly debugWindow = window as DebugWindow;
  private readonly uiState: UiState;
  private overlaySignature = "";
  private lastObservedSession = gameRuntime.getSession();
  private wasRoundRunning = false;
  private completedRounds = 0;

  public constructor(appRoot: HTMLDivElement, appTitle = APP_TITLE) {
    this.appTitle = appTitle;
    this.layout = createAppLayout(appRoot, appTitle);
    createGame(this.layout.gameHost);
    primeMapCatalog();

    const roomParam = this.params.get("room")?.trim().toUpperCase() ?? "";
    this.uiState = {
      screen: roomParam ? "join" : "splash",
      joinCode: roomParam,
      notice: roomParam ? `Invite link loaded for room ${roomParam}.` : "",
      pendingAction: null,
    };
  }

  public start(): void {
    this.renderOverlay();
    gameRuntime.subscribe(() => {
      this.overlaySignature = "";
      this.renderOverlay();
    });

    this.debugWindow.advanceTime = async (ms: number) => {
      const session = gameRuntime.getSession();
      if (session) {
        session.advanceTime(ms);
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, ms));
    };

    this.debugWindow.render_game_to_text = () =>
      buildTextStatePayload({
        session: gameRuntime.getSession(),
        uiState: this.uiState,
        appTitle: this.appTitle,
        audio: this.audio.getDebugState(),
      });

    window.requestAnimationFrame(this.syncUiLoop);
  }

  private readonly syncUiLoop = (): void => {
    const nextSignature = this.getOverlaySignature();
    if (nextSignature !== this.overlaySignature) {
      this.overlaySignature = nextSignature;
      this.renderOverlay();
    }

    const session = gameRuntime.getSession();
    if (session !== this.lastObservedSession) {
      this.lastObservedSession = session;
      this.wasRoundRunning = false;
    }

    const info = session?.getInfo() ?? null;
    const state = session?.getState() ?? null;
    const waiting = info?.waiting ?? false;
    const roundRunning = Boolean(session && state && state.result === "running" && !waiting);
    if (this.wasRoundRunning && state && state.result !== "running") {
      this.completedRounds += 1;
      this.audio.setGameplayTrackIndex(this.completedRounds);
    }
    this.wasRoundRunning = roundRunning;
    syncHud(
      this.layout.hud,
      state && !waiting && state.result === "running" ? state : null,
      state ? session?.getLocalRole() ?? "lulu" : null,
      this.debugAi,
    );
    this.audio.setCue(this.resolveMusicCue());
    window.requestAnimationFrame(this.syncUiLoop);
  };

  private resolveMusicCue(): MusicCue {
    const session = gameRuntime.getSession();
    const state = session?.getState() ?? null;

    if (session && state && state.result === "running" && !session.getInfo().waiting) {
      return "gameplay";
    }

    return "title";
  }

  private updateRoomQuery(roomCode: string | null): void {
    const nextUrl = new URL(window.location.href);
    if (roomCode) {
      nextUrl.searchParams.set("room", roomCode);
    } else {
      nextUrl.searchParams.delete("room");
    }
    window.history.replaceState({}, "", nextUrl.toString());
  }

  private getInviteLink(roomCode: string): string {
    const inviteUrl = new URL(window.location.href);
    inviteUrl.searchParams.delete("debugRole");
    inviteUrl.searchParams.set("room", roomCode);
    return inviteUrl.toString();
  }

  private async copyText(value: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }

  private buttonLabel(action: PendingAction, fallback: string): string {
    if (this.uiState.pendingAction !== action) {
      return fallback;
    }

    if (action === "single") {
      return "Loading...";
    }
    if (action === "create") {
      return "Creating...";
    }
    if (action === "join") {
      return "Joining...";
    }

    return fallback;
  }

  private async startLocalSession(localRole: Role): Promise<void> {
    await refreshMapCatalog();
    this.updateRoomQuery(null);
    gameRuntime.setSession(new LocalSinglePlayerSession(null, localRole));
    this.uiState.notice = "";
  }

  private queryOverlay<T extends Element>(selector: string): T | null {
    return this.layout.overlayRoot.querySelector<T>(selector);
  }

  private renderOverlay(): void {
    const session = gameRuntime.getSession();
    const info = session?.getInfo() ?? null;
    const state = session?.getState() ?? null;

    if (!session) {
      this.renderMenuOverlay();
      return;
    }

    if (info?.mode === "multiplayer" && info.waiting) {
      this.renderWaitingOverlay(info.roomCode, info.statusText);
      return;
    }

    if (!state) {
      this.renderConnectingOverlay(info?.statusText ?? "Waiting for match state...");
      return;
    }

    if (state.result !== "running") {
      this.renderRoundEndOverlay(state, session.getLocalRole(), info?.mode ?? "single");
      return;
    }

    this.layout.overlayRoot.innerHTML = "";
  }

  private renderMenuOverlay(): void {
    const audioHint = this.audio.isUnlocked() ? "Sound enabled." : CLIENT_CONFIG.branding.audioHint;
    const titleLines = CLIENT_CONFIG.branding.titleDisplayLines.map((line) => `<span>${line}</span>`).join("");
    const splashStyle = `style="--title-splash-image: url('${CLIENT_CONFIG.branding.titleSplashImage}')"`;
    this.layout.overlayRoot.innerHTML =
      this.uiState.screen === "join"
        ? `
          <div class="menu-screen join-screen">
            <div class="menu-panel">
              <p class="menu-kicker">Join Room</p>
              <h2>${CLIENT_CONFIG.branding.displayTitle}</h2>
              <label class="field-label">
                <span>Room Code</span>
                <input id="join-room-input" class="text-input room-code-input" maxlength="4" value="${this.uiState.joinCode}" placeholder="ROOM" />
              </label>
              ${this.uiState.notice ? `<p class="status-copy">${this.uiState.notice}</p>` : `<p class="status-copy">Enter the 4-character room code.</p>`}
              <div class="action-stack title-actions-stack">
                <button class="action-button" id="join-room-btn" ${this.uiState.pendingAction ? "disabled" : ""}>${this.buttonLabel("join", "Join Game")}</button>
                <button class="ghost-button" id="back-to-splash-btn" ${this.uiState.pendingAction ? "disabled" : ""}>Back</button>
              </div>
              <p class="title-status">${audioHint}</p>
            </div>
          </div>
        `
        : `
          <div class="title-screen title-screen-splash" ${splashStyle}>
            <div class="title-brand-panel">
              <h1 class="title-logo title-logo-splash" aria-label="${CLIENT_CONFIG.branding.displayTitle}">
                ${titleLines}
              </h1>
            </div>
            <div class="title-actions-panel">
              <div class="title-actions-stack">
                <button class="action-button" id="start-single-btn" ${this.uiState.pendingAction ? "disabled" : ""}>${this.buttonLabel("single", "1 Player")}</button>
                <button class="action-button secondary-button" id="create-room-btn" ${this.uiState.pendingAction ? "disabled" : ""}>${this.buttonLabel("create", "2 Players")}</button>
                <button class="ghost-button" id="open-join-btn" ${this.uiState.pendingAction ? "disabled" : ""}>Join Game</button>
              </div>
              ${this.uiState.notice ? `<p class="status-copy menu-notice">${this.uiState.notice}</p>` : ""}
              <p class="title-status">${audioHint}</p>
            </div>
          </div>
        `;

    const joinInput = this.queryOverlay<HTMLInputElement>("#join-room-input");
    joinInput?.addEventListener("input", () => {
      this.uiState.joinCode = joinInput.value.toUpperCase().slice(0, 4);
      joinInput.value = this.uiState.joinCode;
    });
    joinInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        this.queryOverlay<HTMLButtonElement>("#join-room-btn")?.click();
      }
    });

    this.queryOverlay<HTMLButtonElement>("#start-single-btn")?.addEventListener("click", async () => {
      await this.audio.unlock();
      this.uiState.pendingAction = "single";
      this.uiState.screen = "splash";
      this.uiState.notice = "Loading the current map rotation...";
      this.renderOverlay();
      try {
        await this.startLocalSession("lulu");
      } catch (error) {
        this.uiState.notice = error instanceof Error ? error.message : "Failed to load the map catalog.";
      } finally {
        this.uiState.pendingAction = null;
        this.renderOverlay();
      }
    });

    this.queryOverlay<HTMLButtonElement>("#create-room-btn")?.addEventListener("click", async () => {
      await this.audio.unlock();
      this.uiState.pendingAction = "create";
      this.uiState.notice = "Creating room...";
      this.renderOverlay();
      try {
        const sessionInstance = await NetworkSession.createRoom();
        gameRuntime.setSession(sessionInstance);
        this.uiState.screen = "splash";
        this.uiState.notice = "";
      } catch (error) {
        this.uiState.notice = error instanceof Error ? error.message : "Failed to create room.";
      } finally {
        this.uiState.pendingAction = null;
        this.renderOverlay();
      }
    });

    this.queryOverlay<HTMLButtonElement>("#open-join-btn")?.addEventListener("click", () => {
      this.uiState.screen = "join";
      this.uiState.notice = "";
      this.renderOverlay();
    });

    this.queryOverlay<HTMLButtonElement>("#join-room-btn")?.addEventListener("click", async () => {
      await this.audio.unlock();
      const roomCode = this.uiState.joinCode.trim().toUpperCase();
      if (!roomCode) {
        this.uiState.notice = "Enter a room code.";
        this.renderOverlay();
        return;
      }

      this.uiState.pendingAction = "join";
      this.uiState.notice = `Joining ${roomCode}...`;
      this.renderOverlay();
      try {
        const sessionInstance = await NetworkSession.joinRoom(roomCode);
        gameRuntime.setSession(sessionInstance);
        this.uiState.screen = "splash";
        this.uiState.notice = "";
        this.updateRoomQuery(null);
      } catch (error) {
        this.uiState.notice = error instanceof Error ? error.message : "Failed to join room.";
      } finally {
        this.uiState.pendingAction = null;
        this.renderOverlay();
      }
    });

    this.queryOverlay<HTMLButtonElement>("#back-to-splash-btn")?.addEventListener("click", () => {
      this.uiState.screen = "splash";
      this.uiState.notice = "";
      this.updateRoomQuery(null);
      this.renderOverlay();
    });

    this.queryOverlay<HTMLButtonElement>("#start-springtrap-btn")?.addEventListener("click", async () => {
      await this.audio.unlock();
      this.uiState.pendingAction = "single";
      this.uiState.screen = "splash";
      this.uiState.notice = "Loading the current map rotation...";
      this.renderOverlay();
      try {
        await this.startLocalSession("springtrap");
      } catch (error) {
        this.uiState.notice = error instanceof Error ? error.message : "Failed to load the map catalog.";
      } finally {
        this.uiState.pendingAction = null;
        this.renderOverlay();
      }
    });
  }

  private renderWaitingOverlay(roomCode: string | null, statusText: string): void {
    const inviteLink = roomCode ? this.getInviteLink(roomCode) : "";
    this.layout.overlayRoot.innerHTML = `
      <div class="menu-screen waiting-screen">
        <div class="menu-panel">
          <p class="menu-kicker">Waiting For Player 2</p>
          <h2>Room ${roomCode ?? "----"}</h2>
          <div class="room-code-display">${roomCode ?? "----"}</div>
          <p class="status-copy">${statusText}</p>
          ${this.uiState.notice ? `<p class="status-copy">${this.uiState.notice}</p>` : ""}
          <div class="action-stack title-actions-stack">
            <button class="action-button secondary-button" id="copy-link-btn" ${inviteLink ? "" : "disabled"}>Copy Invite Link</button>
            <button class="ghost-button" id="copy-code-btn" ${roomCode ? "" : "disabled"}>Copy Room Code</button>
            <button class="ghost-button" id="leave-lobby-btn">Back To Title</button>
          </div>
        </div>
      </div>
    `;

    this.queryOverlay<HTMLButtonElement>("#copy-link-btn")?.addEventListener("click", async () => {
      this.uiState.notice = (await this.copyText(inviteLink)) ? "Invite link copied." : "Clipboard write failed.";
      this.renderOverlay();
    });

    this.queryOverlay<HTMLButtonElement>("#copy-code-btn")?.addEventListener("click", async () => {
      this.uiState.notice = (await this.copyText(roomCode ?? "")) ? "Room code copied." : "Clipboard write failed.";
      this.renderOverlay();
    });

    this.queryOverlay<HTMLButtonElement>("#leave-lobby-btn")?.addEventListener("click", () => {
      this.updateRoomQuery(null);
      this.uiState.screen = "splash";
      gameRuntime.clearSession();
      this.renderOverlay();
    });
  }

  private renderConnectingOverlay(statusText: string): void {
    this.layout.overlayRoot.innerHTML = `
      <div class="menu-screen connecting-screen">
        <div class="menu-panel">
          <p class="menu-kicker">Connecting</p>
          <h2>${this.appTitle}</h2>
          <p class="status-copy">${statusText}</p>
          <button class="ghost-button" id="leave-empty-session-btn">Back To Title</button>
        </div>
      </div>
    `;

    this.queryOverlay<HTMLButtonElement>("#leave-empty-session-btn")?.addEventListener("click", () => {
      this.updateRoomQuery(null);
      this.uiState.screen = "splash";
      gameRuntime.clearSession();
      this.renderOverlay();
    });
  }

  private renderRoundEndOverlay(state: MatchState, localRole: Role, mode: "single" | "multiplayer"): void {
    const map = getMapById(state.mapId);
    const localWon =
      (localRole === "lulu" && state.result === "lulu_win") ||
      (localRole === "springtrap" && state.result === "springtrap_win");

    this.layout.overlayRoot.innerHTML = `
      <div class="menu-screen result-screen">
        <div class="menu-panel">
          <p class="menu-kicker">${localWon ? "Round Won" : "Round Lost"}</p>
          <h2>${localWon ? "Play Again?" : "Round Over"}</h2>
          <p class="status-copy">Map: ${map.name} | Role: ${localRole.toUpperCase()}</p>
          <p class="status-copy">${localWon ? "You won the round." : "You lost the round."}</p>
          <p class="status-copy">${getStateSummary(state)}</p>
          ${this.uiState.notice ? `<p class="status-copy">${this.uiState.notice}</p>` : ""}
          <div class="action-stack title-actions-stack">
            ${
              mode === "multiplayer"
                ? '<button class="action-button" id="play-again-btn">Play Again</button>'
                : '<button class="action-button" id="restart-single-btn">Play Again</button>'
            }
            <button class="ghost-button" id="back-to-splash-match-btn">Back To Title</button>
          </div>
        </div>
      </div>
    `;

    this.queryOverlay<HTMLButtonElement>("#play-again-btn")?.addEventListener("click", async () => {
      try {
        await gameRuntime.getSession()?.requestRematch?.();
      } catch (error) {
        this.uiState.notice = error instanceof Error ? error.message : "Could not start the rematch.";
        this.renderOverlay();
      }
    });

    this.queryOverlay<HTMLButtonElement>("#restart-single-btn")?.addEventListener("click", async () => {
      try {
        await this.startLocalSession(localRole);
      } catch (error) {
        this.uiState.notice = error instanceof Error ? error.message : "Failed to load the map catalog.";
      }
      this.renderOverlay();
    });

    this.queryOverlay<HTMLButtonElement>("#back-to-splash-match-btn")?.addEventListener("click", () => {
      this.updateRoomQuery(null);
      this.uiState.screen = "splash";
      gameRuntime.clearSession();
      this.renderOverlay();
    });
  }

  private getOverlaySignature(): string {
    const session = gameRuntime.getSession();
    const info = session?.getInfo() ?? null;
    const state = session?.getState() ?? null;
    return JSON.stringify({
      screen: this.uiState.screen,
      notice: this.uiState.notice,
      busy: this.uiState.pendingAction,
      joinCode: this.uiState.joinCode,
      mode: info?.mode ?? "menu",
      waiting: info?.waiting ?? false,
      roomCode: info?.roomCode ?? null,
      status: info?.statusText ?? "",
      result: state?.result ?? "none",
      round: state?.roundNumber ?? 0,
    });
  }
}
