import type { MatchState, MoveIntent, Role } from "@shared/types.js";
import { io, type Socket } from "socket.io-client";
import type { ActiveSession, SessionInfo } from "./runtime.js";
import { refreshMapCatalog } from "./mapCatalog.js";
import { SERVER_URL } from "./serverUrl.js";

interface RoomStatePayload {
  roomCode: string;
  waiting: boolean;
  statusText: string;
  role: Role | null;
  match: MatchState | null;
}

interface RoomAck {
  ok: boolean;
  message?: string;
  roomCode?: string;
}

function sameMoveIntent(left: MoveIntent | null, right: MoveIntent | null): boolean {
  return left?.primary === right?.primary && left?.secondary === right?.secondary;
}

export class NetworkSession implements ActiveSession {
  private readonly socket: Socket;
  private waiting = true;
  private roomCode: string | null = null;
  private localRole: Role = "lulu";
  private moveIntent: MoveIntent | null = null;
  private actionHeld = false;
  private state: MatchState | null = null;
  private statusText = "Connecting...";

  private constructor(socket: Socket) {
    this.socket = socket;
    this.attachListeners();
  }

  public static async createRoom(): Promise<NetworkSession> {
    await refreshMapCatalog();
    const session = await NetworkSession.connect();
    await session.emitAck("room:create");
    return session;
  }

  public static async joinRoom(roomCode: string): Promise<NetworkSession> {
    await refreshMapCatalog();
    const session = await NetworkSession.connect();
    await session.emitAck("room:join", { roomCode });
    return session;
  }

  private static async connect(): Promise<NetworkSession> {
    const socket = io(SERVER_URL, {
      transports: ["websocket"],
      autoConnect: true,
    });

    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("connect_error", (error) => reject(error));
    });

    return new NetworkSession(socket);
  }

  private async emitAck(eventName: string, payload?: object, options?: { disconnectOnError?: boolean }): Promise<void> {
    const response = await new Promise<RoomAck>((resolve) => {
      if (payload) {
        this.socket.emit(eventName, payload, resolve);
      } else {
        this.socket.emit(eventName, resolve);
      }
    });

    if (!response.ok) {
      if (options?.disconnectOnError ?? true) {
        this.socket.disconnect();
      }
      throw new Error(response.message ?? "Multiplayer request failed.");
    }
  }

  private attachListeners(): void {
    this.socket.on("room:state", (payload: RoomStatePayload) => {
      this.roomCode = payload.roomCode;
      this.waiting = payload.waiting;
      this.statusText = payload.statusText;
      this.state = payload.match;
      if (payload.role) {
        this.localRole = payload.role;
      }
    });
  }

  public getLocalRole(): Role {
    return this.localRole;
  }

  public getInfo(): SessionInfo {
    return {
      mode: "multiplayer",
      roomCode: this.roomCode,
      waiting: this.waiting,
      statusText: this.statusText,
    };
  }

  public getState(): MatchState | null {
    return this.state;
  }

  public setMoveIntent(direction: MoveIntent | null): void {
    if (sameMoveIntent(this.moveIntent, direction)) {
      return;
    }

    this.moveIntent = direction;
    this.socket.emit("match:move", { move: direction });
  }

  public queueAction(): void {
    this.socket.emit("match:action");
  }

  public setActionHeld(held: boolean): void {
    if (this.actionHeld === held) {
      return;
    }

    this.actionHeld = held;
    this.socket.emit("match:action-state", { held });
  }

  public update(): void {}

  public advanceTime(): void {}

  public async requestRematch(): Promise<void> {
    await refreshMapCatalog();
    await this.emitAck("match:rematch", undefined, { disconnectOnError: false });
  }

  public dispose(): void {
    this.socket.disconnect();
  }
}
