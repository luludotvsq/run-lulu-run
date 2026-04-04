import { FIXED_STEP_MS, createMatch, getMapIdByCycle, stepMatch } from "@shared/index.js";
import type { MatchState, MoveIntent, Role } from "@shared/types.js";
import type { ActiveSession, SessionInfo } from "./runtime.js";

let singlePlayerMapIndex = 0;

export class LocalSinglePlayerSession implements ActiveSession {
  private accumulatorMs = 0;
  private readonly localRole: Role;
  private moveIntent: MoveIntent | null = null;
  private actionHeld = false;
  private queuedAction = false;
  private readonly state: MatchState;

  public constructor(mapId: string | null = null, localRole: Role = "lulu") {
    const resolvedMapId = mapId ?? getMapIdByCycle(singlePlayerMapIndex++);
    this.state = createMatch("single", resolvedMapId);
    this.localRole = localRole;
  }

  public getLocalRole(): Role {
    return this.localRole;
  }

  public getInfo(): SessionInfo {
    return {
      mode: "single",
      roomCode: null,
      waiting: false,
      statusText: "Single-player round",
    };
  }

  public getState(): MatchState {
    return this.state;
  }

  public setMoveIntent(direction: MoveIntent | null): void {
    this.moveIntent = direction;
  }

  public queueAction(): void {
    this.queuedAction = true;
  }

  public setActionHeld(held: boolean): void {
    this.actionHeld = held;
  }

  public update(deltaMs: number): void {
    this.advanceTime(deltaMs);
  }

  public advanceTime(deltaMs: number): void {
    this.accumulatorMs += Math.min(deltaMs, 100);

    while (this.accumulatorMs >= FIXED_STEP_MS) {
      stepMatch(
        this.state,
        {
          lulu: {
            move: this.localRole === "lulu" ? this.moveIntent : null,
            actionPressed: this.localRole === "lulu" ? this.queuedAction : false,
            actionHeld: this.localRole === "lulu" ? this.actionHeld : false,
          },
          springtrap: {
            move: this.localRole === "springtrap" ? this.moveIntent : null,
            actionPressed: this.localRole === "springtrap" ? this.queuedAction : false,
            actionHeld: this.localRole === "springtrap" ? this.actionHeld : false,
          },
        },
        FIXED_STEP_MS,
      );

      this.queuedAction = false;
      this.accumulatorMs -= FIXED_STEP_MS;
    }
  }

  public dispose(): void {
    this.moveIntent = null;
    this.actionHeld = false;
    this.queuedAction = false;
  }
}
