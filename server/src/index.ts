import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import {
  APP_TITLE,
  FIXED_STEP_MS,
  createMatch,
  getMapCatalogStatus,
  getMapIdByCycle,
  stepMatch,
} from "../../shared/src/index.js";
import type { MatchControls, MatchState, MoveIntent, Role } from "../../shared/src/types.js";
import { Server, type Socket } from "socket.io";
import { getCustomMapsDirectory, getRepoRoot, refreshMapCatalogFromDisk } from "./mapCatalog.js";

interface PlayerInputState {
  move: MoveIntent | null;
  actionQueued: boolean;
  actionHeld: boolean;
}

interface RoomAckResponse {
  ok: boolean;
  roomCode?: string;
  message?: string;
}

interface RoomRecord {
  code: string;
  players: string[];
  roles: Map<string, Role>;
  inputs: Map<string, PlayerInputState>;
  match: MatchState | null;
  rematchVotes: Set<string>;
  roundNumber: number;
  mapIndex: number;
}

const app = express();
app.use(cors());
app.use(express.json());

const DEFAULT_SERVER_PORT = 3001;
const rawServerPort = Number.parseInt(process.env.PORT ?? "", 10);
const SERVER_PORT = Number.isFinite(rawServerPort) && rawServerPort > 0 ? rawServerPort : DEFAULT_SERVER_PORT;
const repoRoot = getRepoRoot();
const clientDistPath = path.join(repoRoot, "client", "dist");
const clientIndexPath = path.join(clientDistPath, "index.html");
const hasBuiltClient = existsSync(clientDistPath) && existsSync(clientIndexPath);

app.get("/health", (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.json({
    ok: true,
    game: APP_TITLE,
    mode: "server-authoritative",
  });
});

async function sendRuntimeCatalog(res: express.Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  const status = await getRuntimeCatalogStatus();
  res.json({
    ...status,
    maps: status.maps,
    customMapsDirectory: getCustomMapsDirectory(),
  });
}

app.get("/maps", async (_req, res) => {
  await sendRuntimeCatalog(res);
});

app.get("/runtime-map-catalog.json", async (_req, res) => {
  await sendRuntimeCatalog(res);
});

if (hasBuiltClient) {
  app.use(express.static(clientDistPath));
  app.get("/{*path}", (req, res, next) => {
    if (req.path === "/health" || req.path === "/maps" || req.path.startsWith("/socket.io")) {
      next();
      return;
    }

    res.sendFile(clientIndexPath);
  });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const rooms = new Map<string, RoomRecord>();
const socketToRoom = new Map<string, string>();

function generateRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function getDefaultInput(): PlayerInputState {
  return {
    move: null,
    actionQueued: false,
    actionHeld: false,
  };
}

function getRoomStatus(room: RoomRecord): string {
  if (room.players.length < 2) {
    return "Waiting for a second player to join.";
  }

  if (!room.match) {
    return "Waiting to start the round.";
  }

  if (room.match.result === "running") {
    return `Round ${room.roundNumber} live.`;
  }

  return `Round ${room.roundNumber} ended. Play Again if both players stay.`;
}

function emitRoomState(room: RoomRecord): void {
  for (const socketId of room.players) {
    io.to(socketId).emit("room:state", {
      roomCode: room.code,
      waiting: room.players.length < 2 || room.match === null,
      statusText: getRoomStatus(room),
      role: room.roles.get(socketId) ?? null,
      match: room.match,
      rematchVotes: room.rematchVotes.size,
    });
  }
}

function assignFirstRoundRoles(room: RoomRecord): void {
  const [first, second] = room.players;
  if (!first || !second) {
    return;
  }

  const swap = Math.random() >= 0.5;
  room.roles.set(swap ? first : second, "lulu");
  room.roles.set(swap ? second : first, "springtrap");
}

function swapRoles(room: RoomRecord): void {
  const nextRoles = new Map<string, Role>();
  for (const socketId of room.players) {
    const current = room.roles.get(socketId);
    nextRoles.set(socketId, current === "lulu" ? "springtrap" : "lulu");
  }
  room.roles = nextRoles;
}

async function syncMapCatalog(): Promise<void> {
  try {
    await refreshMapCatalogFromDisk();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    console.warn(`[maps] Catalog refresh failed: ${message}`);
  }
}

async function getRuntimeCatalogStatus() {
  await syncMapCatalog();
  return getMapCatalogStatus();
}

async function startRound(room: RoomRecord, options?: { swapRoles?: boolean }): Promise<void> {
  if (room.players.length < 2) {
    room.match = null;
    emitRoomState(room);
    return;
  }

  const catalogStatus = await getRuntimeCatalogStatus();
  if (!catalogStatus.ready) {
    throw new Error(catalogStatus.message);
  }

  if (room.roles.size === 0) {
    assignFirstRoundRoles(room);
  } else if (options?.swapRoles) {
    swapRoles(room);
  }

  room.match = createMatch("multiplayer", getMapIdByCycle(room.mapIndex));
  room.mapIndex += 1;
  room.roundNumber += 1;
  room.match.roundNumber = room.roundNumber;
  room.rematchVotes.clear();
  for (const playerId of room.players) {
    room.inputs.set(playerId, getDefaultInput());
  }
  emitRoomState(room);
}

function getControlsForRoom(room: RoomRecord): MatchControls {
  const luluSocket = room.players.find((socketId) => room.roles.get(socketId) === "lulu");
  const springtrapSocket = room.players.find((socketId) => room.roles.get(socketId) === "springtrap");
  const luluInput = luluSocket ? room.inputs.get(luluSocket) ?? getDefaultInput() : getDefaultInput();
  const springtrapInput = springtrapSocket ? room.inputs.get(springtrapSocket) ?? getDefaultInput() : getDefaultInput();

  return {
    lulu: {
      move: luluInput.move,
      actionPressed: luluInput.actionQueued,
      actionHeld: luluInput.actionHeld,
    },
    springtrap: {
      move: springtrapInput.move,
      actionPressed: springtrapInput.actionQueued,
      actionHeld: springtrapInput.actionHeld,
    },
  };
}

function clearQueuedActions(room: RoomRecord): void {
  for (const input of room.inputs.values()) {
    input.actionQueued = false;
  }
}

function detachSocket(socketId: string): void {
  const roomCode = socketToRoom.get(socketId);
  if (!roomCode) {
    return;
  }

  const room = rooms.get(roomCode);
  socketToRoom.delete(socketId);

  if (!room) {
    return;
  }

  room.players = room.players.filter((id) => id !== socketId);
  room.inputs.delete(socketId);
  room.roles.delete(socketId);
  room.rematchVotes.delete(socketId);

  if (room.players.length === 0) {
    rooms.delete(roomCode);
    return;
  }

  room.match = null;
  emitRoomState(room);
}

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.players.length < 2 || !room.match || room.match.result !== "running") {
      continue;
    }

    stepMatch(room.match, getControlsForRoom(room), FIXED_STEP_MS);
    clearQueuedActions(room);
    emitRoomState(room);
  }
}, FIXED_STEP_MS);

io.on("connection", (socket: Socket) => {
  socket.emit("server:hello", {
    message: `${APP_TITLE} server ready`,
    socketId: socket.id,
  });

  socket.on("room:create", async (ack: (response: RoomAckResponse) => void) => {
    const catalogStatus = await getRuntimeCatalogStatus();
    if (!catalogStatus.ready) {
      ack({ ok: false, message: catalogStatus.message });
      return;
    }

    detachSocket(socket.id);

    const roomCode = generateRoomCode();
    const room: RoomRecord = {
      code: roomCode,
      players: [socket.id],
      roles: new Map(),
      inputs: new Map([[socket.id, getDefaultInput()]]),
      match: null,
      rematchVotes: new Set(),
      roundNumber: 0,
      mapIndex: 0,
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);
    socketToRoom.set(socket.id, roomCode);
    emitRoomState(room);
    ack({ ok: true, roomCode });
  });

  socket.on(
    "room:join",
    async (
      payload: { roomCode?: string },
      ack: (response: RoomAckResponse) => void,
    ) => {
      const roomCode = payload.roomCode?.trim().toUpperCase() ?? "";
      const room = rooms.get(roomCode);
      if (!room) {
        ack({ ok: false, message: "Room code not found." });
        return;
      }

      const catalogStatus = await getRuntimeCatalogStatus();
      if (!catalogStatus.ready) {
        ack({ ok: false, message: catalogStatus.message });
        return;
      }

      if (room.players.length >= 2) {
        ack({ ok: false, message: "Room is already full." });
        return;
      }

      detachSocket(socket.id);
      room.players.push(socket.id);
      room.inputs.set(socket.id, getDefaultInput());
      socket.join(roomCode);
      socketToRoom.set(socket.id, roomCode);
      try {
        await startRound(room);
        ack({ ok: true, roomCode });
      } catch (error) {
        room.players = room.players.filter((id) => id !== socket.id);
        room.inputs.delete(socket.id);
        socket.leave(roomCode);
        socketToRoom.delete(socket.id);
        emitRoomState(room);
        ack({ ok: false, message: error instanceof Error ? error.message : "Could not start the round." });
      }
    },
  );

  socket.on("match:move", (payload: { move?: MoveIntent | null }) => {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) {
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      return;
    }

    const input = room.inputs.get(socket.id) ?? getDefaultInput();
    input.move = payload.move ?? null;
    room.inputs.set(socket.id, input);
  });

  socket.on("match:action", () => {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) {
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      return;
    }

    const input = room.inputs.get(socket.id) ?? getDefaultInput();
    input.actionQueued = true;
    room.inputs.set(socket.id, input);
  });

  socket.on("match:action-state", (payload: { held?: boolean }) => {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) {
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      return;
    }

    const input = room.inputs.get(socket.id) ?? getDefaultInput();
    input.actionHeld = Boolean(payload.held);
    room.inputs.set(socket.id, input);
  });

  socket.on("match:rematch", async (ack: (response: RoomAckResponse) => void) => {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) {
      ack({ ok: false, message: "You are not in a room." });
      return;
    }

    const room = rooms.get(roomCode);
    if (!room || !room.match || room.match.result === "running") {
      ack({ ok: false, message: "Rematch is not available right now." });
      return;
    }

    const catalogStatus = await getRuntimeCatalogStatus();
    if (!catalogStatus.ready) {
      ack({ ok: false, message: catalogStatus.message });
      return;
    }

    room.rematchVotes.add(socket.id);
    if (room.rematchVotes.size === 2) {
      try {
        await startRound(room, { swapRoles: true });
        ack({ ok: true, roomCode });
      } catch (error) {
        ack({ ok: false, message: error instanceof Error ? error.message : "Could not start the rematch." });
      }
      return;
    }

    emitRoomState(room);
    ack({ ok: true, roomCode });
  });

  socket.on("disconnect", () => {
    detachSocket(socket.id);
  });
});

httpServer.listen(SERVER_PORT, () => {
  const modeLabel = hasBuiltClient ? "with built client serving enabled" : "without a built client bundle";
  console.log(`${APP_TITLE} server listening on http://localhost:${SERVER_PORT} ${modeLabel}`);
  void syncMapCatalog();
});
