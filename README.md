# Run, Lulu, Run

In-game displayed title: `Run, Lulu, Run`

Small desktop-first browser prototype built with:

- Client: Phaser 3 + TypeScript + Vite
- Server: Node.js + Socket.IO
- Separate local `map-editor` tool: Vite + TypeScript
- One repo with separate `client`, `server`, `shared`, and `map-editor` folders
- No accounts, no database, no persistence between sessions

## What Is Built

- Single-player:
  - Human plays as LULU
  - 1 AI AYU uses the Hunt / Chase / Search / Cooldown loop
- Multiplayer:
  - 2 human players by room code
  - Server-authoritative match state
  - First round roles are random
  - If both players click `Play Again`, roles swap next round
- Core prototype systems:
  - Full-screen game-first title screen using the supplied splash artwork with displayed title `Run, Lulu, Run`
  - Runtime music support with browser-input unlock handling
  - Fixed title music plus alternating gameplay round music
  - Sprite-backed character and environment presentation using the supplied art intake
  - Faster smooth four-direction movement
  - Fog of war and line-of-sight blocking
  - Attack, injury, death, burst
  - Treasure chests with timed opens and role-specific boosts
  - Generator objective with 10 live generators per round
  - Gate opens only after all 10 generators are repaired
  - Structural ledges and pallets that either stun AYU on hit or linger briefly and slow AYU on a miss
  - Stickier single-player AYU chase flow
  - NPC survivor wander / generator-help / flee behavior
  - Single-player NPC survivors that stay invincible, repair slowly, and can heal LULU once each
  - Multiplayer NPC survivors that can be injured, killed, and repair faster than in single-player
  - Permanent multiplayer compass arrow from AYU toward LULU, with temporary disable from the flashlight boost
  - Strict custom-only runtime rotation from `maps/custom/`
  - Built-in QA map kept as a map-editor template only

## Install

```bash
npm install
```

That installs the root tools plus the `client`, `server`, and `map-editor` dependencies through the root `postinstall` hook.

## Run The Game

```bash
npm run dev
```

Services:

- Game client: [http://127.0.0.1:5173](http://127.0.0.1:5173)
- Server health check: [http://127.0.0.1:3001/health](http://127.0.0.1:3001/health)
- Server map catalog: [http://127.0.0.1:3001/maps](http://127.0.0.1:3001/maps)

## Run The Production-Style Server

```bash
npm run build
npm run start:prod
```

That serves the built client and Socket.IO server from one origin on port `3001`, which matches the production deployment shape used for Render.

## Run The Separate Map Editor

```bash
npm run dev:map-editor
```

Map editor:

- Local tool: [http://127.0.0.1:5174](http://127.0.0.1:5174)

## Build And Checks

```bash
npm run typecheck
npm run build
npm run check
```

## Controls

- Move: `WASD` or arrow keys
- `Space` context:
  - LULU: tap `Space` near a pallet to drop it, hold `Space` while standing still to repair or heal
  - LULU: hold `Space` near a treasure chest to open it and gain either armor or a flashlight
  - Human-controlled LULU or AYU: move into a ledge and tap `Space` to vault
  - Human-controlled AYU: `Space` attacks when a vault is not starting, and also opens treasure chests when standing still beside one
- Touch devices:
  - live rounds show a left thumbstick plus a right `ACT` button automatically
  - drag the thumbstick to move
  - tap `ACT` for quick actions like attacking, vaulting, or dropping a pallet
  - hold `ACT` while standing still to repair or heal
  - landscape orientation gives you much more map view than portrait
- Fullscreen: `F`

## Title Flow

The game client now starts on a full-screen title screen with:

- The copied splash artwork as the backdrop
- The title anchored in the top-left quadrant
- The main action buttons anchored in the bottom-right quadrant
- `1 Player`
- `2 Players`
- `Join Game`

### 1 Player

- Loads the current server-backed map catalog.
- Blocks with a clear message unless exactly `2` valid custom maps exist in `maps/custom/`.
- Starts a local single-player round.
- Uses the same strict 2-map custom rotation as the multiplayer server.

### 2 Players

- Loads the map catalog.
- Blocks room creation with a clear message unless exactly `2` valid custom maps exist in `maps/custom/`.
- Shows a 4-character room code.
- Shows a `Copy Invite Link` button.
- Waits in the lobby until player 2 joins.

### Join Game

- Opens a manual room-code entry screen.
- Blocks joining with a clear message unless the runtime 2-map requirement is still valid.
- Invite links use `?room=CODE`.
- Opening an invite link pre-fills the join flow automatically.

## Plain-English Test Steps

### Test the current single-player build

1. Open PowerShell in `D:\DEAD BY LULU`.
2. Run `npm install` once.
3. Run `npm run dev`.
4. Open [http://127.0.0.1:5173](http://127.0.0.1:5173).
5. Click `1 Player`.
6. Move with `WASD` or the arrow keys.
7. Walk into a ledge without pressing `Space` and confirm LULU stops instead of auto-vaulting.
8. Move into the same ledge and tap `Space` to confirm LULU vaults it.
9. Run around walls and rocks to feel the collision.
10. Let AYU find you.
11. Take one hit and confirm LULU becomes injured and gets a short speed burst.
12. Find a generator and hold `Space` while standing near it.
13. Stop repairing and come back to confirm the progress stayed where you left it.
14. If you get injured, move next to a living NPC survivor and hold `Space` to heal faster than a full generator repair, and confirm the heal shows visible progress.
15. Watch the NPC survivors and confirm they move early in the round, look for generators, and flee when AYU gets close.
16. Hold `Space` on a generator and confirm AYU turns hard toward you quickly, even from far away.
17. Break line of sight around structures and confirm AYU does not stop chasing the instant you round one corner.
18. Chase through ledges and confirm AYU routes through them instead of waiting outside the opening.
19. After a real escape, confirm AYU keeps moving through search / cooldown instead of freezing in place.
20. Hold `Space` near a treasure chest and confirm LULU gains either armor or the 30-second flashlight beam.
21. Press `Space` near an upright pallet and confirm a hit still stuns AYU, while a miss leaves the pallet down briefly and slows AYU while crossing it.
22. Repair all 10 generators, then run to the open gate to win.

### Test the current multiplayer build

1. Keep `npm run dev` running.
2. Open the game in two browser windows.
3. In window 1, click `2 Players`.
4. In window 2, either:
   - click `Join Game` and type the room code, or
   - use the invite link from window 1
5. Confirm the round starts automatically when player 2 joins.
6. As LULU, walk to a generator and hold `Space` to repair.
7. As AYU, walk into a ledge without `Space` and confirm you stop at it, then move into it and tap `Space` to vault.
8. As AYU, confirm the HUD always shows the compass arrow toward LULU in multiplayer.
9. Attack an NPC survivor twice and confirm:
   - first hit injures
   - second hit kills
   - dead NPCs stop contributing generator pressure
10. As LULU, open a treasure chest and confirm you get either armor or the flashlight.
11. As AYU, open a treasure chest and confirm you get either the heart charm beam or the wrench projectile.
12. Play until the round ends.
13. Click `Play Again` in both windows.
14. Confirm the next round swaps the roles.

### Stop everything

1. Go back to PowerShell.
2. Press `Ctrl+C`.

## Separate Map Editor Workflow

The map editor is not part of the player-facing game. It is a separate local tool.

ELI5 workflow for making the 2 maps this build expects:

1. Run `npm run dev:map-editor`.
2. Open [http://127.0.0.1:5174](http://127.0.0.1:5174).
3. Leave the default QA map loaded if you want a starting template, or click `New Blank Map` if you want to start from nothing.
4. Make one full map on the `64 x 48` grid.
5. Place the required things:
   - at least 10 generator spawns
   - 1 gate
   - 1 LULU spawn
   - 1 AYU spawn
   - exactly 4 NPC spawns
6. If you want the game to choose a different mix of 10 generators each time the map loads, place more than 10 generator spawns.
7. Add obstacles, ledges, pallets, and palette colors wherever you want them.
8. Click `Export JSON` or `Download JSON`.
9. Save that file into `maps/custom/`.
10. Repeat the same process for your second map, so `maps/custom/` ends up with exactly `2` valid JSON files.
11. Refresh the main game.
12. The game only starts when there are exactly `2` valid custom maps there, and then it alternates between those 2 maps in id order.

## Custom Map Files

- Folder: `maps/custom/`
- File type: `.json`
- Format: authored tile-based JSON from the separate map editor
- This build requires exactly `2` valid custom maps in the folder for runtime play.
- Valid maps are loaded by the server.
- Invalid maps are skipped with a warning instead of crashing the app.
- Duplicate ids are skipped.
- If there are `0`, `1`, or more than `2` valid custom maps, runtime play stays blocked with a clear message.
- Each live round uses exactly `10` generators.
- If a map only has exactly `10` generator spawns, it will still use those same 10 locations every time.
- If you want per-round variety, author more than `10` generator spawns on that map.

Current authored JSON contract:

- `id`
- `name`
- `widthTiles`
- `heightTiles`
- `palette`
- `obstacles`
- `ledges`
- `pallets`
- `generatorSpawns`
- `gate`
- `spawns`

## Temporary Hosting ELI5

Recommended temporary path: Render Free Web Service.

1. Put the repo on GitHub.
2. Make a new Render Web Service that points at this repo.
3. Use the build command `npm install && npm run build`.
4. Use the start command `npm run start:prod`.
5. Let Render finish the first deploy.
6. Open the public `onrender.com` URL Render gives you.
7. Send that URL to your friend.

Why this is the best fit here:

- It gives you a real public website URL.
- It supports the web app and Socket.IO server on one origin.
- It does not make you buy a domain first.
- It is a cleaner next step than tunnel-only sharing if you want to keep iterating later.

## Asset Prep

See [ASSET_GUIDE.md](/D:/DEAD%20BY%20LULU/ASSET_GUIDE.md) for:

- exact art sizes
- recommended sprite sheet layouts
- sound file formats
- folder conventions
- future asset swap notes

Current organized runtime assets live under [client/public/game-assets](/D:/DEAD%20BY%20LULU/client/public/game-assets).

## Repo Layout

- `SPEC.md`: locked game rules, values, scope, and non-goals
- `PLAN.md`: milestone order and validation steps
- `PROGRESS.md`: work log and validation log
- `ASSET_GUIDE.md`: art and sound prep spec
- `maps/custom/`: drop-in custom map folder
- `client/`: Phaser/Vite browser client
- `server/`: Socket.IO authoritative room server
- `shared/`: shared config, map data, sight logic, gameplay simulation, and map format helpers
- `map-editor/`: separate local authored-map tool

## Key Files

- Shared tuning values: [shared/src/config.ts](/D:/DEAD%20BY%20LULU/shared/src/config.ts)
- Shared simulation: [shared/src/engine.ts](/D:/DEAD%20BY%20LULU/shared/src/engine.ts)
- Shared map registry: [shared/src/maps.ts](/D:/DEAD%20BY%20LULU/shared/src/maps.ts)
- Shared map format helpers: [shared/src/mapFormat.ts](/D:/DEAD%20BY%20LULU/shared/src/mapFormat.ts)
- Frontend shell: [client/src/main.ts](/D:/DEAD%20BY%20LULU/client/src/main.ts)
- Local map-catalog loader: [client/src/game/mapCatalog.ts](/D:/DEAD%20BY%20LULU/client/src/game/mapCatalog.ts)
- Multiplayer server: [server/src/index.ts](/D:/DEAD%20BY%20LULU/server/src/index.ts)
- Server custom-map loader: [server/src/mapCatalog.ts](/D:/DEAD%20BY%20LULU/server/src/mapCatalog.ts)
- Separate editor UI: [map-editor/src/MapEditorController.ts](/D:/DEAD%20BY%20LULU/map-editor/src/MapEditorController.ts)

## Notes

- Runtime audio is now enabled.
- Title music uses:
  - [client/public/game-assets/audio/music/shared-theme.wav](/D:/DEAD%20BY%20LULU/client/public/game-assets/audio/music/shared-theme.wav)
- Gameplay rounds alternate between:
  - [client/public/game-assets/audio/music/shared-theme.wav](/D:/DEAD%20BY%20LULU/client/public/game-assets/audio/music/shared-theme.wav)
  - [client/public/game-assets/audio/music/round-b-theme.wav](/D:/DEAD%20BY%20LULU/client/public/game-assets/audio/music/round-b-theme.wav)
- There is a QA-only client query flag for local AYU control during development:
  - `http://127.0.0.1:5173/?debugRole=springtrap`
  - The query value still uses `springtrap` for internal compatibility.
  - This is only for local verification and is not part of the intended player flow.
- The Vite production build still emits a large client chunk warning because Phaser remains bundled into a large client chunk, but the build succeeds.
- Optional single-player AI debug overlay:
  - `http://127.0.0.1:5173/?debugAi=1`
  - shows the current AYU AI state, state timer, sight-loss timer, last confirmed LULU position, and current Hunt target
