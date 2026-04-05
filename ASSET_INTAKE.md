# Asset Intake Log

## Intake Pass - 2026-03-26 (Pre-Implementation Audit)

### Source folder

- Incoming assets currently present at [assets](/D:/DEAD%20BY%20LULU/assets).

### Current runtime state

- The game does not currently load gameplay art or audio.
- Runtime visuals are procedural shapes drawn in `client/src/game/GameScene.ts`.
- Runtime music is not implemented yet.

### Supplied PNG audit

- All discovered PNG files in the incoming folder are `300 x 300`.
- The supplied art is much larger than the current logical collider rectangles and should not be forced directly into the old tiny display footprint.

### Inferred sprite groups

- LULU directional set:
  - `lulu_up.png`
  - `lulu_up_2.png`
  - `lulu_up_3.png`
  - `lulu_down.png`
  - `lulu_down_2.png`
  - `lulu_down_3.png`
  - `lulu_left.png`
  - `lulu_left_2.png`
  - `lulu_left_3.png`
  - `lulu_right.png`
  - `lulu_right_2.png`
  - `lulu_right_3.png`
- Springtrap directional set:
  - `springtrap_up*.png`
  - `springtrap_down*.png`
  - `springtrap_left*.png`
  - `springtrap_right*.png`
- NPC directional set:
  - `npc_up*.png`
  - `npc_down*.png`
  - `npc_left*.png`
  - `npc_right*.png`
- Environment candidates:
  - `floor.png`
  - `floor_alt.png`
  - `wall_horizontal.png`
  - `wall_vertical.png`
  - `car.png`
  - `rock.png`
  - `gate_closed.png`
  - `gate_open.png`
  - `Pallet.png`
  - `Pallet_down.png`

### Grounded naming assumptions

- The user referenced plural labels like `walls` and `cars`, but the actual files are singular. The runtime intake should normalize that to consistent internal asset keys.
- `Pallet.png` is assumed to be the upright pallet.
- `Pallet_down.png` is assumed to be the used/down pallet presentation.
- `wall_horizontal.png` and `wall_vertical.png` are assumed to be orientation-specific wall visuals rather than separate obstacle categories.
- `npc_*` and `springtrap_*` were not called out in the request list, but they exist in the incoming folder and appear to be intended gameplay sprites, so they should be integrated if the runtime structure supports them.

### Audio audit

- Discovered audio files:
  - `music.wav`
- Metadata for `music.wav`:
  - duration: `139.92s`
  - sample rate: `48000 Hz`
  - channels: `2`
- No second music file was found in the repo during the pre-implementation audit.

### Audio assumption

- The requested final behavior needs one title track and one gameplay track.
- Current intake only contains one track, so the implementation should:
  - keep audio scene assignment configurable
  - avoid breaking when only one track exists
  - document the fallback clearly

## Organized Runtime Intake - 2026-03-26 (Maintainability Pass)

### Runtime asset root

- Organized runtime copies now live under [client/public/game-assets](/D:/DEAD%20BY%20LULU/client/public/game-assets).

### Organized destinations

- LULU:
  - [client/public/game-assets/characters/lulu/up](/D:/DEAD%20BY%20LULU/client/public/game-assets/characters/lulu/up)
  - [client/public/game-assets/characters/lulu/down](/D:/DEAD%20BY%20LULU/client/public/game-assets/characters/lulu/down)
  - [client/public/game-assets/characters/lulu/left](/D:/DEAD%20BY%20LULU/client/public/game-assets/characters/lulu/left)
  - [client/public/game-assets/characters/lulu/right](/D:/DEAD%20BY%20LULU/client/public/game-assets/characters/lulu/right)
- Springtrap:
  - [client/public/game-assets/characters/springtrap/up](/D:/DEAD%20BY%20LULU/client/public/game-assets/characters/springtrap/up)
  - [client/public/game-assets/characters/springtrap/down](/D:/DEAD%20BY%20LULU/client/public/game-assets/characters/springtrap/down)
  - [client/public/game-assets/characters/springtrap/left](/D:/DEAD%20BY%20LULU/client/public/game-assets/characters/springtrap/left)
  - [client/public/game-assets/characters/springtrap/right](/D:/DEAD%20BY%20LULU/client/public/game-assets/characters/springtrap/right)
- NPC:
  - [client/public/game-assets/characters/npc/up](/D:/DEAD%20BY%20LULU/client/public/game-assets/characters/npc/up)
  - [client/public/game-assets/characters/npc/down](/D:/DEAD%20BY%20LULU/client/public/game-assets/characters/npc/down)
  - [client/public/game-assets/characters/npc/left](/D:/DEAD%20BY%20LULU/client/public/game-assets/characters/npc/left)
  - [client/public/game-assets/characters/npc/right](/D:/DEAD%20BY%20LULU/client/public/game-assets/characters/npc/right)
- Environment:
  - [client/public/game-assets/environment/tiles/floor](/D:/DEAD%20BY%20LULU/client/public/game-assets/environment/tiles/floor)
  - [client/public/game-assets/environment/obstacles](/D:/DEAD%20BY%20LULU/client/public/game-assets/environment/obstacles)
  - [client/public/game-assets/environment/interactables/gate](/D:/DEAD%20BY%20LULU/client/public/game-assets/environment/interactables/gate)
  - [client/public/game-assets/environment/interactables/pallet](/D:/DEAD%20BY%20LULU/client/public/game-assets/environment/interactables/pallet)
- Audio:
  - [client/public/game-assets/audio/music/shared-theme.wav](/D:/DEAD%20BY%20LULU/client/public/game-assets/audio/music/shared-theme.wav)

### Current runtime mapping notes

- Directional character sets were normalized to `frame-0.png` through `frame-2.png` per direction.
- Environment filenames were normalized to lower-case kebab-case where practical:
  - `wall-horizontal.png`
  - `wall-vertical.png`
  - `upright.png`
  - `down.png`
- The only discovered music file was copied as `shared-theme.wav` so title and gameplay scene assignment can safely fall back to one shared track until a second track exists.

## Final Integration Notes - 2026-03-26

### Integrated categories

- LULU directional sprites: integrated
- Springtrap directional sprites: integrated
- NPC directional sprites: integrated
- Floor base and alt textures: integrated
- Wall textures: integrated
- Car texture: integrated
- Rock texture: integrated
- Gate closed/open textures: integrated
- Pallet upright/down textures: integrated

### Runtime cleanup applied

- The copied runtime versions of `car`, `rock`, `gate`, and `pallet` assets had their flat green backing removed in `client/public/game-assets/...` so they sit on top of the in-game floor instead of rendering inside opaque green boxes.
- The source intake folder at [assets](/D:/DEAD%20BY%20LULU/assets) was left unchanged.

### Audio assignment

- Title screen music:
  - fallback assignment -> [client/public/game-assets/audio/music/shared-theme.wav](/D:/DEAD%20BY%20LULU/client/public/game-assets/audio/music/shared-theme.wav)
- Gameplay music:
  - fallback assignment -> [client/public/game-assets/audio/music/shared-theme.wav](/D:/DEAD%20BY%20LULU/client/public/game-assets/audio/music/shared-theme.wav)
- Reason:
  - only one discovered source track exists in the repo during this pass

### Placeholder/procedural categories that remain

- Generators still use procedural placeholder visuals
- Ledges still use procedural line visuals
- NPC death/corpse art still uses procedural placeholder visuals
- Attack telegraph and repair-arrow indicators still use procedural overlay graphics

### Final grounded assumptions

- Because only one audio file was present, the safest non-blocking implementation was to wire one shared track for both title and gameplay cues until a second file is supplied.
- `Pallet_down.png` is used for the non-upright runtime pallet state even though the current gameplay loop uses `respawning` instead of a persistent dropped pallet state.

### Open mapping items to finalize after integration

- Exact sprite display scale relative to the `32 px` world grid.
- Whether floor art should be tiled directly or used through a larger repeating texture pattern.
- Whether downed pallet art should map to the current respawn state presentation or remain a placeholder-only optional state.
- Final title-track versus gameplay-track assignment once the audio set is confirmed.

## Runtime Audio Update - 2026-04-03

### New copied runtime audio asset

- The newly supplied gameplay track was copied into the project at:
  - [client/public/game-assets/audio/music/round-b-theme.wav](/D:/DEAD%20BY%20LULU/client/public/game-assets/audio/music/round-b-theme.wav)
- Source used for the copy:
  - `C:\Users\sadne\Desktop\zombies (Remastered x3) (Edit) (Edit) (Edit) (Edit).wav`
- Because the runtime copy now exists inside the project, the original desktop file is no longer required by the build.

### Updated audio assignment

- Title screen music:
  - [client/public/game-assets/audio/music/round-d-theme.wav](/D:/DEAD%20BY%20LULU/client/public/game-assets/audio/music/round-d-theme.wav)
- Gameplay round music A:
  - [client/public/game-assets/audio/music/round-c-theme.wav](/D:/DEAD%20BY%20LULU/client/public/game-assets/audio/music/round-c-theme.wav)
- Gameplay round music B:
  - [client/public/game-assets/audio/music/round-d-theme.wav](/D:/DEAD%20BY%20LULU/client/public/game-assets/audio/music/round-d-theme.wav)

### Additional copied runtime audio assets - 2026-04-05

- The newly supplied gameplay tracks were copied into the project at:
  - [client/public/game-assets/audio/music/round-c-theme.wav](/D:/DEAD%20BY%20LULU/client/public/game-assets/audio/music/round-c-theme.wav)
  - [client/public/game-assets/audio/music/round-d-theme.wav](/D:/DEAD%20BY%20LULU/client/public/game-assets/audio/music/round-d-theme.wav)
- Source files used for the copies:
  - `C:\Users\sadne\Desktop\starstruckrunlulurun.wav`
  - `C:\Users\sadne\Desktop\pink noiserunlulurun.wav`
- Because the runtime copies now exist inside the project, the original desktop WAV files are no longer required by the build.

### Runtime behavior notes

- Title music stays fixed.
- Title music now uses the newly supplied `pink noiserunlulurun.wav` runtime copy.
- Gameplay music alternates only after a real round ends.
- If a gameplay track reaches the end before the round does, that same track loops for the rest of the round.
- The gameplay round rotation now cycles through the 2 newly supplied tracks only: A -> B -> A.
- The earlier gameplay tracks based on `shared-theme.wav` and `round-b-theme.wav` are no longer used for round rotation.
- Runtime map rotation now blocks unless exactly 2 valid custom maps are present in `maps/custom/`.

## Runtime Splash Artwork Update - 2026-04-04

### New copied runtime title asset

- The supplied splash artwork was copied into the project at:
  - [client/public/game-assets/ui/title-splash.jpg](/D:/DEAD%20BY%20LULU/client/public/game-assets/ui/title-splash.jpg)
- Source used for the copy:
  - `D:\iCloudDrive\Untitled_Artwork.jpg`
- Because the runtime copy now exists inside the project, the original external image file is no longer required by the build.

### Title-screen mapping notes

- The copied artwork is used as the full-screen title backdrop.
- The displayed `Run, LULU, Run` title is layered in the top-left quadrant in DOM/CSS instead of being baked into the image file.
- The `1 Player`, `2 Players`, and `Join Game` actions are layered in the bottom-right quadrant.
- The original art file was not destructively edited; the title and buttons remain layout-controlled so they can be moved later without re-exporting the image.

## AYU Chest And Gate Asset Update - 2026-04-04

### New copied runtime assets

- The supplied chest, pickup, effect, and gate artwork was copied into the project at:
  - [client/public/game-assets/environment/interactables/chest/closed.png](/D:/DEAD%20BY%20LULU/client/public/game-assets/environment/interactables/chest/closed.png)
  - [client/public/game-assets/environment/interactables/chest/open.png](/D:/DEAD%20BY%20LULU/client/public/game-assets/environment/interactables/chest/open.png)
  - [client/public/game-assets/environment/pickups/flashlight.png](/D:/DEAD%20BY%20LULU/client/public/game-assets/environment/pickups/flashlight.png)
  - [client/public/game-assets/environment/pickups/wrench.png](/D:/DEAD%20BY%20LULU/client/public/game-assets/environment/pickups/wrench.png)
  - [client/public/game-assets/environment/pickups/heart-charm.png](/D:/DEAD%20BY%20LULU/client/public/game-assets/environment/pickups/heart-charm.png)
  - [client/public/game-assets/environment/pickups/armor.png](/D:/DEAD%20BY%20LULU/client/public/game-assets/environment/pickups/armor.png)
  - [client/public/game-assets/ui/effects/charm.png](/D:/DEAD%20BY%20LULU/client/public/game-assets/ui/effects/charm.png)
  - [client/public/game-assets/ui/effects/flashlight.png](/D:/DEAD%20BY%20LULU/client/public/game-assets/ui/effects/flashlight.png)
  - [client/public/game-assets/environment/interactables/gate/closed.png](/D:/DEAD%20BY%20LULU/client/public/game-assets/environment/interactables/gate/closed.png)
  - [client/public/game-assets/environment/interactables/gate/open.png](/D:/DEAD%20BY%20LULU/client/public/game-assets/environment/interactables/gate/open.png)

### Source files used for the copies

- `D:\iCloudDrive\Calligraphy\IMG_3508 7.png`
- `D:\iCloudDrive\Calligraphy\IMG_3508 8.png`
- `D:\iCloudDrive\Calligraphy\IMG_3508.png`
- `D:\iCloudDrive\Calligraphy\IMG_3508 2.png`
- `D:\iCloudDrive\Calligraphy\IMG_3508 6.png`
- `D:\iCloudDrive\Calligraphy\IMG_3508 4.png`
- `D:\iCloudDrive\Calligraphy\IMG_3508 3.png`
- `D:\iCloudDrive\Calligraphy\IMG_3508 5.png`
- `D:\iCloudDrive\Calligraphy\IMG_3508 9.png`

### Mapping notes

- The new gate art replaced the previous runtime gate closed/open files in place.
- Treasure chests now use dedicated closed/open chest sprites instead of procedural placeholder boxes.
- The floating chest reward uses the copied pickup art for flashlight, wrench, heart charm, and armor.
- The flashlight and heart charm gameplay effects still use procedural beam graphics for clarity, while the copied effect icons are kept in the project for future presentation passes.
- Player-facing naming now calls the killer `AYU`, but the existing character compatibility folders still use `springtrap` in file paths so older asset wiring and debug URLs do not break.

### Cleanup note

- Because the runtime copies now exist inside the project, the original external source PNGs are no longer required by the build.
