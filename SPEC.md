# Run, Lulu, Run Spec

## Scope

- Modify the existing project in place. Do not rebuild unrelated systems.
- Keep the current repo split:
  - `client`: Phaser 3 + TypeScript + Vite
  - `server`: Node.js + Express + Socket.IO
  - `shared`: shared gameplay/config/types/map logic
  - `map-editor`: separate authored-map tool
- Treat this task as two phases:
  - bounded maintainability/refactor pass
  - feature/presentation pass
- Preserve the working build through both phases.

## Current Baseline Audit

### 1. Rendering and camera

- Runtime rendering lives in `client/src/game/GameScene.ts`.
- The game uses one Phaser scene and draws the whole world with `Phaser.GameObjects.Graphics`.
- Actors, obstacles, pallets, generators, fog, and indicators are procedural rectangles and shapes, not sprite assets.
- Camera follow is manual:
  - camera bounds are set from map size
  - scroll is clamped around the local role actor each frame
  - `roundPixels` is enabled
- Fog of war is drawn as a per-tile overlay using `canSeePoint()`.

### 2. Scene flow

- Phaser currently has one scene only: the match/backdrop scene.
- Flow outside the match is handled in `client/src/main.ts` with DOM overlays:
  - splash
  - join
  - waiting room
  - connecting
  - round end
- The game canvas is always mounted underneath the DOM shell.

### 3. HUD and overlay layout

- The visible HUD is a DOM overlay created in `client/src/main.ts`.
- Layout uses dashboard-like panels:
  - outer app shell
  - top strip
  - framed stage
  - boxed overlay cards
- `GameScene.ts` still contains hidden Phaser text HUD fields, but the current visible HUD is the DOM version.

### 4. Asset loading pipeline

- There is no real gameplay art pipeline yet.
- Current gameplay rendering uses hard-coded colors and primitive drawing.
- `client/src/assets/` still contains starter Vite assets and one placeholder image, but they are not the real runtime pipeline.
- No current preload manifest exists for sprites, textures, or music.

### 5. Sprite sizing and scale rules

- Current actor visuals are tied directly to collider rectangles:
  - LULU collider: `14 x 14`
  - NPC collider: `14 x 14`
  - Springtrap collider: `20 x 20`
- There is no distinction between collision size and displayed art size.
- Pixel-art-safe rendering is partially configured:
  - Phaser `pixelArt: true`
  - canvas CSS uses `image-rendering: pixelated`
- The current visuals are crisp because they are vector-like shapes, not because a sprite intake/scaling system exists.

### 6. Map tile sizing and world-to-screen sizing

- Shared tile size is `32 px`.
- Standard map size is `64 x 48` tiles.
- Canvas size is `960 x 640`.
- The authored map format stores tile coordinates and converts them to runtime pixel coordinates in `shared/src/mapFormat.ts`.
- World layout, camera math, LOS fog, and authored map conversion all assume `32 px` tiles.

### 7. Audio loading and playback

- There is no runtime audio loading, playback, scene swap, or browser unlock handling.
- The current docs still say sound is intentionally skipped.

### 8. Config organization

- Shared gameplay tuning is centralized in `shared/src/config.ts`.
- Presentation, HUD layout, asset intake, sprite display scale, and audio values are not centralized.
- UI copy and layout are embedded directly in `client/src/main.ts` and `client/src/styles.css`.

### 9. State separation between single-player and multiplayer

- Core simulation state is shared through `MatchState` and `stepMatch()` in `shared/src/engine.ts`.
- Session ownership is split cleanly at the runtime edge:
  - `LocalSinglePlayerSession.ts`
  - `NetworkSession.ts`
- Multiplayer is server authoritative.
- The engine still contains some mode-specific branches for:
  - NPC rules
  - Springtrap AI
  - repair cues
- The state keeps both:
  - `springtrap` as the primary alias
  - `springtraps[]` as the active list

### 10. Obvious duplication, dead code, and brittle paths

- `client/src/main.ts` is the biggest brittle point:
  - app-shell DOM creation
  - menu flow
  - room flow
  - HUD sync
  - debug state output
  - prompts
  - session startup
  - overlay rendering
  - button event wiring
  - query param handling
- `GameScene.ts` still carries hidden HUD/title text objects that no longer drive the visible UI.
- The dashboard shell in `styles.css` fights the desired presentation.
- Asset loading is absent, so new art/audio intake currently has nowhere durable to land.

## Phase 1: Bounded Maintainability Pass

### Goals

- Improve project structure where it is obviously messy.
- Remove dashboard-style scene composition if it blocks a game-first presentation.
- Introduce a clean asset intake structure for art and audio.
- Improve config organization for:
  - gameplay tuning
  - visual scale
  - audio defaults
- Reduce duplication and brittle glue code.

### Guardrails

- Keep gameplay behavior unchanged during the refactor pass unless a change is required to support the requested fixes.
- Prefer conservative extractions and module boundaries over large rewrites for their own sake.
- Keep single-player and multiplayer behavior separation explicit where it already matters.
- Document structural changes in `PROGRESS.md`.

## Phase 2: Feature and Presentation Pass

### A. Gameplay balance

- Springtrap remains faster than LULU.
- In a perfectly straight run, Springtrap still eventually catches LULU.
- The gap closes more slowly than in the current build.
- The change must be small and config-driven.

### B. Art intake and integration

- Consume incoming assets from the repo-level `assets/` folder for this pass.
- Create a durable asset folder structure under the client runtime.
- Use provided art where it clearly maps to:
  - LULU directional sprites
  - Springtrap directional sprites
  - NPC directional sprites
  - pallet states
  - walls
  - cars
  - rocks
  - floor variants
  - gate states
- If a category is missing, keep placeholders or procedural fallbacks.
- Record all mapping assumptions in `ASSET_INTAKE.md`.

### C. Presentation direction

- The game should launch like a game, not a dashboard.
- Remove boxed app-shell framing, descriptive copy, and dashboard card styling from the default experience.
- The game world should own the screen.
- UI should stay lean and game-like.
- The supplied splash artwork should drive the title screen composition.
- Place the displayed title in the top-left quadrant and the main action buttons in the bottom-right quadrant without covering the character art.

### D. Character readability

- Character art must read clearly.
- LULU should have more screen presence.
- Preserve honest collisions even if display size grows beyond collider size.
- If sprite display size and collision size differ, handle the relationship intentionally.

### E. Audio

- Keep one fixed title-screen music slot.
- Add two gameplay round music slots.
- Alternate gameplay tracks only after a real round end.
- If a track ends before the round does, loop the active round track instead of switching.
- Handle browser audio unlock gracefully.
- Swap or stop music cleanly across scene changes.
- Keep sensible default volume levels in config.

### F. Title screen and displayed branding

- Launch directly into a true title screen.
- Displayed title must be `Run, Lulu, Run`.
- Repo/internal naming may remain `Dead by Lulu`.
- The title screen should be composed from the supplied visual language rather than a dashboard card.
- Keep the title screen minimal, polished, and game-like.

## Visual and Asset Rules

- Pixel art must stay crisp.
- Do not blur sprites.
- Use nearest-neighbor or equivalent pixel-safe scaling.
- New art is square but not authored to the old `32 x 32` assumption.
- Readability is more important than forcing every sprite into a tiny old footprint.

## Technical Requirements

- Keep gameplay tuning in config.
- Keep presentation and audio tuning in config where practical.
- Keep touch-control sizing and behavior tunable in client config where practical.
- Missing asset categories must fall back gracefully.
- Actors must stay fully inside the playable world bounds in both single-player and multiplayer.
- Each live round must use 10 generators.
- The exit gate must stay closed until all 10 live generators are repaired.
- Runtime generator picks should continue to come from authored spawn points and randomize on each map load when more than 10 authored options exist.
- Runtime map rotation must use exactly 2 valid custom maps from `maps/custom/`.
- Built-in maps remain available for editor/template use, but not live runtime rotation.
- Single-player start, room create, room join, and rematch must fail gracefully when the runtime custom-map requirement is not met.
- Keep authored maps and runtime maps compatible with the current `32 px` tile world unless a visual scaling layer changes only presentation.
- Mobile browsers must have a first-class control path:
  - no physical keyboard required
  - touch movement and action inputs must work in both single-player and multiplayer
  - desktop keyboard controls must remain available
- Preserve:
  - type safety
  - build stability
  - single-player session flow
  - multiplayer room flow
  - map-editor compatibility

## Runtime Catalog And Deployment

- The server map-catalog response must expose:
  - the playable runtime map list
  - readiness state
  - a human-readable readiness/error message
  - the required custom-map count
- The client preflight must use that readiness data before starting local or network play.
- Client/server origin resolution must move out of shared gameplay config.
- Local split dev should continue using the Vite client plus standalone server.
- Production deployment should support one hosted service that:
  - serves the built client
  - exposes `/health`
  - exposes `/maps`
  - runs Socket.IO on the same public origin

## Validation Requirements

- After each major milestone:
  - run `npm run typecheck`
  - run `npm run build`
  - run the app locally
  - update `PROGRESS.md`
- Final documentation must include:
  - refactor summary
  - old and new Springtrap values
  - asset mappings
  - placeholder fallbacks that remain
  - audio assignments
  - splash-art intake mapping
  - 10-generator objective notes
  - strict custom-map runtime rules
  - temporary hosting handoff
  - grounded assumptions and ambiguities
