# Progress Log

Original prompt: Build a small browser game prototype with this exact concept and scope. Use Phaser 3 + TypeScript + Vite for the client, Node.js + Socket.IO for the server, keep one repo with separate client and server folders, create SPEC.md / PLAN.md / PROGRESS.md first, then implement milestone by milestone with validation and progress updates after each milestone.

## Milestone 72

- Status: complete
- AYU attack-flow and AI pathing follow-up:
  - restored AYU attacks to the action button for both melee and wrench shots instead of the temporary touch-only melee shortcut
  - gave AYU ledge-crossing priority over attacking when the action press can trigger a ledge traversal, including facing-direction action vaults while standing still
  - allowed AYU to keep moving during attack windup/active frames, while preserving the existing successful-hit microstun on both melee hits and wrench hits
  - restored single-player AI melee attack decisions, removed the wrench-range retreat behavior that was backing AYU away from LULU to fish for max-range shots, and added a short committed backoff step when blocked route commits get AYU stuck on corners
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic combat/pathing probe:
    - `output/web-game/m72-attack-ai.json`
    - confirmed melee action startup now moves AYU while `lock: "attackWindup"` is active
    - confirmed successful melee hits still end with `luluLockOnHit: "hitSpin"` and `ayuLockOnHit: "hitStunned"`
    - confirmed action-press near a ledge now yields `resultingLock: "vault"` instead of an attack lock
    - confirmed wrench AI no longer moved backward in a clean firing lane
    - confirmed blocked search-route commits now reverse briefly with `commitDirection: "left"` and `commitRemainingMs: 240`
  - required Playwright helper smoke:
    - `output/web-game/m72-smoke/shot-0.png`
    - `output/web-game/m72-smoke/state-0.json`
    - visually confirmed the live client still launches and renders cleanly after the AYU combat/pathing changes

## Milestone 71

- Status: complete
- Combat readability and hit-flow follow-up:
  - hid armor glow, flashlight beam blocks, and heart charm beam blocks whenever their owner is outside the viewer's fog-of-war visibility, while still preserving local-owner visibility and AYU flash-blind hiding rules
  - removed AYU's generic post-attack recovery lock and converted unarmed hits into direct contact attacks instead of action-triggered melee swings
  - added config-backed victim spin locks and AYU hit-stun timing so successful touch hits and successful wrench hits now make LULU or NPCs spin in place while AYU briefly stalls long enough for a small escape window
  - applied the same hit-spin behavior to multiplayer NPC hits and kept single-player NPCs unharmed
  - updated single-player AI behavior so unarmed AYU now confirms damage by touch without slipping back into the old melee action lock path
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic combat probe:
    - `output/web-game/m71-combat.json`
    - confirmed multiplayer touch hits now set `luluLock: "hitSpin"` and `springtrapLock: "hitStunned"`
    - confirmed single-player AI touch hits injure LULU without entering `attackWindup` / `attackActive`
    - confirmed wrench shots clear AYU back to `lock: "none"` before impact, then apply `hitStunned` only when the projectile actually lands
    - confirmed multiplayer NPC touch hits now set `npcLock: "hitSpin"` with the same AYU hit-stun response
  - required Playwright helper smoke:
    - `output/web-game/m71-smoke/shot-0.png`
    - `output/web-game/m71-smoke/state-0.json`
    - visually confirmed the live single-player client still renders and advances without new console errors after the combat/FOW changes

## Milestone 70

- Status: complete
- Follow-up AI and readability fix:
  - tightened single-player AYU wrench logic so she only holds a ranged shot when the actual projectile lane to LULU is clear instead of relying on a center-to-center sight line that can still be blocked by nearby obstacle edges
  - added persistent carried-item icons above the owning character for flashlight, wrench, and heart charm so those active effects stay readable for their full active durations
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic AI lane probe:
    - `output/web-game/m70-wrench-lane.json`
    - confirmed a blocked lane with `centerSight: true` now leaves AYU out of `attackWindup`
    - confirmed the matching clear lane enters `attackWindup` with `actionMode = "projectile"`
  - browser icon captures:
    - `output/web-game/m70-icons/flashlight-wrench.png`
    - `output/web-game/m70-icons/flashlight-charm.png`
    - `output/web-game/m70-icons/state.json`
    - `output/web-game/m70-icons/console-errors.json`
    - visually confirmed the active-item icons render above the owning actors with no new console errors
  - required Playwright helper smoke:
    - `output/web-game/shot-0.png`
    - `output/web-game/state-0.json`

## Milestone 69

- Status: complete
- Follow-up AI combat fix:
  - single-player AYU now treats the wrench as a real ranged weapon instead of continuing to collapse to melee spacing whenever LULU is already sitting in a clean firing lane
  - added a dedicated wrench shot-lane evaluation and ranged reposition scoring path inside the shared AYU AI so projectile attacks prefer open line-of-sight lanes and better standoff spacing
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic probe:
    - `output/web-game/m69-wrench-ai.json`
    - confirmed that with wrench active and LULU already in a clear horizontal firing lane at `72px`, AI AYU stayed at the same position and entered `attackWindup` with `actionMode = "projectile"` instead of stepping closer first

## Milestone 57

- Status: complete
- Scope reset before implementation:
  - replace the round-end screen with supplied winner art and only the timer, repaired generator count, and replay/title actions
  - swap the gate closed/open runtime art with the newly supplied drawings
  - make pallet interaction and pallet stun ranges more forgiving
  - double AYU's flashlight blind duration and spin animation
  - move chest-opening progress above nearby world-object overlap
  - make multiplayer NPCs killable with a dissolve-out death presentation
  - make single-player AYU prioritize visible treasure chests only while she has no active item
- Intake/setup completed before code changes:
  - copied supplied round-end winner art into [client/public/game-assets/ui/results](/D:/DEAD%20BY%20LULU/client/public/game-assets/ui/results)
  - replaced the runtime gate textures in [client/public/game-assets/environment/interactables/gate](/D:/DEAD%20BY%20LULU/client/public/game-assets/environment/interactables/gate)
- Completed implementation:
  - replaced the old round-end summary card with a minimal winner-art result screen that only shows the round timer, repaired generator count, and `Play Again` / `Back To Title` actions
  - wired the supplied AYU-win and LULU-win artwork through client config so the round-end screen swaps art by result state without bringing back extra dashboard-style copy
  - widened pallet interaction and pallet-hit checks to `1.25` tiles so LULU can drop from one tile away and AYU still gets stunned when standing within one tile of the pallet drop
  - doubled AYU's flashlight blind window from `320ms` to `640ms` and updated the client spin presentation to rotate through `720` degrees during the blind
  - moved treasure-chest opening progress into a higher world-overlay layer so nearby walls or other objects no longer cover the progress bar
  - kept NPCs unkillable in single-player, but made multiplayer NPCs killable by AYU melee/projectile hits and added a dissolve-out death presentation with config-backed timing
  - added single-player AYU chest-priority tracking so visible treasure chests are pursued only while AYU has no active item, then chase resumes after pickup
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - ran the app locally with the dev server on `http://127.0.0.1:3001` and the client on `http://127.0.0.1:5175`
  - ran the required Playwright helper against the live client:
    - screenshot: `output/web-game/shot-0.png`
    - state: `output/web-game/state-0.json`
    - confirmed live single-player debug state showed AYU committing to a visible chest via `priorityChestId`
  - ran focused browser UI checks:
    - result screens: `output/web-game/m57-ui/ayu-win.png`, `output/web-game/m57-ui/lulu-win.png`, `output/web-game/m57-ui/result-summary.json`
    - gate art: `output/web-game/m57-browser/gate-closed.png`, `output/web-game/m57-browser/gate-open.png`
    - chest overlay fix: `output/web-game/m57-browser/chest-progress-overlap.png`, `output/web-game/m57-browser/chest-progress-overlap-crop.png`
  - ran deterministic engine verification:
    - `output/web-game/m57-engine/results.json`
    - confirmed pallet drops can start from one tile away and still stun AYU
    - confirmed flashlight blind duration now resolves to `640ms`
    - confirmed single-player NPCs stay unharmed while multiplayer NPCs die on the second hit and dissolve from `883.33ms` down to `0`
    - confirmed unarmed single-player AYU commits to a visible chest, while armed AYU keeps chasing instead of opening a chest

## Milestone 54

- Status: complete
- Scope reset before implementation:
  - add mobile-browser gameplay controls so the game no longer depends on a physical keyboard
  - preserve the existing desktop keyboard path
  - keep the implementation shared across single-player and multiplayer session flow
- Implemented:
  - added a shared client input state so keyboard and touch feed the same movement/action session APIs
  - kept keyboard control intact while moving action queue/hold handling out of direct scene event side effects
  - added a mobile touch overlay for live rounds:
    - left virtual stick for movement
    - right `ACT` button for tap/hold interactions
    - automatic show/hide tied to active gameplay only
  - added a `?touchControls=1` QA override so the touch overlay can be forced on desktop browsers for testing
  - updated HUD prompts and README controls copy to say `Action (Space/button)` instead of only referring to the keyboard
  - lifted the bottom HUD prompt when touch controls are visible so the prompt and controls do not overlap
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - ran the local dev app at `http://127.0.0.1:5173`
  - ran the required Playwright helper for the desktop path:
    - screenshot: `output/web-game/m54-keyboard/shot-0.png`
    - state: `output/web-game/m54-keyboard/state-0.json`
  - ran a focused Playwright mobile-control probe on `http://127.0.0.1:5173/?touchControls=1` with a phone-sized viewport:
    - verified the touch overlay became visible
    - verified stick-driven movement changed LULU position by `121.8px` horizontally and `133.8px` vertically
    - verified holding `ACT` near a generator set `luluRepairingGeneratorId` to `generator-7`
    - screenshot: `output/web-game/m54-touch/shot-0.png`
    - state log: `output/web-game/m54-touch/state-0.json`

## Milestone 55

- Status: complete
- Scope reset before implementation:
  - remove distracting moving tile seams from the live map rendering
  - add a 3-tile Springtrap knockback on pallet stun
- Implemented:
  - changed the floor layer from many separate tile sprites to one baked floor texture per map, which removes the camera-scroll seam artifacts without flattening obstacle depth
  - kept walls, rocks, pallets, gate, and actors on their existing sprite/depth paths
  - extended the shared `stunned` lock to carry pallet knockback interpolation data
  - added collision-safe Springtrap knockback opposite facing/travel direction when a pallet stun lands
  - kept the original stun duration while making the knockback happen during the opening part of the stun
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - ran the local dev app at `http://127.0.0.1:5173`
  - ran a mobile-sized browser screenshot check:
    - screenshot: `output/web-game/m55-floor/shot-0.png`
    - state: `output/web-game/m55-floor/state-0.json`
    - visual result: the distracting moving tile seams no longer showed on the local phone-sized view
  - ran a deterministic shared-engine probe for pallet knockback:
    - starting Springtrap x: `880`
    - knocked-back x: `784`
    - measured delta: `-96px`
    - result: exactly `3` tiles of knockback when space allowed

## Milestone 56

- Status: complete
- Scope reset before implementation:
  - stop accidental mobile browser zoom from trapping the live game in a zoomed viewport after a double tap
  - keep the fix inside the app because the issue is browser gesture behavior, not Render hosting
  - randomize Lulu and Springtrap start points each round instead of always using the authored fixed spawn pair
  - keep starts away from the map edges and away from the mobile joystick area where possible
  - keep the spawn randomization shared so single-player and multiplayer both inherit it
- Completed implementation:
  - updated the client viewport meta tag to lock the live game to a non-scalable mobile viewport
  - added browser-side gesture guards in `AppController` so iOS/mobile double taps and gesture zoom do not trap the game in a zoomed page state
  - added non-scrolling/touch-safe CSS defaults for the full-screen game shell while keeping menu and gameplay taps intact
  - added config-backed runtime spawn padding and minimum-start-separation values in shared gameplay config
  - replaced the fixed authored round-start pair with randomized runtime spawn selection for Lulu and Springtrap
  - spawn selection now:
    - excludes the currently live generator spots
    - prefers interior points away from the world edges
    - keeps Lulu and Springtrap meaningfully separated
    - falls back cleanly to safe authored/interior anchor points if a map has too few ideal candidates
  - kept the change in the shared engine so both local single-player and server-authoritative multiplayer inherit the same start logic
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - reused the local production-style server at `http://127.0.0.1:3001`
  - required Playwright smoke run:
    - `output/web-game/m56-smoke/shot-0.png`
    - `output/web-game/m56-smoke/shot-1.png`
    - `output/web-game/m56-smoke/state-0.json`
    - `output/web-game/m56-smoke/state-1.json`
  - mobile touch/zoom probe:
    - `output/web-game/m56-touch-zoom.png`
    - `output/web-game/m56-touch-zoom.json`
    - confirmed `visualViewport.scale = 1` after a rapid double tap on a touch-emulated mobile browser
    - confirmed the touch controls stayed visible during live gameplay
  - shared-engine spawn sampler:
    - `output/web-game/m56-spawn-probe.json`
    - confirmed both `forest` and `yard-custom` produced multiple distinct Lulu and Springtrap starts across fresh rounds
    - sampled minimum Lulu edge clearance stayed at or above `170 px`
    - sampled minimum Springtrap edge clearance stayed at or above `135 px`
    - sampled minimum Lulu/Springtrap separation stayed at or above `472 px` on `forest` and `595 px` on `yard-custom`

## Milestone 57

- Status: complete
- Scope reset before implementation:
  - fix the mobile-only music dropout after replaying into later rounds
  - keep the existing desktop audio behavior unchanged
  - preserve title music, gameplay alternation, and in-round looping
- Completed implementation:
  - replaced the one-off mobile unlock path with persistent user-gesture handling so later taps can recover audio if a browser suspends it
  - changed the music controller from spawning fresh `Audio()` elements on each cue swap to reusing a warmed track pool
  - primed the unique title/gameplay audio sources during the first user gesture so mobile browsers can reuse those same media elements later
  - added replay/rematch-time `audio.unlock()` calls so the replay tap itself can re-bless playback on stricter mobile browsers
  - extended the audio debug payload with paused-state and primed-track info for QA verification
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - required Playwright smoke run:
    - `output/web-game/m57-smoke/shot-0.png`
    - `output/web-game/m57-smoke/state-0.json`
  - touch-style 3-round browser audio probe:
    - `output/web-game/m57-audio-rounds.json`
    - `output/web-game/m57-audio-rounds.png`
    - confirmed round sequence:
      - round 1 gameplay -> `/game-assets/audio/music/shared-theme.wav`
      - round 2 gameplay -> `/game-assets/audio/music/round-b-theme.wav`
      - round 3 gameplay -> `/game-assets/audio/music/shared-theme.wav`
    - confirmed the audio debug state stayed:
      - `unlocked: true`
      - `currentTrackPaused: false`
      - `primedTrackCount: 2`

## Milestone 58

- Status: complete
- Scope reset before implementation:
  - fix the follow-up regression where the previous mobile continuity patch can leave mobile browsers fully silent
  - replace the multi-element warm-pool approach with one persistent music element that swaps sources in place
  - keep the desktop alternation behavior unchanged while restoring real sound on mobile
- Completed implementation:
  - replaced the multi-element track pool with one persistent reusable `HTMLAudioElement`
  - kept the first user gesture responsible for blessing a real live track on that one element instead of trying to warm multiple muted elements
  - kept replay/rematch taps wired into `audio.unlock()` so a mobile tap can immediately reapply the current cue if a browser suspended playback
  - preserved round-based gameplay alternation and in-round looping while simplifying the mobile path
  - tightened the global gesture recovery hook so routine gameplay taps no longer re-run the current music cue while audio is already playing
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - required Playwright smoke run:
    - `output/web-game/m58-smoke/shot-0.png`
    - `output/web-game/m58-smoke/state-0.json`
  - touch-style 3-round browser audio probe:
    - `output/web-game/m58-audio-rounds.json`
    - `output/web-game/m58-audio-rounds.png`
    - confirmed gameplay sequence:
      - round 1 gameplay -> `/game-assets/audio/music/shared-theme.wav`
      - round 2 gameplay -> `/game-assets/audio/music/round-b-theme.wav`
      - round 3 gameplay -> `/game-assets/audio/music/shared-theme.wav`
    - confirmed all three running-round snapshots reported:
      - `unlocked: true`
      - `currentTrackPaused: false`
      - `primedTrackCount: 1`
  - follow-up touch-action regression probe:
    - `output/web-game/m58-action-stutter/shot-0.png`
    - `output/web-game/m58-action-stutter/state-0.json`
    - confirmed repeated mobile-style taps on `ACT` left the audio state unchanged
    - confirmed repeated `ACT` taps caused `0` additional `HTMLMediaElement.play()` calls while gameplay music was already running

## Milestone 59

- Status: complete
- Scope reset before implementation:
  - fix the multiplayer join-code input so the field keeps focus while players type
  - rename the killer role to AYU across the live UI and editor copy
  - replace the repair-only multiplayer tracker with a permanent compass toward LULU
  - add treasure chests plus the requested LULU and AYU boost systems
  - shorten AYU's post-attack recovery window
  - change missed pallets to linger and slow AYU while preserving hit knockback
  - prevent generators and other spawned elements from landing on top of ledges or each other
  - improve walk-cycle reliability while moving
  - intake the supplied gate and chest/boost art and replace the gate runtime sprites
- Completed implementation:
  - removed `joinCode` from the overlay signature so the join-room screen no longer rerenders on every typed character and the room-code field keeps focus while players type
  - added player-facing AYU naming helpers and updated the live HUD, round-end copy, map-editor spawn label, and debug output to display `AYU` instead of `Springtrap`
  - changed multiplayer AYU tracking from repair-only to a permanent compass arrow toward LULU, with the arrow temporarily disabled by the flashlight boost
  - copied the supplied gate, chest, pickup, and effect art into organized runtime folders and swapped the live gate closed/open assets
  - added treasure chests to shared match state:
    - 10 closed chests stay active at all times
    - opening is shorter than generator repair
    - opening a chest spawns a replacement chest immediately
    - the opened chest and floating reward linger briefly before disappearing
  - added LULU chest rewards:
    - armor blocks exactly one AYU hit and glows while active
    - flashlight auto-activates for 30 seconds, projects 3 tiles forward, flashes AYU white on hit, and disables the AYU compass arrow for 5 seconds
  - added AYU chest rewards:
    - heart charm auto-activates for 30 seconds, projects 5 tiles forward, and charms LULU one tile toward AYU before returning control
    - wrench auto-activates for 30 seconds and swaps AYU's attack into a 3-tile projectile
  - shortened AYU attack recovery from `900 ms` to `650 ms`
  - changed missed pallets to stay down for 5 seconds and slow AYU while crossing them, while direct pallet hits still stun, knock AYU back, and clear the pallet immediately
  - widened the downed-pallet slow zone slightly so the slowdown is actually noticeable while AYU crosses it
  - strengthened authored-map validation and runtime placement filtering so generators and actor/chest spawns no longer land on ledges, pallets, gate footprint, or duplicate coordinates
  - moved one authored generator in `maps/custom/yard-custom.json` off a ledge so both custom maps remain valid under the stricter rules
  - updated actor animation timing so walk cycles no longer keep resetting while actors are still moving
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - runtime map catalog:
    - `http://127.0.0.1:3001/maps` reports `ready: true` and `customMapCount: 2`
  - multiplayer room-code focus probe:
    - `output/web-game/m59-room-code/result.json`
    - confirmed all 4 typed characters stayed in the same focused `#join-room-input`
  - multiplayer browser smoke:
    - `output/web-game/m59-multiplayer-smoke/host.png`
    - `output/web-game/m59-multiplayer-smoke/guest.png`
    - `output/web-game/m59-multiplayer-smoke/states.json`
    - confirmed live `LULU` / `AYU` roles, permanent compass arrow for AYU, and chest presence in a real two-player room
  - standard Playwright game-loop smoke:
    - `output/web-game/m59-skill-smoke/shot-1.png`
    - `output/web-game/m59-skill-smoke/state-1.json`
    - no new console errors
  - deterministic shared-engine probes:
    - `output/web-game/m59-engine-results.json`
    - confirmed:
      - LULU chest armor reward with replacement chest count staying at 10 closed chests
      - flashlight hits set `trackerDisabledRemainingMs = 5000` and `flashOverlayRemainingMs = 160`
      - wrench projectile injures LULU
      - armor absorbs one hit and the next hit injures
      - heart charm pulls LULU one tile toward AYU and leaves recovery time
      - missed downed pallets slow AYU while crossing them
      - fresh runtime rounds on both custom maps keep placements unique with 10 closed chests

## Milestone 1

- Status: complete
- Created `SPEC.md`, `PLAN.md`, and `PROGRESS.md`.
- Locked one implementation clarification:
  - The attack phase timings are implemented as the explicit per-phase values (`0.10s`, `0.08s`, `0.38s`), since the stated total commitment (`0.48s`) conflicts with them.
- Validation:
  - Documentation reviewed for scope coverage against the request.
- Next:
  - Scaffold the root workspace plus `client`, `server`, and shared gameplay code.

## Milestone 2

- Status: complete
- Added the root repo scaffold:
  - Root npm scripts for install/dev/build/typecheck/check
  - `client` Vite + Phaser + TypeScript app shell
  - `server` Node + Express + Socket.IO scaffold
  - `shared` source folder for common config/gameplay code
- Added the browser-test hooks required for game iteration:
  - `window.render_game_to_text()`
  - `window.advanceTime(ms)`
- Validation:
  - `npm install`
  - `npm run typecheck`
  - `npm run build`
  - Ran the server locally and verified `http://127.0.0.1:3001/health`
  - Ran the client locally and verified `http://127.0.0.1:5173`
  - Ran the Playwright smoke loop against the Vite client
  - Fixed a headless capture problem by switching Phaser to explicit canvas mode
- Notes:
  - Current screenshot artifact: `output/web-game/m2b/shot-0.png`
  - Current text-state artifact: `output/web-game/m2b/state-0.json`
- Next:
  - Build the first handcrafted map with smooth movement, obstacle collision, and camera follow.

## Milestone 3

- Status: complete
- Added shared gameplay foundations:
  - Centralized config values in `shared/src/config.ts`
  - Shared gameplay/map/state types
  - Shared math helpers
  - First handcrafted map data (`yard`)
  - Shared match creation and movement/collision step logic
- Added client runtime pieces:
  - Local single-player session wrapper around the shared simulation
  - Phaser game scene that renders the map and actors
  - Keyboard input resolution for one-cardinal-direction movement
  - Camera follow tied to the local player
  - Title screen button to start a local match
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - Reused the running local app and verified the updated client scene
  - Ran the Playwright smoke loop with the title-screen start button
  - Verified movement state in `output/web-game/m3/state-0.json`
  - Visually verified map rendering and LULU position in `output/web-game/m3/shot-0.png`
- Notes:
  - Current single-player slice already spawns Springtrap and the 4 NPC survivors visually, but only movement/collision is active so far.
- Next:
  - Add the round timer, HUD, prompts, exit-gate timing, and finish wiring the base actor presentation for Milestone 4.

## Milestone 4

- Status: complete
- Extended the playable slice with the remaining base round presentation:
  - Timer countdown formatting
  - In-game HUD rendered directly on the Phaser canvas
  - LULU health-state readout
  - Context prompt for the current match objective
  - Existing exit-gate timing now surfaced clearly in the HUD
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - Reused the running local app and verified the title-to-match flow
  - Ran the Playwright smoke loop again
  - Confirmed timer/health/prompt fields in `output/web-game/m4b/state-0.json`
  - Visually confirmed the on-canvas HUD in `output/web-game/m4b/shot-0.png`
- Next:
  - Add attack timing, injury/death handling, NPC deaths, and LULU's burst for Milestone 5.

## Milestone 5

- Status: complete
- Added shared combat logic:
  - Springtrap attack windup, active window, and recovery lock states
  - Front-facing attack hitbox
  - LULU healthy -> injured -> dead progression
  - LULU post-hit speed-burst timer
  - NPC one-hit deaths and heal-resource removal
  - Springtrap round win on LULU's second hit
- Added client-facing combat support:
  - Springtrap attack indicator rendered on the canvas
  - Optional QA-only local springtrap control via `?debugRole=springtrap`
  - Combat state included in `render_game_to_text`
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - Reused the running local app
  - Ran a Playwright smoke pass in springtrap QA mode and confirmed attack state rendering in `output/web-game/m5-scout/shot-0.png`
  - Ran a deterministic shared-engine probe with `npx tsx --eval ...` and verified:
    - First hit injures LULU and leaves burst time active
    - Second hit kills LULU and sets `springtrap_win`
    - NPCs die in one hit and lose heal availability
- Next:
  - Add line-of-sight checks, fog-of-war rendering, and sight-aware state for Milestone 6.

## Milestone 6

- Status: complete
- Added shared sight utilities:
  - Vision-radius lookup by role
  - Obstacle-based line-of-sight checks
  - `canSeePoint()` for reuse in later AI/NPC work
- Added Phaser fog-of-war rendering:
  - Per-tile darkness mask based on the local viewer
  - Hidden entities stay off-screen if they are outside the current viewer's sight
  - LULU and springtrap now render different visible regions
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - Reused the running local app
  - Ran the Playwright smoke loop for normal LULU single-player
  - Ran the Playwright smoke loop for springtrap QA view
  - Verified visibility flags in:
    - `output/web-game/m6-lulu/state-0.json`
    - `output/web-game/m6-springtrap/state-0.json`
  - Visually confirmed the fog mask and different visible regions in:
    - `output/web-game/m6-lulu/shot-0.png`
    - `output/web-game/m6-springtrap/shot-0.png`
- Next:
  - Add ledge traversal and the pallet state machine for Milestone 7.

## Milestone 7

- Status: complete
- Added traversal systems in shared gameplay code:
  - Auto-ledger traversal with different LULU vs springtrap timings
  - Dropped-pallet traversal with different timings
  - LULU pallet drop startup and drop resolution
  - Springtrap stun on pallet drop if inside the drop zone
  - Springtrap dropped-pallet break action and broken-pallet cleanup
- Updated the map/render layer:
  - Added ledge locations to the first map
  - Added an extra nearby pallet for easier testing
  - Rendered ledges plus upright/dropped/broken pallet states in Phaser
  - Added pallet-aware prompts in both the HUD and text-state output
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - Reused the running local app
  - Ran a Playwright browser path that drops the nearby pallet
  - Verified the dropped pallet state in `output/web-game/m7b/state-0.json`
  - Visually confirmed the dropped pallet on the canvas in `output/web-game/m7b/shot-0.png`
  - Ran deterministic shared-engine probes and confirmed:
    - Pallet drop stuns springtrap
    - LULU ledge traversal = `220ms`
    - Springtrap ledge traversal = `420ms`
    - LULU dropped-pallet traversal = `180ms`
    - Springtrap break resolves to `broken`
- Next:
  - Add injured-only healing plus NPC one-use healing for Milestone 8.

## Milestone 8

- Status: complete
- Added shared healing logic:
  - Injured-only heal interaction
  - One-use NPC heal charges
  - Heal completion returns LULU to healthy
  - Moving interrupts healing
  - Taking a hit interrupts healing
  - Dead or spent healer NPCs invalidate the interaction
- Updated the render/prompt layer:
  - Heal-available NPCs render brighter than spent NPCs
  - HUD/text-state prompt can now surface nearby healing context
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - Reused the running local app and ran a fresh Playwright smoke pass
  - Deterministic shared-engine probe confirmed:
    - Successful heal consumes the NPC charge
    - Movement cancels the heal
    - Springtrap hitting during heal cancels the interaction and resolves damage
  - Browser smoke artifacts:
    - `output/web-game/m8/state-0.json`
    - `output/web-game/m8/shot-0.png`
- Next:
  - Add single-player Springtrap AI for Milestone 9.

## Milestone 9

- Status: complete
- Added single-player AI behavior in shared gameplay code:
  - Springtrap chases visible LULU
  - Springtrap records last seen position
  - After losing sight, Springtrap uses memory first and then a separate local search phase
  - Injured-LULU side case can prefer a nearby visible healer NPC
- Added simple NPC behavior:
  - Wander when calm
  - Flee when Springtrap enters vision
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - Reused the running local app and ran a fresh Playwright smoke pass
  - Deterministic shared-engine probe confirmed:
    - Visible chase updates Springtrap position and last-seen data
    - Memory persists after sight loss
    - Search phase activates after memory expires
    - NPC survivors switch to `flee`
  - Browser smoke artifacts:
    - `output/web-game/m9/state-0.json`
    - `output/web-game/m9/shot-0.png`
  - `output/web-game/m9/state-0.json` also confirms live NPC motion and AI-controlled Springtrap movement in the running client
- Next:
  - Add room-code multiplayer and authoritative server simulation for Milestone 10.

## Milestone 10

- Status: complete
- Replaced the server scaffold with actual Socket.IO room logic:
  - Human-friendly 4-character room codes
  - Create/join room flow
  - 2-player room cap
  - Server-authoritative multiplayer match loop using the shared simulation
  - Per-player input streams for move/action
  - Per-player room-state payloads with local role and match snapshot
- Added client multiplayer support:
  - Create room UI
  - Join room UI
  - Waiting-room state
  - Network session wrapper that reuses the same Phaser renderer/HUD/fog layer as single-player
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - Reused the running local app and verified the updated health endpoint reports `server-authoritative`
  - Browser smoke after clicking `Create Room`:
    - `output/web-game/m10-ui/state-0.json`
    - `output/web-game/m10-ui/shot-0.png`
  - `output/web-game/m10-ui/state-0.json` confirms the room code and waiting-room status in the live client

## Milestone 11

- Status: complete
- Added multiplayer round-end rematch handling:
  - `Play Again` button on multiplayer round end
  - Server waits for both rematch votes
  - Next round starts with swapped LULU/Springtrap roles
- Validation:
  - Ran a direct 2-client Socket.IO integration script from the client workspace
  - Verified:
    - Room creation/join succeeds
    - The multiplayer round reaches a real `springtrap_win` state
    - Both rematch votes start round 2
    - Round 2 roles swap relative to round 1
- Next:
  - Add at least two more handcrafted maps and rotate them cleanly for Milestone 12.

## Milestone 12

- Status: complete
- Added two more handcrafted maps:
  - `motel` / `Motel Strip`
  - `quarry` / `Stone Garden`
- Added shared map rotation helpers.
- Updated session startup:
  - Single-player cycles through the available map list across new runs
  - Multiplayer rounds advance to the next map in the server-authoritative rotation
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - Shared map probe confirmed all three map ids instantiate and step cleanly
  - Direct multiplayer integration confirmed round 1 starts on `yard` and round 2 advances to `motel`
  - Fresh browser smoke artifacts:
    - `output/web-game/m12/state-0.json`
    - `output/web-game/m12/shot-0.png`
- Next:
  - Final cleanup, README, and asset-swap instructions for Milestone 13.

## Milestone 13

- Status: complete
- Added the final repo documentation:
  - Root `README.md`
  - Exact install/dev/typecheck/build steps
  - Multiplayer test flow
  - Key file map
  - Placeholder-art swap notes
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - Final browser smoke artifacts:
    - `output/web-game/m13/state-0.json`
    - `output/web-game/m13/shot-0.png`
- End state:
  - The repo now contains the requested docs, three handcrafted maps, single-player AI, multiplayer room codes, and rematch role swapping.

## Milestone 14

- Status: complete
- Replaced the old sidebar-first menu flow with a centered splash and lobby flow:
  - `1 Player` starts immediately
  - `2 Players` creates a room immediately
  - `Join Game` opens a dedicated join panel
  - `?room=CODE` invite links prefill the join flow
  - Waiting-room UI now stays centered over the stage instead of using the old sidebar
- Removed duplicate menu HUD bleed-through so the splash and join screens render cleanly over the stage.
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - Reused the running local app and server
  - Phaser canvas smoke artifact:
    - `output/web-game/m14-ui/state-0.json`
    - `output/web-game/m14-ui/shot-0.png`
  - Full-page Playwright DOM artifacts:
    - `output/web-game/m14-dom/splash.png`
    - `output/web-game/m14-dom/lobby.png`
    - `output/web-game/m14-dom/state.json`
- Next:
  - Add the internal graphical map editor and runtime map JSON workflow for Milestone 15.

## Milestone 15

- Status: complete
- Added shared map authoring helpers:
  - Runtime map JSON parsing and serialization
  - Tile-authored map conversion helpers
  - Runtime map registration for local custom-map playtests
- Added the internal graphical map editor:
  - Drag obstacle placement
  - Drag ledge placement
  - Single-click pallet, gate, and spawn placement
  - Palette editing
  - JSON export and import
  - Local `Play This Map` launch path using the authored map
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - Reused the running local app and server
  - Full-page Playwright editor artifacts:
    - `output/web-game/m15-editor/editor.png`
    - `output/web-game/m15-editor/custom-map.json`
    - `output/web-game/m15-editor/state.json`
    - `output/web-game/m15-editor/playtest.png`
  - `output/web-game/m15-editor/state.json` confirms the editor-generated map launched as a live single-player round with `mapId = "custom-map"`.
- Next:
  - Add the asset prep guide, README updates, and final invite-link/browser validation for Milestone 16.

## Milestone 16

- Status: complete
- Added repo-facing documentation for the new pass:
  - `ASSET_GUIDE.md`
  - Updated `README.md` for splash flow, invite links, editor workflow, and asset prep
- Locked folder conventions and prep specs for future art and sound swaps without enabling runtime audio yet.
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - Reused the running local app and server
  - Invite-link multiplayer browser validation:
    - `output/web-game/m16-invite/invite-prefill.png`
    - `output/web-game/m16-invite/state-1.json`
    - `output/web-game/m16-invite/state-2.json`
  - Final full-page browser artifacts:
    - `output/web-game/m16-final/splash.png`
    - `output/web-game/m16-final/invite-prefill.png`
    - `output/web-game/m16-final/multiplayer.png`
    - `output/web-game/m16-final/custom-map-playtest.png`
- Notes:
  - The Vite production build still emits the large chunk warning because Phaser remains bundled into a large client chunk, but the build completes successfully.

## Correction Note

- The earlier in-app map editor direction from Milestones 15-16 was superseded.
- The repo now treats map authoring as a separate local tool in `map-editor/`.
- The player-facing game no longer exposes map editing in the splash flow.

## Milestone 17

- Status: complete
- Changed the shared and server-side map pipeline:
  - Authored tile JSON is now the external custom-map format
  - Added authored JSON parse/serialize helpers
  - Added server scanning for `maps/custom/*.json`
  - Added `/maps` so the client can fetch the combined runtime catalog
  - Valid custom maps are appended after built-ins in deterministic id order
  - Invalid or duplicate custom maps are skipped with warnings
- Validation:
  - `npm run typecheck --prefix server`
  - `npm run typecheck --prefix client`
  - `npm run build --prefix server`
  - `npm run build --prefix client`
  - Local server health confirmed via `curl.exe -s http://127.0.0.1:3001/health`
  - Local catalog confirmed via `curl.exe -s http://127.0.0.1:3001/maps`
- Next:
  - Remove the player-facing editor flow and replace it with the separate local tool.

## Milestone 18

- Status: complete
- Split the map-editor workflow out of the game:
  - Removed the `Map Editor` button from the game splash
  - Added `client/src/game/mapCatalog.ts`
  - Local single-player and multiplayer session startup now load the server map catalog first
  - Added the separate `map-editor/` Vite app
  - The separate editor exports and downloads authored JSON instead of runtime JSON
- Validation:
  - `npm install --prefix map-editor`
  - `npm run typecheck --prefix map-editor`
  - `npm run build --prefix map-editor`
  - Local app checks:
    - `http://127.0.0.1:5173`
    - `http://127.0.0.1:5174`
  - Browser artifacts:
    - `output/web-game/m17-client/state-0.json`
    - `output/web-game/m17-client/shot-0.png`
    - `output/web-game/m18-splash/splash.png`
    - `output/web-game/m18-multiplayer/host-lobby.png`
    - `output/web-game/m18-multiplayer/host-match.png`
    - `output/web-game/m18-multiplayer/join-match.png`
    - `output/web-game/m18-editor/editor.png`
    - `output/web-game/m18-editor/export.json`
    - `output/web-game/m18-editor/smoke-editor-map.json`
- Notes:
  - `output/web-game/m18-editor/export.json` confirms the editor now emits tile-authored JSON with `tileX`, `tileY`, `tileW`, `tileH`, and authored spawn/gate fields.

## Milestone 19

- Status: complete
- Finalized the corrected custom-map workflow and docs:
  - Added `maps/custom/README.md`
  - Updated `README.md` with plain-English test steps
  - Updated `SPEC.md`, `PLAN.md`, and `ASSET_GUIDE.md`
  - Confirmed a downloaded editor map can be copied into `maps/custom/` and appear in the server catalog
  - Confirmed an invalid custom map file is skipped with a warning and does not break `/maps`
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - `npm run check`
  - Local server log warning confirmed:
    - `[maps] Skipping broken-map.json: Gate placement is required.`
  - Catalog validation:
    - `smoke-editor-map` appears after the built-in maps in `curl.exe -s http://127.0.0.1:3001/maps`
- Notes:
  - Temporary validation files were removed from `maps/custom/` after the loader checks, so the repo ends with only the built-in maps active by default.
  - The Vite production build still emits the large Phaser chunk warning, but the build succeeds.

## Milestone 20

- Status: complete
- Started the generator-objective redesign pass by inspecting the live implementation before making gameplay edits.
- Current behavior confirmed in code:
  - the gate still opens from the old `300s` timer objective
  - there are no generators or generator spawn points in runtime or authored map data
  - NPC survivors only use `wander` and `flee`
  - AI Springtrap only uses chase, memory, search, roam, and healer-side-target logic
  - healing uses LULU's lock state, but healer NPCs do not pause during the heal
  - pallets still use persistent `upright -> dropped -> broken` world states
  - ledges are still standalone traversal strips rather than structure-built crossings
  - built-in maps still use the old `32 x 24` tile size standard
  - there is no multiplayer killer notification for active LULU generator repair
- Updated `SPEC.md` and `PLAN.md` to the new requested design before code changes.
- Validation:
  - Documentation review only for this milestone.
- Next:
  - Replace the timer objective with generators, persistent repair progress, gate-open logic, and the new HUD.

## Milestone 21

- Status: complete
- Replaced the old timer objective with the first pass of the generator objective:
  - added authored and runtime generator spawn support
  - each round now spawns 5 generators from authored valid spawn points
  - added persistent per-generator progress state
  - the gate now opens from completed generators instead of the old `300s` timer
  - added held-space input support for generator repair without breaking one-press pallet/heal/attack actions
  - updated the HUD data surface and `render_game_to_text()` to report generator count and gate status instead of the countdown timer
  - switched pallet runtime state to disappear-and-respawn instead of persistent dropped/broken traversal
  - started the NPC state rewrite by adding generator-target state and simple assist behavior to the shared simulation
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - local dev stack smoke:
    - `http://127.0.0.1:3001/health`
    - `http://127.0.0.1:5173`
  - Playwright smoke artifact:
    - `output/web-game/m20-generators/shot-0.png`
    - `output/web-game/m20-generators/state-0.json`
  - deterministic shared-engine probe confirmed:
    - partial generator progress persists through interruption
    - gate open now comes from generator completion instead of elapsed time
- Notes:
  - Map sizes and authored structure-ledges are still on the old layouts and will be reworked in a later milestone.
  - The multiplayer repair-arrow notification is not in yet; that is the next gameplay step.

## Milestone 22

- Status: complete
- Added the killer-side reaction path for active LULU repairs:
  - AI Springtrap now turns toward LULU's actively repaired generator when not already in close direct pursuit
  - the shared match state now exposes `luluRepairingGeneratorId`
  - the Phaser scene now draws a directional repair arrow for human Springtrap in multiplayer only
  - the arrow is driven from the authoritative match state, so it disappears immediately when LULU stops repairing
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - local dev stack remained healthy after the patch
  - deterministic shared-engine probe confirmed Springtrap closes distance toward an actively repaired generator
  - regression Playwright smoke artifacts:
    - `output/web-game/m21-ai-smoke/shot-0.png`
    - `output/web-game/m21-ai-smoke/state-0.json`
- Notes:
  - Full two-browser multiplayer validation of the repair arrow will happen again during the broader multiplayer regression pass.

## Milestone 23

- Status: complete
- Finished the first pass of the NPC/healing redesign:
  - NPC survivors now use `wander`, `move_to_generator`, `repair_generator`, and `flee`
  - NPCs can contribute slow generator progress and spread across incomplete generators by target assignment
  - NPCs still ignore LULU as a threat and only flee Springtrap
  - healing now pauses the healer NPC in place for the duration of the interaction
  - moving away still cancels healing
  - Springtrap hitting LULU still interrupts healing
  - debug text now reports NPC AI mode and target generator id for easier validation
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - local dev stack smoke:
    - `http://127.0.0.1:3001/health`
    - `http://127.0.0.1:5173`
  - deterministic shared-engine probes confirmed:
    - healing succeeds with a valid nearby healer and consumes that NPC's heal
    - healer NPC stays paused during heal
    - movement cancels the heal
    - NPCs do not flee from nearby LULU
    - NPCs can add slow generator progress
  - browser smoke artifacts:
    - `output/web-game/m22-npc-heal-smoke/shot-0.png`
    - `output/web-game/m22-npc-heal-smoke/state-0.json`
- Notes:
  - Because pallet drop has higher priority by design, healing can still be intentionally blocked if LULU is standing in range of both an upright pallet and a healer NPC. The larger map/layout pass should avoid placing those overlaps in common routes.

## Milestone 24

- Status: complete
- Reworked the authored world data and custom-map schema:
  - doubled the standard map size from `32 x 24` to `64 x 48`
  - replaced the built-in handcrafted maps with larger authored layouts
  - rebuilt ledges so they only appear as crossings integrated into structure boundaries
  - finished the new pallet behavior on the live maps: single use, immediate disappearance, timed respawn
  - added authored `generatorSpawns` to runtime and authored map data
  - tightened authored-map validation so generator spawns and actor spawns cannot sit inside obstacles or the gate footprint
  - updated the separate map editor to the larger grid and added generator-spawn placement/export support
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - local map catalog smoke via `http://127.0.0.1:3001/maps`
  - deterministic shared-engine probe confirmed:
    - built-in maps now report `64 x 48`
    - yard exposes 10 generator spawn points
    - pallets now transition `upright -> respawning -> upright`
    - gate opens after all generators complete
  - browser smoke artifacts:
    - `output/web-game/m24-large-maps/game/shot-0.png`
    - `output/web-game/m24-large-maps/game/state-0.json`
    - `output/web-game/m24-large-maps/editor/shot-0.png`
    - `output/web-game/m24-large-maps/editor/state-0.json`
- Notes:
  - The stricter authored-map validation caught several bad built-in placements during this pass, which were corrected before the server catalog was allowed to come back up.

## Milestone 25

- Status: complete
- Finished the regression and docs pass:
  - verified the multiplayer repair-arrow path end-to-end in two real browser pages
  - verified the separate editor can still export built-in authored JSON with `generatorSpawns`
  - updated `README.md` to the generator objective, larger maps, multiplayer arrow test, and the editor's generator-spawn workflow
- Validation:
  - `npm run check`
  - `npm run typecheck`
  - `npm run build`
  - local services:
    - `http://127.0.0.1:3001/maps`
    - `http://127.0.0.1:5173`
    - `http://127.0.0.1:5174`
  - multiplayer browser artifacts:
    - `output/web-game/m25-multiplayer-arrow/host-state.json`
    - `output/web-game/m25-multiplayer-arrow/guest-state.json`
    - `output/web-game/m25-multiplayer-arrow/springtrap-arrow.png`
  - editor browser artifacts:
    - `output/web-game/m26-editor-generators/editor-full.png`
    - `output/web-game/m26-editor-generators/yard-export.json`
- End state:
  - The prototype now uses the generator objective, larger maps, structural ledges, respawning pallets, NPC generator help, reliable healing, AI repair investigation, and the multiplayer Springtrap repair arrow.

## Milestone 26

- Status: complete
- Retuned only the single-player Springtrap AI:
  - AI Springtrap now senses LULU at near-global range based on the current map size.
  - AI Springtrap now defaults to chasing LULU directly instead of relying on the old sight-loss memory, search, and roam path while LULU is alive.
  - NPC diversion remains possible, but only as a short kill detour when a living NPC is both visible and meaningfully easier to catch than LULU.
  - Human Springtrap multiplayer fog behavior was left untouched.
- Cleanup:
  - moved the new AI-only tuning values into `shared/src/config.ts`
  - removed the old unused generator-investigation distance tuning field
  - updated `README.md` so the single-player AI description matches the new behavior
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - local services:
    - `http://127.0.0.1:3001/health`
    - `http://127.0.0.1:5173`
  - Playwright web-game smoke:
    - `output/web-game/m26-ai-retune/single-chase/shot-3.png`
    - `output/web-game/m26-ai-retune/single-chase/state-0.json`
    - `output/web-game/m26-ai-retune/single-chase/state-3.json`
  - multiplayer join smoke:
    - `output/web-game/m26-ai-retune/multiplayer-smoke/host-state.json`
    - `output/web-game/m26-ai-retune/multiplayer-smoke/guest-state.json`
    - `output/web-game/m26-ai-retune/multiplayer-smoke/springtrap-view.png`
  - Single-player chase probe result:
    - Springtrap-to-LULU distance dropped from `1800.9 px` to `993.0 px`
    - `springtrap.visible` stayed `false` in LULU's fog output during that chase window, confirming the AI pressure change is not coming from player-side fog changes
  - Multiplayer fog probe result:
    - the joined Springtrap player still loaded with `lulu.visible = false` at round start on the Springtrap client

## Milestone 27

- Status: complete
- Implemented the new single-player AI reset behavior and removed healing:
  - AI Springtrap still tracks LULU globally in single player
  - when LULU breaks normal Springtrap fog-of-war sight during a chase, AI Springtrap now takes a one-second stun
  - after that stun, AI Springtrap now checks for a visible NPC survivor distraction target and commits to that target until catching up
  - if no NPC survivor is visible after the stun, AI Springtrap goes straight back to globally tracking LULU
  - NPC survivors are now invincible support actors and no longer die to attacks
  - healing is fully removed from the simulation, prompts, and debug state
- Cleanup:
  - added dedicated AI retarget tuning in `shared/src/config.ts`
  - removed the heal lock type and heal config
  - updated `README.md` so test instructions no longer mention healing
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - local services:
    - `http://127.0.0.1:3001/health`
    - `http://127.0.0.1:5173`
  - deterministic engine probe:
    - `output/web-game/m27-ai-reset/engine-probe.mjs`
    - result:
      - `sawBeforeBreak = true`
      - `stunnedOnBreak = true`
      - `needsReassess = true`
      - `distractionNpcId = "npc-1"`
      - `noHealing.luluHealth = "injured"`
      - `noHealing.luluLock = "none"`
      - `npcInvincible.npcAlive = true`
  - Playwright browser smoke:
    - `output/web-game/m27-ai-reset/single-smoke/shot-2.png`
    - `output/web-game/m27-ai-reset/single-smoke/state-0.json`
    - `output/web-game/m27-ai-reset/single-smoke/state-2.json`
  - browser smoke confirmed:
    - the single-player round still starts cleanly
    - the HUD prompt no longer advertises healing
    - Springtrap continues closing distance while still outside LULU's visible fog

## Milestone 28

- Status: complete
- Inspected the current implementation before the new redesign and documented the live behavior differences:
  - single-player AI still used near-global LULU pressure plus one sight-break stun and optional NPC distraction retarget
  - multiplayer Springtrap was already a separate human-controlled vertical with normal fog and the repair arrow
  - NPC survivors still shared one rule path across both modes and were effectively invincible in both
  - generator and gate logic were already working and did not need a rules reset
  - fog, pallets, ledges, and the current HUD prompt system were already in the requested baseline shape
  - actor movement still used simple greedy steering instead of real pathfinding
- Rewrote `SPEC.md` and `PLAN.md` to the new design:
  - single-player Springtrap now targets a Hunt / Chase / Search / Cooldown rhythm
  - single-player and multiplayer NPC rules are now explicitly mode-split in the design docs
  - the repair arrow, generator objective, pallets, ledges, fog, and room flow stay preserved unless needed for regression fixes
- Validation:
  - `npm run check`
  - `npm run typecheck`
  - `npm run build`
  - local services confirmed:
    - `http://127.0.0.1:3001/health`
    - `http://127.0.0.1:5173`
- Next:
  - Refactor the shared engine and config to support the new single-player AI state machine and the multiplayer NPC rule split.

## Milestone 29

- Status: complete
- Replaced the old single-player Springtrap pressure logic with a four-state machine:
  - `hunt`
  - `chase`
  - `search`
  - `cooldown`
- Added explicit single-player AI state data to shared Springtrap state:
  - current AI state
  - state timer
  - chase sight-loss timer
  - last confirmed LULU position
  - last confirmed LULU direction
  - coarse Hunt target
  - Hunt retarget timer
  - Search waypoints and waypoint index
- Added single-player-only AI tuning in `shared/src/config.ts`.
- Added a lightweight walkable-grid helper for:
  - Chase escape distance checks
  - Search waypoint generation
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - local services remained healthy:
    - `http://127.0.0.1:3001/health`
    - `http://127.0.0.1:5173`
  - Playwright single-player smoke artifacts:
    - `output/web-game/m29-single-ai/state-4.json`
    - `output/web-game/m29-single-ai/shot-4.png`
    - `output/web-game/m29-single-debug/state.json`
    - `output/web-game/m29-single-debug/full.png`
  - deterministic engine probe:
    - `output/web-game/m31-engine-probe.json`
    - confirmed:
      - `hunt -> chase`
      - `chase -> search`
      - `search -> cooldown`
      - `cooldown -> hunt`

## Milestone 30

- Status: complete
- Locked single-player NPC survivors to support behavior:
  - still wander, move to generators, repair, and flee
  - remain invincible in single-player
  - never heal LULU
  - can only act as Springtrap distraction targets outside active Chase
- Preserved the generator objective and gate logic in single-player.
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic engine probe:
    - `output/web-game/m31-engine-probe.json`
    - confirmed single-player NPC attacks leave NPC health at `healthy`

## Milestone 31

- Status: complete
- Split multiplayer NPC rules from single-player:
  - multiplayer NPCs now use `healthy -> injured -> dead`
  - multiplayer NPC repair speed is now `40%` of LULU
  - single-player NPC repair speed stays `12%`
  - dead multiplayer NPCs stop contributing generator pressure
- Updated client rendering and text-state output to show NPC health instead of the old alive flag.
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic engine probe:
    - `output/web-game/m31-engine-probe.json`
    - confirmed:
      - multiplayer NPC first hit = `injured`
      - multiplayer NPC second hit = `dead`
      - single-player NPC repair after `6000ms` = `0.04`
      - multiplayer NPC repair after `6000ms` = `0.133`
  - live two-browser multiplayer smoke:
    - `output/web-game/m31-multiplayer-smoke/host-state.json`
    - `output/web-game/m31-multiplayer-smoke/guest-state.json`
    - `output/web-game/m31-multiplayer-smoke/host.png`
    - `output/web-game/m31-multiplayer-smoke/guest.png`

## Milestone 32

- Status: complete
- Preserved the multiplayer repair arrow path and added optional single-player AI debug support:
  - query flag: `?debugAi=1`
  - HUD debug surface now shows:
    - AI state
    - state timer
    - sight-loss timer
    - last confirmed LULU position
    - current Hunt target
- Extended `render_game_to_text()` with the new AI state data and NPC health state.
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - debug overlay artifact:
    - `output/web-game/m29-single-debug/full.png`
  - live multiplayer smoke still showed:
    - Springtrap room flow intact
    - normal fog intact
    - no regression in room join/start behavior

## Milestone 33

- Status: complete
- Finished the regression and docs pass:
  - updated `README.md` to the new single-player AI rhythm and multiplayer NPC rules
  - kept healing removed
  - kept the generator objective, pallets, ledges, fog, room flow, and repair arrow intact
- Validation:
  - `npm run check`
  - `npm run typecheck`
  - `npm run build`
  - local services confirmed:
    - `http://127.0.0.1:3001/health`
    - `http://127.0.0.1:5173`
  - browser and probe artifacts:
    - `output/web-game/m29-single-debug/full.png`
    - `output/web-game/m31-multiplayer-smoke/guest.png`
    - `output/web-game/m31-engine-probe.json`
- Notes:
  - The Vite production build still emits the large Phaser chunk warning, but the build succeeds.

## Milestone 34

- Status: complete
- New user-reported gameplay issues for the next targeted pass:
  - single-player Springtrap is too easy to lose around simple corners
  - NPC survivors do not feel active enough
  - baseline movement should be `1.5x` faster
  - built-in maps need denser obstacle variety, more crates, and more multi-ledge structures
- Design updates applied to `SPEC.md` and `PLAN.md` before code changes:
  - stronger single-player Chase persistence
  - lightweight AI/NPC route choice around obstacles
  - faster movement values
  - denser handcrafted map layouts with more ledges
- Implemented:
  - increased base movement speeds by `1.5x`
  - increased LULU burst speed by `1.5x`
  - retuned single-player Springtrap Chase / Search thresholds
  - added path-based direction choice for AI and NPCs around obstacles
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - `npm run check`
  - local services confirmed:
    - `http://127.0.0.1:3001/health`
    - `http://127.0.0.1:5173`
  - deterministic engine probe:
    - `output/web-game/m34-engine-probe.json`
    - confirmed:
      - `enteredChase = chase`
      - `afterShortBreak = chase`
      - `afterLongerBreak = search`
      - LULU movement delta after `1000ms` increased to `170.8`

## Milestone 35

- Status: complete
- Fixed NPC activity and route reliability:
  - NPCs now spawn with an immediate wander direction and timer instead of appearing inert at round start
  - NPC move-to-generator routing now uses obstacle-aware path choice
  - NPC repair sessions now roll back into wander or a fresh generator task instead of feeling parked forever
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - Playwright single-player smoke:
    - `output/web-game/m34-single-smoke/state-0.json`
    - `output/web-game/m34-single-smoke/state-4.json`
    - `output/web-game/m34-single-smoke/shot-4.png`
  - confirmed NPC position and state changes between the early and late smoke captures

## Milestone 36

- Status: complete
- Densified the built-in handcrafted maps:
  - added new crate clusters
  - added more irregular blocker shapes
  - added new multi-ledge structures and extra ledge crossings inside existing compounds
- Updated `README.md` to the faster movement, stronger chase, more active NPCs, and denser built-in maps.
- Validation:
  - `npm run check`
  - multiplayer room smoke:
    - `output/web-game/m34-multiplayer-smoke/host-state.json`
    - `output/web-game/m34-multiplayer-smoke/guest-state.json`
    - `output/web-game/m34-multiplayer-smoke/guest.png`
- Notes:
  - The Vite production build still emits the large Phaser chunk warning, but the build succeeds.

## Milestone 37

- Status: complete
- Started the targeted bug-and-pressure pass by inspecting the live implementation first:
  - single-player still serialized around one `state.springtrap`
  - Search and Cooldown could stall if the selected route step was not actually traversable from the actor's current pixel position
  - healing had been fully removed from config, prompts, and simulation
  - multiplayer room flow still assumed one human-controlled Springtrap
- Updated `SPEC.md` and `PLAN.md` before code changes:
  - single-player now uses 3 AI Springtraps
  - multiplayer stays on 1 human-controlled Springtrap
  - healing returns as an injured-only hold interaction with NPC survivors
- Implemented the shared-state and interaction changes:
  - added `springtraps[]` while preserving `state.springtrap` as the primary Springtrap alias for multiplayer and HUD compatibility
  - restored injured-only hold healing with one heal charge per NPC
  - healer NPCs now pause during the heal and stop healing again once their charge is spent
  - LULU healing now cancels on movement, invalid range, or taking a hit
- Fixed the post-chase freeze:
  - the route helper now verifies that the chosen BFS step is actually traversable before committing to it
  - Search and Cooldown now fall back to a real progress direction instead of idling forever on a bad route step
- Expanded single-player to 3 AI Springtraps:
  - all 3 share the current AI state machine
  - pallets can stun any Springtrap in range
  - LULU collides with all active Springtraps
  - NPC threat checks now use the nearest active Springtrap
- Preserved multiplayer as a separate vertical:
  - multiplayer still exposes exactly 1 Springtrap
  - room flow and role logic stay intact
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - local services confirmed:
    - `http://127.0.0.1:3001/health`
    - `http://127.0.0.1:5173`
  - browser smoke artifacts:
    - `output/web-game/m37-single-3spring/shot-2.png`
    - `output/web-game/m37-single-3spring/state-2.json`
  - deterministic shared-engine probe:
    - `output/web-game/m37-engine-probe.json`
    - confirmed:
      - `springtrapCount = 3` in single-player
      - Springtrap positions changed between the `movementBefore` and `movementAfter` snapshots instead of freezing
      - healing completes back to `healthy`
      - movement cancels healing cleanly
  - multiplayer socket smoke:
    - host and guest both still received `springtrapCount = 1` in multiplayer

## Milestone 40

- Status: complete
- New user-reported issues for the next targeted pass:
  - Springtrap appears to stop or wait outside some ledges instead of crossing them during chase
  - NPC survivors still spend too much time humping walls
  - LULU generator repair should create near-immediate killer pressure again
  - the recent multi-Springtrap single-player pass should be rolled back to one killer
  - large fenced compounds still need more internal obstacle-course structure
  - healing needs visible progress feedback
- Current behavior confirmed before edits:
  - vision code only uses authored obstacles for LOS, not ledges directly
  - AI and NPC route choice is still too naive around ledge crossings and some blocker edges
  - single-player currently still spawns multiple Springtraps through the shared `springtraps[]` path
  - healing currently works again, but lacks a dedicated progress bar
- Updated `SPEC.md` and `PLAN.md` before code changes:
  - single-player is back to one AI Springtrap
  - active LULU repair becomes a global single-player pressure cue
  - ledges must read as traversal gaps rather than sight blockers
  - maps need more internal obstacle-course density
- Implemented the single-killer and pressure/traversal pass:
  - rolled single-player back to one AI Springtrap through the shared config path
  - active LULU repair now acts as a global single-player repair cue
  - AI and NPC route choice now get more help aligning into ledge openings instead of waiting outside them
  - non-player actors now use stronger fallback route choices instead of humping one blocked direction repeatedly
- Added healing progress feedback:
  - healing now exposes mid-heal progress in text/debug state
  - the Phaser scene now draws a visible healing bar above LULU while healing
- Densified the built-in maps again:
  - added more interior blockers and crate clutter inside large fenced compounds
  - added extra inner pallets and ledges so the big compounds feel more obstacle-course-like
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - local services confirmed:
    - `http://127.0.0.1:3001/health`
    - `http://127.0.0.1:5173`
  - browser smoke artifacts:
    - `output/web-game/m40-single-smoke/shot-2.png`
    - `output/web-game/m40-single-smoke/state-2.json`
  - deterministic engine probe:
    - `output/web-game/m40-engine-probe.json`
    - confirmed:
      - `springtrapCount = 1`
      - ledge crossing probe now reaches `crossedLedge = true`
      - active generator repair pulls Springtrap into `chase` and closes distance from `1634.8` to `1410.3`
      - all NPCs moved meaningful distance during the motel movement probe
      - healing shows mid-progress state and completes back to `healthy`
  - multiplayer socket smoke:
    - `output/web-game/m40-multiplayer-smoke.json`
    - confirmed both clients still receive `springtrapCount = 1` in multiplayer

## Milestone 41

- Status: complete
- Reassessed the user-reported regression pass after new screenshots showed:
  - NPC survivors still humping walls and clustering near ledges
  - occasional NPC standstill/glitch states outside of intended repair idling
  - Springtrap appearing to freeze instead of continuing pursuit
- Root cause found in the non-player ledge routing layer:
  - actor movement was trying to auto-align to any nearby ledge before normal movement resolved
  - dense maps with adjacent ledges could pull AI/NPCs toward the wrong crossing
  - this caused stalls, bad wall-humping, and some apparent freeze states
- Implemented targeted fixes in `shared/src/engine.ts`:
  - replaced first-match ledge alignment with best-candidate ledge selection based on gap plus alignment distance
  - removed the broad pre-move ledge attraction from `moveActor`
  - kept ledge crossing explicit by only attempting traversal on the best currently approached ledge
  - changed `chooseDirectionToward` to prefer correct ledge-alignment moves before random fallback directions
  - rewrote `chooseDirectionAway` to pick the best real escape step by scoring distance gain and line-of-sight break, instead of chasing one reflected point
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - local services confirmed:
    - `http://127.0.0.1:3001/health`
    - `http://127.0.0.1:5173`
  - browser smoke artifacts:
    - `output/web-game/m41-single-smoke/shot-3.png`
    - `output/web-game/m41-single-smoke/state-0.json`
    - `output/web-game/m41-single-smoke/state-3.json`
  - deterministic regression probe:
    - `output/web-game/m41-engine-probe.json`
    - confirmed:
      - Springtrap now crosses the previously failing adjacent ledges on the quarry map
      - NPC survivors now cross the previously failing adjacent ledges instead of aligning to the wrong one
      - general single-player motion no longer shows a Springtrap idle streak while unlocked (`springtrapMaxStillMs = 0`)
      - NPC non-repair idle streaks stayed short in the general motion sample (`0` to `100 ms`)

## Milestone 42

- Status: complete
- Implemented the targeted movement probe and manual-vault pass:
  - replaced the old `60ms` route-feasibility probe with a shared short-step probe tied to `FIXED_STEP_MS`
  - reused that short-step probe across:
    - `canActorProgress`
    - target direction choice
    - path/BFS fallback scoring
    - flee scoring
  - upgraded fallback route choice to score real frame-sized progress toward the next route tile / target instead of retrying fake-progress directions
  - tightened ledge alignment acceptance so side-steps only count when they produce real alignment progress this frame
- Added manual human vaulting without changing AI/NPC auto-vaulting:
  - human LULU and human Springtrap now only vault when moving into a valid ledge and tapping `Space`
  - walking into a ledge without `Space` now stops at the ledge
  - if a valid manual vault is available on that frame, the vault takes priority over pallet drop or Springtrap attack
  - AI Springtrap and NPC survivors still auto-vault through the normal pathing layer
- Updated player-facing surfaces:
  - HUD prompt now surfaces the manual vault instruction when the local human-controlled actor is facing a valid vault
  - `render_game_to_text()` now includes:
    - `humanVaultReady`
    - `humanVaultDirection`
  - `README.md` control text and test steps now document move-plus-`Space` vaulting for human actors
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic engine probe confirmed:
    - `yard` Springtrap unlocked idle streak dropped from the previously reproduced multi-second stall to `0 ms`
    - NPC unlocked idle streaks across `yard`, `motel`, and `quarry` stayed at single-frame noise (`0` to `16.67 ms`) outside intended `repair_generator` stops
    - LULU does not vault a ledge without `Space`
    - LULU does vault with move-plus-`Space`
    - human Springtrap does not vault without `Space`
    - human Springtrap does vault with move-plus-`Space`
    - human Springtrap still attacks normally away from ledges
  - browser smoke artifacts:
    - `output/web-game/m42-single-smoke/shot-2.png`
    - `output/web-game/m42-single-smoke/state-0.json`
    - `output/web-game/m42-springtrap-smoke/shot-2.png`
    - `output/web-game/m42-springtrap-smoke/state-0.json`
  - browser smoke confirmed:
    - the client still boots into both normal single-player and QA Springtrap sessions
    - screenshots render correctly after the movement changes
    - text-state output includes the new human vault surface fields without breaking the existing summary payload

## Milestone 43

- Status: complete
- Implemented the high-pressure chase and remaining NPC ledge pass:
  - Springtrap AI now checks all four attack facings, turns toward Lulu when a side hit is available, and starts `attackWindup` without needing movement to set facing first
  - shared local movement choice now scores real frame progress, ledge-alignment gain, route/target improvement, and reversal penalties through one evaluator used by:
    - `chooseDirectionToward`
    - `choosePathDirectionToward`
    - `chooseDirectionAway`
  - BFS pathing no longer accepts the first route-direction that makes tiny progress; the route direction is now just a strong bias inside the scorer
  - search waypoints now bias farther forward along Lulu's last known direction before branching sideways
  - chase/search persistence increased by config:
    - `chaseSightLossMs = 3200`
    - `searchDurationMs = 6500`
    - `distractionEligibleInSearch = false`
  - chase memory now projects forward from the last confirmed Lulu direction before collapsing back to the exact last-seen point
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic engine probes confirmed:
    - side-contact repro now resolves to `facing = right` and `lock = attackWindup` in one frame instead of vertical oscillation
    - NPC active-mode ledge sweeps across `yard`, `motel`, and `quarry` stayed under the `12`-frame unlocked zero-movement limit for both `move_to_generator` and `flee`
    - corner-memory chase probes on all three maps reduced Springtrap-to-Lulu distance by `156px` to `353px` without committing to NPC distractions; the motel repro also entered `search` under the longer persistence window
  - browser smoke artifacts:
    - `output/web-game/m43-smoke/shot-0.png`
    - `output/web-game/m43-smoke/state-0.json`
  - browser smoke confirmed:
    - the single-player client still boots and runs after the chase/pathing changes
    - `render_game_to_text()` still reports the updated Springtrap AI state cleanly during live play

## Milestone 44

- Status: complete
- Implemented the Springtrap attack-alignment and corner-commit follow-up:
  - attack locks now store facing through `attackWindup`, `attackActive`, and `attackRecovery`, and Springtrap facing no longer drifts during a live attack
  - AI close-contact attack logic now:
    - scores all four facings
    - repositions locally before attacking if the current overlap is not a clean hit
    - predicts Lulu forward through the attack windup using the real current Lulu move input in single-player, so Springtrap stops committing to obvious side-misses near geometry
  - added Springtrap-only chase commitment state:
    - `aiCommitDirection`
    - `aiCommitRemainingMs`
    - `aiBlockedCommitFrames`
    - `aiStuckFrames`
    - `aiStuckAnchor`
  - added Springtrap AI tuning for:
    - route commitment
    - blocked commit release
    - stuck-box detection
    - clean-hit overlap thresholds
  - Springtrap chase/search routing now uses a clearance-aware walk grid instead of the old center-point-only walk grid
  - commit routing now keeps Springtrap on the same obstacle side by:
    - excluding the immediate reverse of the current commit
    - preserving commitment through LOS flicker
    - excluding reverse directions even when they appear as ledge-alignment candidates
  - nearest-walkable tile selection now picks the best candidate on a shell by actual distance instead of first-match search order, with actor-side tie-breaking
  - BFS routing now falls back to the closest reachable tile to the target instead of collapsing back to naive direct steering when the snapped goal tile is unreachable
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic engine probes confirmed:
    - the attack-drift repro now keeps the same facing from windup into active and lands the hit
    - geometry-adjacent close-contact whiff scan dropped from repeated failure cases to `0`
    - obstacle-corner chase outliers across `yard`, `motel`, and `quarry` dropped from `21` failing synthetic pairs to `4`, with the remaining outliers isolated to `quarry / ruins-rock` enclosure routes and one long-route `yard / service-car-a` pair
  - browser smoke artifacts:
    - `output/web-game/m44-yard-smoke/shot-0.png`
    - `output/web-game/m44-yard-smoke/state-0.json`
  - browser smoke confirmed:
    - the yard single-player client still boots and runs after the AI changes
    - Springtrap successfully chased Lulu into the service opening and reached `attackActive` on the kill frame
    - the screenshot and `render_game_to_text()` agree on the final chase state
- Remaining note:
  - the only deterministic route outliers still left are a small `quarry / ruins-rock` set that behaves more like enclosure detours than the earlier hard left-right corner thrash; if those become visible in live play, the next step should be a Springtrap route-goal chooser that explicitly scores reachable enclosure entrances instead of nearest tile alone

## Milestone 45

- Status: complete
- Started the requested two-phase in-place update with a full baseline inspection before code changes.
- Current architecture audit recorded and used to reset the repo docs.
- Key baseline findings:
  - Rendering/camera:
    - one Phaser scene in `client/src/game/GameScene.ts`
    - full world drawn with `Graphics`
    - manual camera follow with clamped scroll
    - fog drawn as a per-tile overlay
  - Scene flow:
    - menu, join, waiting, and round-end flow are handled by DOM overlays in `client/src/main.ts`
    - the game canvas sits inside a dashboard-like shell
  - HUD/layout:
    - visible HUD is DOM-based
    - `GameScene.ts` still carries hidden Phaser HUD/title text objects
  - Asset loading:
    - no real gameplay sprite or audio pipeline exists yet
    - runtime visuals are procedural placeholder shapes
  - Sprite sizing:
    - actor display size is currently the collider size, not a separate art/display size
  - World/screen sizing:
    - `TILE_SIZE = 32`
    - maps are `64 x 48`
    - canvas is `960 x 640`
  - Audio:
    - runtime audio is not implemented yet
  - Config:
    - gameplay values are centralized in `shared/src/config.ts`
    - presentation/audio/asset tuning is not
  - Single-player versus multiplayer:
    - shared simulation
    - separate session wrappers
    - multiplayer remains server authoritative
  - Brittle points:
    - `client/src/main.ts` is monolithic
    - current CSS/DOM shell drives a dashboard-like presentation
    - no durable asset intake path exists
- Incoming asset audit recorded in `ASSET_INTAKE.md`.
- Grounded intake findings:
  - all supplied PNGs in `assets/` are `300 x 300`
  - the repo currently contains one audio file only:
    - `assets/music.wav`
    - `139.92s`
    - stereo
    - `48 kHz`
  - no second music track was found during the pre-implementation audit
- Documentation updates completed before implementation:
  - rewrote `SPEC.md`
  - rewrote `PLAN.md`
  - added repo-level `AGENTS.md`
  - added `ASSET_INTAKE.md`
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - local dev boot check:
    - `http://127.0.0.1:3001/health` -> `200`
    - `http://127.0.0.1:5173` -> `200`
- Next:
  - start the bounded maintainability pass by extracting brittle client UI/runtime code and introducing a real asset/config structure

## Milestone 46

- Status: complete
- Completed the bounded maintainability pass with conservative structural changes and no intended gameplay drift.
- Client structure improvements:
  - replaced the monolithic `client/src/main.ts` with a thin app entry
  - extracted UI/runtime flow into `client/src/app/AppController.ts`
  - extracted DOM layout creation into `client/src/app/createAppLayout.ts`
  - extracted HUD and prompt logic into `client/src/app/hud.ts`
  - extracted `render_game_to_text()` payload construction into `client/src/app/debugState.ts`
- Rendering cleanup:
  - removed dead hidden Phaser title/HUD text objects from `client/src/game/GameScene.ts`
  - kept the existing procedural rendering path intact for now
- Config and intake cleanup:
  - added `client/src/game/clientConfig.ts` for client-side presentation/audio/sprite defaults
  - added `client/src/game/assets/manifest.ts` as a typed logical asset map
  - organized the provided art/audio into `client/public/game-assets/`
- Intake structure now includes:
  - `characters/lulu`
  - `characters/springtrap`
  - `characters/npc`
  - `environment/tiles/floor`
  - `environment/obstacles`
  - `environment/interactables/gate`
  - `environment/interactables/pallet`
  - `audio/music`
- Audio intake note:
  - only one supplied track exists, so it was normalized as `shared-theme.wav` for later title/gameplay fallback assignment
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - local dev boot check:
    - `http://127.0.0.1:3001/health` -> `200`
    - `http://127.0.0.1:5173` -> `200`
  - Playwright smoke:
    - screenshots:
      - `output/web-game/m46-smoke/shot-0.png`
      - `output/web-game/m46-smoke/shot-1.png`
      - `output/web-game/m46-smoke/shot-2.png`
    - state payloads:
      - `output/web-game/m46-smoke/state-0.json`
      - `output/web-game/m46-smoke/state-1.json`
      - `output/web-game/m46-smoke/state-2.json`
    - confirmed:
      - the app still boots into the current shell
      - `1 Player` still starts a live round
      - text-state output still reports a valid running match
- Next:
  - start the feature/presentation pass:
    - slight Springtrap retune
    - sprite-backed rendering
    - title-screen overhaul
    - music integration

## Milestone 47

- Status: complete
- Completed the feature and presentation pass.
- Gameplay balance:
  - Springtrap base speed reduced from `186` to `180`
  - LULU base speed remains `168`
  - straight-line closure rate changed from `18 px/s` to `12 px/s`
  - Springtrap still closes the gap in a straight run, but less aggressively than before
- Config updates:
  - recorded the speed change in `shared/src/config.ts` under:
    - `GAME_CONFIG.balance.springtrapBaseSpeedPrevious`
    - `GAME_CONFIG.balance.springtrapBaseSpeedCurrent`
  - added client-side presentation/audio tuning in `client/src/game/clientConfig.ts`
- Presentation updates:
  - removed the old dashboard-style shell and framed stage layout
  - the client now opens to a full-screen title screen instead of a dashboard card
  - displayed on-screen title is now `Run, Lulu, Run`
  - updated browser title to `Run, Lulu, Run`
- Art integration:
  - moved runtime rendering off placeholder actor rectangles and onto sprite-backed LULU, Springtrap, NPC, floor, wall, rock, gate, pallet, and car assets
  - increased character readability by:
    - introducing dedicated display sizes separate from collider sizes
    - zooming the gameplay camera
  - collisions and gameplay remain shared-engine-driven and unchanged by the display-scale increase
- Environment cleanup:
  - removed green backing from the copied runtime car/rock/gate/pallet assets so they sit on the floor art cleanly
- Title screen composition:
  - built the new title screen from supplied floor, gate, car, pallet, Lulu, and Springtrap art
  - kept the copy minimal and game-like
- Audio integration:
  - added browser-input unlock handling
  - added scene-aware music cue switching
  - because only one source track exists in the repo, both title and gameplay currently fall back to the same shared runtime copy
- Placeholder categories that still remain procedural:
  - generators
  - ledges
  - corpse/death markers
  - attack and repair-arrow overlays
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - `npm run check`
  - local boot checks:
    - `http://127.0.0.1:3001/health` -> `200`
    - `http://127.0.0.1:5173` -> `200`
  - full-page browser verification:
    - `output/web-game/m47-fullpage/title.png`
    - `output/web-game/m47-fullpage/gameplay.png`
    - `output/web-game/m47-fullpage/state.json`
    - follow-up after environment cleanup:
      - `output/web-game/m47-fullpage-b/title.png`
      - `output/web-game/m47-fullpage-b/gameplay.png`
  - Playwright game-loop smoke:
    - `output/web-game/m47-smoke/shot-0.png`
    - `output/web-game/m47-smoke/shot-1.png`
    - `output/web-game/m47-smoke/shot-2.png`
    - `output/web-game/m47-smoke/state-0.json`
    - `output/web-game/m47-smoke/state-1.json`
    - `output/web-game/m47-smoke/state-2.json`
  - confirmed:
    - title screen launches first
    - the visible title is `Run, Lulu, Run`
    - the game no longer reads as a dashboard shell
    - gameplay still starts correctly from the title screen
    - the shared simulation still produces a live running match after the presentation and asset changes

## Milestone 48

- Status: complete
- Completed the title-copy cleanup, shared visual scale pass, and walk-cycle rendering fix.
- Clarified presentation rule:
  - “larger characters” now means slightly larger on-screen pixels via camera/view scale, not larger sprite occupancy in world cells
  - small gameplay art now shares one cell-sized display rule
  - only cars and gates remain intentionally larger single-image props
- Config updates:
  - `client/src/game/clientConfig.ts`
    - set `CLIENT_CONFIG.camera.matchZoom` to `1.08`
    - replaced the old per-sprite display sizes with `CLIENT_CONFIG.worldVisuals.cellSizePx`
    - added `CLIENT_CONFIG.worldVisuals.walkFrameMs = 120`
- Title screen updates:
  - removed the `Top-Down Chase` kicker
  - removed the `Choose a mode to start.` copy
  - removed the title-screen audio hint text
  - kept only the `Run, Lulu, Run` title and the mode buttons on the splash screen
- Rendering updates:
  - floor and floor-alt now render one sprite per authored map tile instead of oversized `64 px` floor patches
  - Lulu, Springtrap, NPC, pallet upright/down, and rock tiles now render at the shared one-cell footprint
  - wall spans now render as repeated one-cell wall tiles instead of single stretched wall illustrations
  - cars still render to authored obstacle bounds
  - gates still render as the intentionally larger four-tile prop
- Walk animation updates:
  - Lulu, Springtrap, and NPC now share the same deterministic walk-cycle rule
  - movement loops frames `0 -> 1 -> 2 -> 0`
  - idle and facing changes reset the visible sprite to frame `0`
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - `npm run check`
  - local boot checks:
    - `http://127.0.0.1:3001/health` -> `200`
    - `http://127.0.0.1:5173` -> `200`
  - Playwright smoke artifacts:
    - `output/web-game/m48-smoke/shot-0.png`
    - `output/web-game/m48-smoke/shot-1.png`
    - `output/web-game/m48-smoke/shot-2.png`
    - `output/web-game/m48-smoke/state-0.json`
    - `output/web-game/m48-smoke/state-1.json`
    - `output/web-game/m48-smoke/state-2.json`
  - full-page verification artifacts:
    - `output/web-game/m48-fullpage/title.png`
    - `output/web-game/m48-fullpage/gameplay.png`
    - `output/web-game/m48-fullpage/lulu-up-walk-a.png`
    - `output/web-game/m48-fullpage/lulu-up-walk-b.png`
    - `output/web-game/m48-fullpage/state.json`
  - confirmed:
    - the splash screen shows only the game title and action buttons
    - the gameplay view no longer displays oversized multi-cell characters and small props
    - rocks, pallets, and floor tiles now share the same one-cell visual scale
    - gate and car remain the only obviously larger props
    - live gameplay still starts and advances correctly after the rendering changes

## Milestone 49

- Status: complete
- Completed the QA follow-up pass for chase tuning, movement forgiveness, single-map defaults, and UI/title cleanup.
- Springtrap tuning:
  - reduced base movement speed from `180` to `176`
  - increased attack recovery from `380 ms` to `620 ms`
  - increased Springtrap ledge traverse from `420 ms` to `720 ms`
  - increased chase persistence:
    - `closeContactRadiusPx` from `96` to `128`
    - `chaseSightLossMs` from `3200` to `5500`
    - `chaseEscapeDistancePx` from `320` to `448`
    - `searchDurationMs` from `6500` to `8500`
  - tightened reroute recovery:
    - `routeCommitMs` from `450` to `650`
    - `blockedCommitFrames` from `6` to `4`
    - `stuckFrames` from `12` to `8`
- Ledge and chase behavior:
  - Springtrap pathfinding no longer treats ledges as permanently blocked path cells, so chase routing can stay committed across ledge traversals
  - shared simulation sanity check placed Lulu and Springtrap around a ledge and confirmed Springtrap remained in `chase`
- Cornering and navigation forgiveness:
  - reduced colliders:
    - Lulu `14x14 -> 12x12`
    - NPC `14x14 -> 12x12`
    - Springtrap `20x20 -> 18x18`
  - increased ledge approach/alignment forgiveness:
    - `ledgeApproachRangePx` `72 -> 88`
    - `ledgeAlignSlackPx` `6 -> 14`
  - added `cornerAssistPx = 8` and updated axis resolution so tight corner grazes can slide instead of hard-catching
- Diagonal movement:
  - added human diagonal movement support through a shared `MoveIntent`
  - last pressed cardinal direction now drives facing while movement can use both axes
  - diagonal speed is normalized so movement is not faster on diagonals
- Map/content changes:
  - collapsed the built-in runtime catalog to one map
  - updated the default built-in map name to `QA Grounds`
  - removed car obstacles from the built-in QA map
  - densified the QA map with extra rock pockets and blocker clusters to reduce oversized open lanes
  - the map editor now opens on the default QA map instead of a blank map
  - the map editor no longer offers `Car` as a placement option
- Floor-art cleanup:
  - replaced the active `tile_alt` runtime copy with the clean base-floor copy to remove the dark line detail the QA screenshot called out
- UI/title cleanup:
  - title screen is now black-only with a stylized `Run, LULU, Run` treatment and exactly three actions:
    - `1 Player`
    - `2 Players`
    - `Join Game`
  - removed title art composition entirely
  - replaced the yellow/gold shell styling with a purple/silver game UI palette
  - bundled local fonts:
    - `client/public/fonts/chakra-petch-700.ttf`
    - `client/public/fonts/oxanium-500.ttf`
    - `client/public/fonts/oxanium-700.ttf`
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - `npm run check`
  - local boot checks:
    - `http://127.0.0.1:3001/health` -> `200`
    - `http://127.0.0.1:5173` -> `200`
  - Playwright smoke artifacts:
    - `output/web-game/m49-smoke/shot-0.png`
    - `output/web-game/m49-smoke/shot-1.png`
    - `output/web-game/m49-smoke/shot-2.png`
    - `output/web-game/m49-smoke/state-0.json`
    - `output/web-game/m49-smoke/state-1.json`
    - `output/web-game/m49-smoke/state-2.json`
  - full-page/browser verification:
    - `output/web-game/m49-fullpage/title.png`
    - `output/web-game/m49-fullpage/gameplay.png`
    - `output/web-game/m49-fullpage/diagonal-walk.png`
    - `output/web-game/m49-fullpage/state.json`
  - confirmed:
    - the title screen is plain black with the new stylized title and buttons only
    - the purple/silver HUD and menu palette replaced the earlier yellow/dashboard styling
    - diagonal input works and preserves last-cardinal-facing sprite selection
    - the visible QA map no longer contains cars and shows denser rock clustering than the previous default

## Milestone 50

- Status: complete
- Completed the follow-up chase and map-density pass for Springtrap tuning, repair-cue routing, pallet clarity, and a busier default QA map.
- Springtrap tuning:
  - reduced base movement speed from `176` to `171`
  - increased attack recovery from `620 ms` to `900 ms`
  - Lulu remains slightly slower at `168`, so straight-line runs still lose over time, but the speed gap is now narrow
- Repair-cue chase behavior:
  - single-player repair cues now target Lulu's live position while she is repairing, not just the generator point
  - this gives AI Springtrap the intended "god view" toward active repairs inside structures
  - deterministic sim check confirmed Springtrap entered `chase` and closed into the warehouse interior while Lulu repaired inside
- Pallet clarity:
  - added a short `downed` pallet phase before pallets disappear
  - new timing:
    - `downedVisibleMs = 420`
    - `respawnMs = 90000`
  - deterministic sim check confirmed the lifecycle now runs:
    - `upright -> downed -> respawning(hidden) -> upright`
- QA map density:
  - heavily increased interior clutter inside the major compounds with new crate and rock pockets
  - added extra blocker groups through the mid and east lanes to reduce deadspace and create more chase routing decisions
  - kept ledge entrances, generator tiles, and spawn tiles open
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - `npm run check`
  - local boot checks:
    - `http://127.0.0.1:3001/health` -> `200`
    - `http://127.0.0.1:5173` -> `200`
  - deterministic engine checks:
    - repair-cue/structure pursuit via `npx tsx --eval ...`
    - pallet downed-hide lifecycle via `npx tsx --eval ...`
  - Playwright smoke artifacts:
    - `output/web-game/m50-smoke/shot-0.png`
    - `output/web-game/m50-smoke/shot-1.png`
    - `output/web-game/m50-smoke/shot-2.png`
    - `output/web-game/m50-smoke/state-0.json`
    - `output/web-game/m50-smoke/state-1.json`
    - `output/web-game/m50-smoke/state-2.json`
  - full-page/browser verification:
    - `output/web-game/m50-fullpage/title.png`
    - `output/web-game/m50-fullpage/gameplay.png`
    - `output/web-game/m50-fullpage/state.json`
  - confirmed:
    - the title screen still stays minimal and black-backed with only the three requested actions
    - the gameplay view shows materially denser blocker packing inside the large structures
    - Springtrap remains in `chase` when repairing inside a structure pulls aggro in single-player

## Milestone 51

- Status: complete
- Completed the follow-up bug fix pass for invalid ledge landings and Springtrap choke-point stalls.
- Ledge/vault safety:
  - added a traversal destination clearance check before any ledge vault starts
  - vaults now refuse to begin if the landing rect would intersect an obstacle or occupied actor space
  - adjusted the service interior cluster so the `service-inner-left-ledge` landing side no longer crowds directly into a rock tile
- Springtrap chase routing:
  - removed stale route-commit carryover while Lulu is back in direct sight
  - Springtrap now clears old committed route bias and recalculates a direct chase line once sight is restored, which avoids visible stand-still jitter at choke points
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic engine checks:
    - service ledge vault lands on clear ground, not on an obstacle
    - direct-sight chase distance closes instead of stalling in place
  - Playwright smoke artifacts:
    - `output/web-game/m51-smoke/shot-0.png`
    - `output/web-game/m51-smoke/shot-1.png`
    - `output/web-game/m51-smoke/shot-2.png`
    - `output/web-game/m51-smoke/state-0.json`
    - `output/web-game/m51-smoke/state-1.json`
    - `output/web-game/m51-smoke/state-2.json`
- confirmed:
  - invalid blocked ledge landings are now rejected by the simulation
  - the browser smoke run completed without console errors after the routing change

## Milestone 52

- Status: complete
- Scope reset before implementation:
  - add alternating gameplay round music using the existing track plus the newly supplied WAV
  - keep title music fixed
  - advance gameplay track selection only after real round ends
  - make runtime play strict and custom-only with exactly 2 valid maps in `maps/custom/`
  - block single-player start, room create, room join, and rematch gracefully when the 2-map requirement is not met
  - keep the built-in QA map as an editor template only
  - prepare one-origin production hosting so the server can serve the built client for Render deployment
  - re-verify AI Springtrap versus human Springtrap timing after the wiring changes
- Pre-implementation verification already completed:
  - shared-engine source inspection shows both AI and human Springtrap use the same attack lock chain:
    - `attackWindup = 100 ms`
    - `attackActive = 80 ms`
    - `attackRecovery = 900 ms`
  - shared-engine source inspection shows both AI and human Springtrap ledge traversals use the same vault duration:
    - `springtrapMs = 720 ms`
  - deterministic runtime probes confirmed:
    - AI Springtrap enters `attackRecovery` for the full configured duration
    - AI and human Springtrap both start ledge vaults with the same `720 ms` lock
- Completed implementation:
  - copied the supplied gameplay WAV into `client/public/game-assets/audio/music/round-b-theme.wav`
  - split client audio config into a fixed title cue plus deterministic two-track gameplay rotation
  - advanced gameplay music only on real round-end transitions in both single-player restarts and multiplayer rematches
  - kept active round music looped in place instead of switching on track end
  - moved client server URL resolution into runtime/client config so production uses same-origin hosting while local dev still targets port `3001`
  - updated the server to bind to `process.env.PORT` on `0.0.0.0`-compatible hosting and serve the built client bundle from the same origin
  - made `/maps` return readiness metadata and blocked single-player start, room create, room join, and rematch when runtime custom-map count is not exactly `2`
  - restricted runtime play to custom maps only while leaving the built-in QA map available to the separate map editor as a template
  - removed stale autogenerated runtime maps from `maps/custom/`
  - added the Render temporary-hosting handoff and the exact-2-map editor workflow to the docs
  - fixed a follow-up client bug where an invalid map-count refresh during a finished round could clear the local catalog before surfacing the rematch error
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - production-style server smoke:
    - `npm run start:prod`
    - `http://127.0.0.1:3001/` served the built client successfully
    - `http://127.0.0.1:3001/maps` reported the strict readiness state correctly
  - strict custom-map gating:
    - verified `0`, `1`, and `3` valid custom maps each return a blocking `/maps` message
    - browser checks confirmed title actions surface the same clear message when runtime count is invalid
    - browser rematch check confirmed the finished-round overlay keeps rendering and shows the blocking message when the map count drops before rematch
  - single-player/browser checks:
    - round 1 started on `alpha-map` with `shared-theme.wav`
    - after round end, restart started round 2 on `beta-map` with `round-b-theme.wav`
    - AI Springtrap entered `attackRecovery` and stayed position-locked during the recovery window
    - AI Springtrap crossed the beta ledge via `vault` before attacking, then still entered the same attack recovery lock afterward
    - audio objects in the browser showed `loop = true` for both gameplay tracks
  - multiplayer/browser checks:
    - created and joined a live room over the production-style server
    - round order alternated `alpha-map -> beta-map -> alpha-map`
    - gameplay music alternated `shared-theme.wav -> round-b-theme.wav -> shared-theme.wav`
    - human multiplayer Springtrap showed `attackRecovery` before the second alpha hit
    - human multiplayer Springtrap manually vaulted the beta ledge, remained in `vault`, then entered `attackRecovery` after landing and attacking
  - browser artifacts:
    - `output/web-game-single/shot-0.png`
    - `output/web-game-single/state-0.json`
    - `output/multiplayer-alpha.png`
    - `output/multiplayer-beta.png`
- Cleanup:
  - created temporary validation-only custom maps for smoke testing, then removed them again
  - final runtime state intentionally ends with `maps/custom/` containing only `README.md`, so play is blocked until exactly two real custom maps are added

## Milestone 53

- Status: complete
- Scope reset before implementation:
  - stop LULU, NPCs, and Springtrap from moving visibly off-map
  - raise the live objective from 5 generators to 10
  - keep generator selection random per map load
  - ensure the current custom map pair still supports real variation at the new 10-generator count
  - replace the plain title splash with the newly supplied artwork while keeping the characters unobstructed
- Completed implementation:
  - raised `GAME_CONFIG.generator.totalCount` from `5` to `10`
  - kept gate opening tied to the completed live-generator count, so the gate now stays closed until all 10 are repaired
  - updated the HUD, prompts, state summary, and authoring docs to match the 10-generator objective
  - added shared world-edge inset clamping so LULU, Springtrap, and NPC movement all stop at the playable boundary instead of drifting visually off-screen
  - copied the supplied title artwork into `client/public/game-assets/ui/title-splash.jpg`
  - rebuilt the title screen around that artwork with the title in the top-left quadrant and the action card in the bottom-right quadrant
  - added 5 extra generator spawn points to `maps/custom/yard-custom.json` so both shipped custom maps now randomize their live set of 10 generators
  - left the built-in QA/editor template valid and unchanged at its existing 10 spawn points
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - local production-style server check:
    - `http://127.0.0.1:3001/health` -> `200`
    - `http://127.0.0.1:3001/maps` -> `ready: true`, `customMapCount: 2`
  - deterministic engine probes confirmed:
    - `forest` and `yard-custom` both produced multiple distinct 10-generator layouts across repeated loads
    - LULU clamps to `x = 16` at the left boundary
    - human Springtrap clamps to `y = 16` at the top boundary
    - NPCs clamp to `x = 2032` and `y = 1520` at the right and bottom boundaries
    - the gate stays closed with 9 completed generators and opens at 10
  - browser smoke artifacts:
    - `output/m53/title-splash.png`
    - `output/m53/live-match.png`
    - `output/m53/live-state.json`
  - browser confirmations:
    - the splash artwork renders as the title-screen background
    - the title block stays in the top-left without covering either character
    - the main action card stays in the bottom-right without covering either character
    - live browser state reports `totalGenerators = 10`
    - live browser prompt reads `Repair all 10 generators to open the gate.`

## Milestone 54

- Status: complete
- Follow-up bug fix:
  - the earlier edge clamp only covered normal walking movement
  - ledge vault interpolation could still place LULU or Springtrap past the visible safe edge
- Fix applied:
  - added shared actor-world-bound helpers in `shared/src/engine.ts`
  - raised the visual safety inset from `16 px` to `24 px`
  - made normal walking, vault destination checks, and live vault interpolation all obey the same safe world bounds
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic checks confirmed:
    - normal movement now clamps LULU and Springtrap to `24 px` from the left/top edge
    - a forced vault with `to.x = -40` still resolves back to `x = 24`

## Milestone 60

- Status: complete
- Follow-up startup hardening:
  - the map catalog loader was surfacing raw `Unexpected token ...` parser errors whenever `/maps` temporarily returned HTML instead of JSON
  - this can happen during free-host wake-up or other transient startup responses, even when the actual map files are valid
- Fix applied:
  - changed `client/src/game/mapCatalog.ts` to request JSON explicitly and bypass response caching
  - parse the `/maps` body manually so HTML/non-JSON responses turn into a friendly startup message instead of a raw syntax error
  - added short retries before failing so temporary wake-up responses do not block the player from starting immediately
  - preserved the explicit custom-map readiness message without retrying over it
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - browser smoke confirmed the single-player title flow still enters a live match after loading the map catalog
  - browser artifact:
    - `output/web-game/map-load-local-after-fix/shot-0.png`
  - second hardening pass:
    - taught the client-side `/maps` parser to tolerate a UTF-8 BOM and the common `)]}',` anti-JSON prefix before the payload
    - added a longer retry window and browser-console preview logging when `/maps` still cannot be parsed
  - browser artifact:
    - `output/web-game/map-load-local-after-fix-2/shot-0.png`
  - cache-busting follow-up:
    - added a fresh versioned endpoint at `/runtime-map-catalog.json`
    - the client now prefers that endpoint and falls back to `/maps` only if needed
    - marked both `/maps` and `/runtime-map-catalog.json` as `no-store` / `no-cache` to prevent stale browser or proxy responses from poisoning startup
  - browser artifacts:
    - `output/web-game/map-load-local-cachefix/shot-0.png`
    - `output/web-game/map-load-prod-cachefix/shot-0.png`
  - local dev port follow-up:
    - found the root cause behind the repeated local startup failure when Vite auto-moved from `5173` to `5175`
    - `client/src/game/serverUrl.ts` had only recognized the original dev port, so the client tried to fetch map data from the Vite host instead of the real server on `3001`
    - updated local server URL resolution to route any local/private-host client port back to `3001`
    - verified the fixed client enters a live round from `http://localhost:5175`

## Milestone 61

- Status: complete
- Balance and clarity update:
  - shortened treasure chest open time from `1600ms` to `900ms`
  - reduced flashlight range from `3` tiles to `2` tiles
  - changed flashlight blind logic so AYU is blinded each time she re-enters the beam during the active 30-second flashlight window
  - added a visible chest-opening progress bar above the chest, matching the existing repair/heal readability pattern
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic gameplay probe confirmed:
    - chest opening starts and resolves with the new `900ms` duration
    - flashlight range resolves to `64px` which is `2` tiles
    - AYU blind/tracker disable triggers on first entry, clears when she leaves the beam, and retriggers to a full `5000ms` on re-entry
  - validation artifact:
    - `output/web-game/m61-balance/results.json`
  - browser smoke confirmed a local round still starts successfully
  - browser artifact:
    - `output/web-game/m61-balance-browser/shot-0.png`

## Milestone 62

- Status: complete
- Visual clarity follow-up:
  - changed the AYU flashlight blind effect from a translucent wash to a full-screen white flash so the brief blind reads like a real flashbang-style hit
  - kept AYU's compass visible during flashlight tracker disable, but now draw a large red `X` over it instead of hiding it entirely
  - reduced the live treasure chest population from `10` active chests to `5`
  - changed actor walk animation from a time-only cycle to distance-based stepping so LULU and AYU visibly advance through their directional walk frames while moving instead of appearing to glide
  - hid the HUD and touch controls during AYU's white flash so the screen goes fully blank for the duration of the blind pulse
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - local browser-driven smoke check confirmed a round still starts and the live state now reports exactly `5` active chests
  - validation artifacts:
    - `output/web-game/m62-visual/shot-0.png`
    - `output/web-game/m62-visual/state-0.json`
  - movement capture check confirmed LULU renders a different mid-walk frame while moving than while idle
  - movement artifacts:
    - `output/web-game/m62-visual/walk-idle.png`
    - `output/web-game/m62-visual/walk-moving.png`

## Milestone 63

- Status: complete
- Flashlight and walk-feel follow-up:
  - doubled AYU's flashlight whiteout from `160ms` to `320ms`
  - moved the flashlight hit response earlier in the shared step loop so AYU is blind-locked before movement and attacks for that frame
  - added a shared `flashBlinded` actor lock so both AI AYU and multiplayer AYU are briefly stunned and cannot move during the white flash
  - kept the tracker-disable window and red `X` compass behavior, but clearing AYU's remembered Lulu direction during the blind so the brief flash actually disrupts chase direction
  - replaced the previous distance-only walk-cycle trigger with a time-based cadence plus a short movement grace window, which keeps the older natural stride feel locally while preventing multiplayer actors from snapping back to idle between network updates
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic engine probe confirmed:
    - multiplayer AYU receives `flashBlinded`, stays in place, and gets `flashOverlayRemainingMs = 320`
    - single-player AI AYU receives the same lock and also stays in place
  - probe artifact:
    - `output/web-game/m63-flash-walk/results.json`
  - browser movement capture confirmed LULU still renders a distinct moving frame without the flappy cadence
  - browser artifacts:
    - `output/web-game/m63-flash-walk/walk-idle.png`
    - `output/web-game/m63-flash-walk/walk-moving.png`

## Milestone 64

- Status: complete
- Flashlight readability and per-hit cooldown follow-up:
  - made the flashed AYU view explicitly hide LULU during the whiteout window instead of relying only on the overlay
  - raised the gameplay UI overlay depth so the white flash truly renders above the world layer
  - changed AYU's flash-blind lock to carry total duration so the sprite can spin a full `360` degrees during the whiteout stun
  - added a shared `5,000ms` per-hit cooldown for LULU's flashlight and AYU's heart charm
  - the total item durations still tick down from `30,000ms`, but each successful hit disables that effect for `5,000ms` before it can trigger again
  - hid the flashlight/charm beam visuals while their per-hit cooldown is active
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic shared-engine probe confirmed:
    - flashlight hit applies `flashBlinded`, freezes AYU, sets `flashOverlayRemainingMs = 320`, and starts a `5000ms` flashlight cooldown
    - AYU does not get re-flashed during the cooldown window
    - after the cooldown expires, a target still inside the beam can be hit again
    - heart charm applies `charmed`, starts a `5000ms` charm cooldown, and does not reapply during the cooldown window
  - probe artifact:
    - `output/web-game/m64-flash-cooldown/results.json`
  - browser smoke confirmed a local round still starts after the renderer/state changes
  - browser artifact:
    - `output/web-game/m64-flash-cooldown/shot-0.png`

## Milestone 65

- Status: complete
- Mobile touch-control polish:
  - replaced the fixed left joystick anchor with a floating move zone so the joystick centers on the player's left-thumb press position
  - the joystick now stays hidden on touch-down and only appears once the drag clears the deadzone, which keeps the screen cleaner and makes accidental off-center presses less punishing
  - made the action button a plain unlabeled button while preserving its accessibility label
  - hid the old `Tap / Hold` caption under the action button to match the cleaner button treatment
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - mobile-style browser probe on `http://127.0.0.1:5173/?touchControls=1` confirmed:
    - the joystick is hidden before drag
    - the joystick appears after drag input begins
    - the joystick anchor follows the initial thumb press point
    - the action button renders with no visible text
    - LULU still moves under the new floating joystick input
  - validation artifacts:
    - `output/web-game/m65-touch-float/results.json`
    - `output/web-game/m65-touch-float/shot-0.png`

## Milestone 66

- Status: complete
- Audio rotation expansion:
  - copied 2 newly supplied gameplay WAVs into the project as `round-c-theme.wav` and `round-d-theme.wav`
  - expanded the gameplay round-music rotation from 2 tracks to 4 tracks while keeping the title cue fixed
  - preserved the existing round-based alternation rule, so the next round advances to the next track in the sequence instead of switching mid-round
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - local browser smoke confirmed a round still starts successfully and the debug state now reports `gameplayTrackCount = 4`
  - browser artifacts:
    - `output/web-game/m66-audio-rotation/state-0.json`
    - `output/web-game/m66-audio-rotation/shot-0.png`

## Milestone 67

- Status: complete
- Gameplay audio rotation trim:
  - removed the older 2 gameplay tracks from round rotation
  - gameplay rounds now rotate only between the 2 newly supplied songs
  - kept the title music fixed and unchanged
- Validation:
  - `npm run typecheck`
  - `npm run build`

## Milestone 68

- Status: complete
- Title-audio swap:
  - changed the fixed title cue to use the copied `round-d-theme.wav` track (`pink noiserunlulurun.wav`)
  - left gameplay rotation unchanged at the 2 new round tracks
- Validation:
  - `npm run typecheck`
  - `npm run build`

## Milestone 69

- Status: complete
- AYU tracking and hit-spin escape tuning:
  - restored stronger AI pressure toward visible generator-repair cues so AYU resumes closing in instead of lingering in attack/reposition logic
  - allowed LULU to keep moving while in the post-hit spin lock, which gives the escape window more real distance
  - kept the rest of the hit-stun and attack handling unchanged
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - local browser smoke confirmed the client still boots cleanly
  - browser artifact:
    - `output/web-game/m73-smoke/shot-0.png`

## Milestone 70

- Status: complete
- AYU repair pursuit override:
  - changed generator-repair awareness back into a hard chase override so AYU immediately commits to pursuing LULU while repairs are happening
  - when the repair cue is active, AYU now refreshes chase memory and keeps pressure on LULU instead of treating repair as a soft movement target
  - preserved the LULU `hitSpin` movement allowance from the prior pass
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - local browser smoke confirmed the client still boots cleanly
  - browser artifact:
    - `output/web-game/m74-smoke/shot-0.png`

## Milestone 71

- Status: complete
- AYU repair cue restoration:
  - restored the LULU repair signal so it is not suppressed by nearby pallets, healer NPCs, or chests
  - kept the single-player global repair cue behavior intact so AYU can lock on to LULU from anywhere while she is actively repairing
  - left the hit-spin movement exception unchanged
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - local browser smoke confirmed the client still boots cleanly
  - browser artifact:
    - `output/web-game/m75-smoke/shot-0.png`

## Milestone 72

- Status: complete
- AYU repair cue timing:
  - refreshed LULU's repair cue before AYU's AI decision step so the global repair signal is visible in the same frame LULU starts repairing
  - kept the end-of-step repair progress update intact so generator progress still advances normally
  - preserved the LULU hit-spin movement allowance
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - local browser smoke confirmed the client still boots cleanly
  - browser artifact:
    - `output/web-game/m76-smoke/shot-0.png`

## Milestone 73

- Status: complete
- AYU repair magnet restoration and wrench cooldown:
  - traced the AYU repair regression to the single-player chest-priority branch added in `a25a6e9`, which was running before repair pursuit and letting visible treasure chests override the old generator-repair chase behavior
  - made repair cues override chest pursuit again, including interrupting chest opening so AYU immediately returns to chasing a repairing LULU
  - added a `5,000ms` wrench throw cooldown inside the `30,000ms` wrench window, with cooldown fallback to melee attacks and a flashing wrench icon above AYU while the throw is recharging
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic probe confirmed:
    - repair cue forces `aiState = "chase"` and leaves `priorityChestId = null` even with a visible chest nearby
    - chest opening is canceled when LULU starts repairing and AYU resumes moving toward her
    - wrench attacks cycle `projectile -> melee -> projectile` across the cooldown window
  - probe artifact:
    - `output/web-game/m73-ai-wrench-probe.json`
  - local browser smoke still reached the title splash state
  - browser artifacts:
    - `output/web-game/m73-smoke-2/state-0.json`
    - `output/web-game/m73-smoke-2/state-1.json`

## Milestone 74

- Status: complete
- AYU repair global-vision follow-up:
  - fixed the deeper pursuit regression where repair cues could switch AYU into `chase` while still leaving pathing in the slower lost-sight route-commit mode
  - repair cues now count as direct chase vision for the route chooser, so AYU immediately drops stale commit directions and heads straight back toward a repairing LULU
  - preserved the earlier chest-interrupt behavior and the wrench cooldown work
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic probe confirmed a stale wrong-way chase commit is cleared as soon as LULU starts repairing, with AYU moving toward LULU in the same frame
  - probe artifact:
    - `output/web-game/m74-repair-vision-probe.json`
  - local browser smoke reached a live single-player round successfully
  - browser artifacts:
    - `output/web-game/m74-smoke/state-0.json`
    - `output/web-game/m74-smoke/shot-0.png`

## Milestone 75

- Status: complete
- AYU chase stickiness restoration:
  - restored AYU's short hot-pursuit grace after losing direct line-of-sight by making the route chooser honor the existing `vision.chaseMemoryMs` window
  - during that memory window, AYU clears stale wrong-way commit directions and keeps pushing toward LULU's last confirmed position instead of immediately softening into the easier-to-lose route mode
  - preserved the repair-cue override, chest visibility rules, and wrench cooldown behavior
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic probe confirmed a chase with `aiChaseSightLossMs = 200` clears a wrong-way commit and moves AYU toward the last confirmed LULU position
  - probe artifact:
    - `output/web-game/m75-sticky-chase-probe.json`

## Milestone 76

- Status: complete
- AYU 4/4 chase-pressure restoration:
  - compared the current AI against the 4/4-era build at commit `7bb0bc5` and restored two pressure behaviors that had drifted away from that version
  - chest pursuit is now opportunistic again instead of sticky: AYU only takes a chest when it is currently visible while wandering with no active item, and she stops pursuing it once it is no longer in sight
  - removed the later chase-time backward backoff behavior so AYU no longer gives ground during active pursuit around corners and ledges, matching the more relentless 4/4 feel more closely
  - after opening a chest and receiving her one item, AYU immediately re-enters chase if LULU is visible, close, or actively repairing
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic probes confirmed:
    - chase still clears a wrong-way commit and moves toward the last confirmed target during the sticky chase window
    - invisible chest commitments are dropped immediately
    - after receiving an item from a chest, AYU re-enters `chase` and clears chest priority
  - probe artifacts:
    - `output/web-game/m75-sticky-chase-probe.json`
    - `output/web-game/m76-chest-focus-probe.json`
  - local browser smoke reached a live single-player round successfully
  - browser artifacts:
    - `output/web-game/m76-smoke/state-0.json`
    - `output/web-game/m76-smoke/shot-0.png`

## Milestone 77

- Status: complete
- AYU item-focus follow-up:
  - active AYU items now create the same single-player global pursuit cue as generator repairs, so once AYU gets a heart charm or wrench she immediately locks back onto LULU instead of drifting out of pressure
  - threaded the item cue through the full AI state machine so `hunt`, `chase`, `search`, and `cooldown` all treat the item as a chase-forcing signal, and chest priority stays cleared while the item is active
  - preserved the opportunistic chest rule: AYU still only goes for a chest when she has no active item and the chest is currently visible while wandering
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic item-focus probe confirmed:
    - AYU switches from `hunt` to `chase`
    - `priorityChestId` clears immediately
    - `aiChaseSightLossMs` stays at `0` across frames while the item cue is active
  - probe artifact:
    - `output/web-game/m77-item-focus-probe.json`
  - local browser smoke reached a live single-player round successfully
  - browser artifacts:
    - `output/web-game/m77-smoke-2/state-0.json`
    - `output/web-game/m77-smoke-2/shot-0.png`

## Milestone 78

- Status: complete
- Multiplayer AYU attack-vault smoothing:
  - adjusted Springtrap's lock model so a multiplayer manual action press can carry ledge traversal inside the same melee/ranged attack flow instead of forcing a separate awkward vault lock first
  - when human-controlled AYU presses action next to a ledge in multiplayer, the attack now starts immediately and the ledge crossing runs at the same time for smoother movement
  - preserved the existing single-player and AI ledge behavior, and if traversal outlasts the attack timing it cleanly falls through into the remaining vault travel
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic probe confirmed:
    - action press near a ledge enters `attackWindup`
    - traverse data is attached immediately
    - AYU begins moving across the ledge while still in the attack lock
  - probe artifact:
    - `output/web-game/m78-attack-vault-probe.json`
  - local browser smoke reached a live round successfully
  - browser artifacts:
    - `output/web-game/m78-smoke-dev-2/state-0.json`
    - `output/web-game/m78-smoke-dev-2/shot-0.png`

## Milestone 79

- Status: complete
- Single-player AYU item-cycle and stuck handling update:
  - removed AI chest interaction entirely so single-player AYU no longer seeks, opens, or keeps priority on treasure chests
  - human-controlled AYU chest behavior remains intact; only non-human AYU chest opening is suppressed
  - added an AI-only item loop for single-player AYU: `30s` heart charm, `10s` no item, `30s` wrench, `10s` no item, then repeat
  - kept active AYU items feeding the existing global chase cue so AYU immediately refocuses on LULU while heart charm or wrench is active
  - tightened the unstuck backstep so it only fires on real blocked-in-place stutter, while ordinary short blocked commit resets now just drop the bad route and continue pathing
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic probe confirmed:
    - AYU starts with heart charm active in single-player, enters `chase`, moves toward LULU, and leaves nearby chests untouched
    - the item cycle transitions `heart_charm -> none_after_heart -> wrench` with chest state still unchanged
    - true blocked-in-place stutter triggers the short backoff commit, while a merely blocked-but-moving case does not
  - probe artifact:
    - `output/web-game/m79-ai-cycle-stuck-probe.json`
  - local browser smoke reached a live single-player round successfully with AYU already in `chase`
  - browser artifacts:
    - `output/web-game/m79-smoke/state-0.json`
    - `output/web-game/m79-smoke/shot-0.png`

## Milestone 80

- Status: complete
- Mobile overlay sizing and multiplayer host-only next-round flow:
  - tightened phone-sized overlay typography and panel sizing for the splash, join, waiting, HUD prompt, and round-end result layouts so they stop overtaking the full screen on narrow viewports
  - added explicit `isHost` session info through the server room-state payload and client runtime so multiplayer UI can distinguish host from guest reliably
  - changed multiplayer next-round flow so only the room host can start the next round, with guest clients seeing a host-only message instead of a misleading `Play Again` button
  - enforced the same host-only rule on the server rematch handler and promoted the remaining player to host if the original host disconnects
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - custom Playwright probe confirmed:
    - phone-width splash and join overlays render at a much smaller scale
    - the room creator reports `isHost: true`
    - the joining player reports `isHost: false`
    - after the host disconnects, the remaining player is promoted to `isHost: true`
  - probe artifacts:
    - `output/web-game/m80-ui-host/results.json`
    - `output/web-game/m80-ui-host/mobile-splash.png`
    - `output/web-game/m80-ui-host/mobile-join.png`
    - `output/web-game/m80-ui-host/guest-after-host-leaves.png`

## Milestone 81

- Status: complete
- Single-player AYU item-cycle downtime increase:
  - increased AI AYU's no-item downtime between heart charm and wrench phases from `10s` to `45s`
  - the single-player cycle is now `30s` heart charm -> `45s` no item -> `30s` wrench -> `45s` no item -> repeat
  - human-controlled AYU remains unchanged
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic timing probe confirmed:
    - initial phase starts at `heart_charm` with `30000ms`
    - after heart charm, AYU enters `none_after_heart` with `45000ms`
    - after the first downtime, AYU enters `wrench` with `30000ms`
    - after wrench, AYU enters `none_after_wrench` with `45000ms`
  - probe artifact:
    - `output/web-game/m81-ai-item-downtime-probe.json`
  - local browser smoke reached a live single-player round successfully
  - browser artifacts:
    - `output/web-game/m81-smoke/state-0.json`
    - `output/web-game/m81-smoke/shot-0.png`

## Milestone 82

- Status: complete
- Single-player AYU item-cycle order change:
  - changed AI AYU's loop order to start with downtime instead of heart charm
  - the single-player cycle is now `45s` no item -> `30s` wrench -> `45s` no item -> `30s` heart charm -> repeat
  - human-controlled AYU remains unchanged
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic order probe confirmed:
    - initial phase starts at `none_after_heart` with `45000ms`
    - after the first downtime, AYU enters `wrench` with `30000ms`
    - after wrench, AYU enters `none_after_wrench` with `45000ms`
    - after the second downtime, AYU enters `heart_charm` with `30000ms`
  - probe artifact:
    - `output/web-game/m82-ai-item-order-probe.json`
  - local browser smoke reached a live single-player round successfully
  - browser artifacts:
    - `output/web-game/m82-smoke/state-0.json`
    - `output/web-game/m82-smoke/shot-0.png`

## Milestone 83

- Status: complete
- Phone-first mobile presentation, landscape-only lockout, and audio visibility pause:
  - added a touch-device portrait lock overlay so phones and iPads launch into a landscape-only presentation instead of trying to run the round in portrait
  - retried browser orientation locking on touch input instead of only attempting once, so supported mobile browsers can still honor the landscape request after user interaction
  - tightened the short-height phone landscape HUD, prompt, and touch-control sizing so the gameplay layer stays dominant and the text chrome shrinks down to iPad-like scale
  - switched short-height phone landscape canvas presentation from height-fit letterboxing to width-cover cropping, which removes the giant side gutters and gives the map the screen back
  - paused music when the page becomes hidden or unloads, and resumed it only when the page becomes visible again
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - required Playwright smoke reached a live single-player round successfully
  - custom Playwright mobile probe confirmed:
    - portrait iPhone view shows the landscape-only rotate overlay
    - short landscape phone view fills the width with map-first framing and much smaller HUD/touch controls
    - iPad landscape view keeps the larger iPad framing intact
    - dispatched `pagehide` flips `audio.currentTrackPaused` to `true`
    - dispatched `pageshow` restores `audio.currentTrackPaused` to `false`
  - probe artifacts:
    - `output/web-game/m83-mobile/phone-portrait.png`
    - `output/web-game/m83-mobile/phone-landscape.png`
    - `output/web-game/m83-mobile/ipad-landscape.png`
    - `output/web-game/m83-mobile/phone-landscape.json`
  - browser smoke artifacts:
    - `output/web-game/m83-mobile/smoke-2/state-0.json`
    - `output/web-game/m83-mobile/smoke-2/shot-0.png`

## Milestone 84

- Status: complete
- Single-player AYU chase pressure restoration:
  - restored committed chase routing to use true line-of-sight instead of treating repair/item cues like direct sight, so AYU keeps taking real route commits and can stay sticky around corners again
  - re-enabled the existing stuck backoff path during chase, which lets AYU break out of in-place corner stutter instead of endlessly walking inside one blocked tile
  - added a single-player repair-start ambush: when LULU begins repairing and AYU is far away, AYU can respawn on a nearby walkable tile that is hidden by fog/out-of-view and immediately enter chase
  - tightened the ambush chooser so it samples a local ring around LULU first and ranks candidates by actual walk-path distance, avoiding hidden spawn spots that looked close on paper but still took too long to pressure
  - lowered the ambush trigger distance from `512px` to `384px` and tightened the spawn band to `224px`-`416px` so AYU shows up quickly again without spawning right on top of LULU
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - deterministic AI probe confirmed:
    - all `20/20` sampled repair-start scenarios reached visible chase pressure within `2.5s`
    - all `20/20` sampled repair-start scenarios reached close pressure within `1.5s`
    - worst sampled repair visibility time was `1200ms`
    - worst sampled repair close time was `1016.7ms`
    - worst sampled far-chase no-progress window was one frame (`16.7ms`)
  - required Playwright smoke reached a live single-player round successfully
  - probe artifacts:
    - `output/web-game/m84-ambush-sticky-probe.json`
  - browser smoke artifacts:
    - `output/web-game/m84-smoke-2/state-0.json`
    - `output/web-game/m84-smoke-2/shot-0.png`

## Milestone 85

- Status: complete
- iPhone-specific short-landscape presentation pass:
  - added a stricter phone-only landscape layout breakpoint so iPhones no longer fall back to the larger desktop title composition
  - shrank the splash logo panel and action panel on short landscape phones so the `1 Player`, `2 Players`, and `Join Game` buttons stay fully reachable on iPhone Safari
  - kept iPad and desktop presentation rules unchanged by targeting only coarse-pointer landscape screens with very short viewport heights
  - made the in-round phone HUD much lighter and less intrusive:
    - HUD pills now use much smaller text, tighter spacing, and a faint translucent background
    - the prompt box is reduced to a small low-priority caption instead of a large gameplay-blocking panel
    - touch controls are scaled down again so the map keeps visual priority
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - custom Playwright mobile probe confirmed:
    - iPhone landscape title screen keeps all three primary menu buttons on-screen and clickable
    - iPhone landscape gameplay shows a much smaller translucent HUD with the map as the dominant visual
    - iPad landscape title and gameplay remain in the larger tablet presentation
  - probe artifacts:
    - `output/web-game/m85-mobile/iphone-landscape-title.png`
    - `output/web-game/m85-mobile/iphone-landscape-gameplay.png`
    - `output/web-game/m85-mobile/ipad-landscape-title.png`
    - `output/web-game/m85-mobile/ipad-landscape-gameplay.png`
    - `output/web-game/m85-mobile/results.json`

## Milestone 86

- Status: complete
- Single-player repair-start chase cleanup plus mobile end-screen scaling:
  - removed the single-player repair ambush teleport path, so AYU no longer respawns around LULU when generator repair begins
  - made repair-start explicitly refresh AYU into chase from her current location, preserving the existing shortest-path routing and normal de-aggro flow
  - removed the now-dead ambush cooldown/runtime fields and config entries tied to the teleport system
  - rebuilt the round-end art presentation to match the splash-screen approach:
    - result art now renders as a full-screen background layer instead of an inline image block
    - the stats/actions card stays docked and fully visible on short mobile landscape screens
    - iPhone landscape now shows the win art clearly behind the end-screen card instead of pushing it off-screen
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - ran the built app locally on `http://localhost:3010`
  - required Playwright smoke reached a live single-player round successfully
  - custom engine probe confirmed:
    - `12/12` repair-start scenarios entered `chase` immediately from AYU's current position
    - worst first-frame AYU movement was `2.85px`, which matches normal movement and shows no teleport jump
    - simulated second repair-start reacquisition also stayed at normal first-frame movement (`2.85px` max)
  - custom iPhone landscape result-screen probe confirmed:
    - the result art loads as the backdrop image
    - the summary/action card remains fully inside the viewport
    - the end screen now visually reads like the splash screen, with art owning the screen
  - probe artifacts:
    - `output/web-game/m86-ai-probe.json`
    - `output/web-game/m86-mobile/iphone-landscape-result.png`
    - `output/web-game/m86-mobile/results.json`
  - browser smoke artifacts:
    - `output/web-game/m86-smoke/state-0.json`
    - `output/web-game/m86-smoke/shot-0.png`

## Milestone 87

- Status: complete
- End-screen sizing correction for desktop, iPad, and phone:
  - restored the original centered result-art figure layout for desktop and iPad so the win art no longer fills the whole screen there
  - kept the phone-only short-landscape treatment, but scoped it to that breakpoint instead of all devices
  - fixed the short-phone result card so it docks in the lower-right corner at its intended compact size instead of stretching tall
- Validation:
  - `npm run typecheck`
  - `npm run build`
  - ran the built app locally on `http://localhost:3011`
  - required Playwright smoke reached a live single-player round successfully
  - custom result-screen viewport probe confirmed:
    - desktop returns to a centered `620px` art figure with the summary below it
    - iPad landscape keeps the same centered figure-style presentation
    - iPhone landscape still uses full-screen fitted art, with a compact `260px x 130px` summary card in the lower-right
  - probe artifacts:
    - `output/web-game/m87-results-3/desktop.png`
    - `output/web-game/m87-results-3/ipad-landscape.png`
    - `output/web-game/m87-results-3/iphone-landscape.png`
    - `output/web-game/m87-results-3/results.json`
  - browser smoke artifacts:
    - `output/web-game/m87-smoke/state-0.json`
    - `output/web-game/m87-smoke/shot-0.png`
