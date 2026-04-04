# AGENTS.md

## Working Agreement

- Modify this project in place. Do not rebuild it from scratch.
- Preserve the working build while making targeted changes.
- Prefer bounded refactors over large rewrites.
- If a refactor does not clearly improve structure, readability, asset handling, config, scene organization, or iteration speed, do not do it.

## Presentation Rules

- This project must not look like a dashboard or boxed web app shell.
- The game should visually own the screen on launch.
- Keep UI lean and game-like.
- Remove unnecessary descriptive copy and dashboard framing.
- The game should launch into a true title screen, not a dashboard.
- The displayed on-screen title is `Run, Lulu, Run`.

## Pixel-Art Rules

- Pixel art must stay crisp.
- Do not blur sprites.
- Use nearest-neighbor style scaling or equivalent pixel-safe rendering.
- Do not introduce smoothing that makes sprites soft or muddy.
- If larger source art needs to be downscaled, do it in a way that preserves readability.

## Asset Intake Rules

- New assets should go through a clean intake structure.
- Incoming art and audio should be organized and documented.
- Missing asset categories must gracefully fall back to placeholders or procedural visuals.
- Document all mapping assumptions in `ASSET_INTAKE.md`.
- Do not block the build because an incoming asset set is incomplete.

## Config Rules

- Tunable gameplay values belong in config.
- Tunable visual scale, presentation, and audio defaults should also live in config where practical.
- Keep client-only presentation/audio config separate from shared gameplay config when that separation improves clarity.

## Refactor and Documentation Rules

- Keep structural improvements conservative and documented.
- Document meaningful structural changes in `PROGRESS.md`.
- Update `SPEC.md`, `PLAN.md`, and `PROGRESS.md` before major implementation passes when the task scope changes materially.
- After each major milestone:
  - run `npm run typecheck`
  - run `npm run build`
  - run the app locally
  - update `PROGRESS.md`

## Scene and Runtime Rules

- Prefer explicit scene/state boundaries over monolithic UI glue.
- Keep single-player and multiplayer separation clear at the session/runtime layer.
- Preserve server-authoritative multiplayer behavior.
- Keep map-editor compatibility intact.

## Current Intent

- Title screen first.
- Crisp readable art.
- Minimal chrome.
- Strong game-first presentation.
- Clean intake path for future art and audio drops.
