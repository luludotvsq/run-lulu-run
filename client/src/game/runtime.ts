import type { MatchState, MoveIntent, Role } from "@shared/types.js";

export interface SessionInfo {
  mode: "single" | "multiplayer";
  roomCode: string | null;
  waiting: boolean;
  statusText: string;
  isHost: boolean;
}

export interface ActiveSession {
  getLocalRole(): Role;
  getInfo(): SessionInfo;
  getState(): MatchState | null;
  setMoveIntent(direction: MoveIntent | null): void;
  setActionHeld(held: boolean): void;
  queueAction(): void;
  update(deltaMs: number): void;
  advanceTime(deltaMs: number): void;
  requestRematch?(): void | Promise<void>;
  dispose(): void;
}

class GameRuntime {
  private listeners = new Set<() => void>();
  private session: ActiveSession | null = null;

  public getSession(): ActiveSession | null {
    return this.session;
  }

  public setSession(session: ActiveSession | null): void {
    if (this.session) {
      this.session.dispose();
    }

    this.session = session;
    this.emit();
  }

  public clearSession(): void {
    this.setSession(null);
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const gameRuntime = new GameRuntime();
