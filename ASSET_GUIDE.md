# Asset Guide

This prototype still uses placeholder rectangles, palette fills, and no runtime sound.

Use this guide to prepare replacement art and sound without changing gameplay code or balance values.

## Folder Conventions

Keep future client assets under:

- `client/src/assets/sprites/characters/`
- `client/src/assets/sprites/tiles/`
- `client/src/assets/sprites/props/`
- `client/src/assets/audio/sfx/`
- `client/src/assets/audio/music/`

These folders do not need to exist yet in code for v1. They are the intended landing spots for the swap.

## Art Format

- File type: transparent `PNG`
- Style target: pixel art, native-size authored, nearest-neighbor scaling
- Tile size: `32x32`
- Do not bake collision or hitbox assumptions into the art
- Keep gameplay collider sizes in `shared/src/config.ts` unless you intentionally want rebalance work

## Character Sheets

### LULU

- Frame size: `32x32`
- Base sheet layout: 4 directions x 3 frames
- Direction rows: `down`, `left`, `right`, `up`
- Frame columns: `idle`, `walk1`, `walk2`
- Optional future extras:
  - `hurt`
  - `vault`
  - `heal`
  - `death`

### Springtrap

- Recommended frame size: `48x48`
- Base sheet layout: 4 directions x 3 frames
- Direction rows: `down`, `left`, `right`, `up`
- Frame columns: `idle`, `walk1`, `walk2`
- Optional future extras:
  - `attack`
  - `stunned`
  - `vault`
  - `break`

### NPC Survivors

- Frame size: `32x32`
- Use the same 4 directions x 3 frames layout as LULU
- If all NPC survivors share one sheet, that is fine for v1

## Alignment Rules

- Center all actor art on the body / feet anchor, not the canvas edge
- Transparent padding is fine
- LULU visually reads smaller than Springtrap, but that should come from the art, not a collider change
- A sprite may extend beyond its collider footprint visually

## World Art

### Tiles

Prepare `32x32` tiles for:

- floor base
- floor alt
- floor accent
- wall
- rock
- car
- ledge
- gate closed
- gate open

### Props / Interactables

Prepare `32x32` or compact prop sprites for:

- upright pallet
- dropped pallet horizontal
- dropped pallet vertical
- broken pallet debris

If you prefer one prop atlas instead of separate files, that is fine.

## Suggested File Names

The exact filenames are not wired yet, but this naming scheme will slot in cleanly:

- `client/src/assets/sprites/characters/lulu.png`
- `client/src/assets/sprites/characters/springtrap.png`
- `client/src/assets/sprites/characters/npc-survivor.png`
- `client/src/assets/sprites/tiles/world-tiles.png`
- `client/src/assets/sprites/props/chase-props.png`

## Sound Format

Runtime sound is still intentionally disabled in this pass, but if you want to prepare files now use:

- Primary format: `OGG`
- Optional fallback: `MP3`
- Target sample rate: `44.1 kHz`
- Keep one-shots short and dry
- Keep loops seamless and minimal

## Minimum Sound List

Prepare short clips for:

- `ui-confirm`
- `attack-swing`
- `attack-hit`
- `hurt-lulu`
- `kill`
- `pallet-drop`
- `pallet-break`
- `vault-lulu`
- `vault-springtrap`
- `heal-start`
- `heal-complete`
- `gate-open`
- `round-win`
- `round-lose`

Optional:

- one short ambient loop for menus or the match

## Swap Notes

- The rendering hook for placeholder characters and props currently lives in `client/src/game/GameScene.ts`
- The map color and object layout live in `shared/src/maps.ts`
- The separate `map-editor` app exports authored JSON into `maps/custom/`
- Valid custom map files are scanned by the server and appended to the normal rotation
- Keep world coordinates, state ownership, and timing in shared gameplay code unchanged unless you want follow-up tuning
