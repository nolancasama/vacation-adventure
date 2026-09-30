# Current State

## Current Goal

Chromebook classroom fixes (2026-09-30): phase-specific arm requirements for
volleyball, TAP TO EAT as a real fallback, and volleyball-finale layering.
The code and tests are done and validated headless. What's left is checking
it on a real Chromebook (Next Steps).

## What Changed (2026-09-30)

- `js/volleyball-ar.js`: `_hasLeftArm`/`_hasRightArm`/`_hasBothArms` and
  `_poseEnoughForPhase`. BUMP/SET and the first framing need both arms.
  SPIKE needs one complete arm, so the other arm may leave the frame with no
  pause. A one-arm SPIKE ball is served above the visible arm.
- `js/eat-game.js`: TAP TO EAT is hidden while the camera starts or works.
  It shows when the camera is off or unsupported, fails, times out or stalls.
- `js/cinematic.js` + `styles.css`: the finale overlay stays opaque, and shot
  changes are `.internal-cut` hard cuts. Each shot is a stationary clip
  around `.volleyball-finale-visual` (32 px overscan), which carries every
  shake. `.volleyball-finale-frame` matches the viewport.
- Tests: `volleyball-test.js` gained pure pose-requirement checks, live
  one-arm SPIKE runs (left and right), one-arm framing and BUMP checks, a
  finale opacity sampler (normal and reduced motion) and finale shake-layer
  probes. `eat-test.js` now expects no tap button during camera start. Each
  new check was run against the old code and failed correctly.

The earlier camera polish (2026-09-29: preflight, adaptive sampling,
move-back copy, AR SPIKE overscan) is unchanged. Decisions are in
`DESIGN_DECISIONS.md` (2026-09-29 and 2026-09-30 entries).

## Test Status (2026-09-30)

- Pass: `test:volleyball`, `test:eat`, `test`, `test:e2e`, `test:handoff`,
  `test:camera`, `test:depart`, `test:bedroom`.
- `test:speech`: 1 failure, pre-existing (passport fallback plus auto
  "Here you are."; see Known Issues).
- Not run this round: `test:guide`, `test:look`, `test:japanese`,
  `test:sand`, `test:soccer-voice`.

## Codex / Delegated Work

- Camera polish and the 2026-09-30 classroom fixes: done by Claude directly;
  nothing delegated.
- 3D soccer (`.ai/wo-soccer3d*.json`): parked by the user, uncommitted on disk
  and not accepted. Resume only if asked.
- Phone attention (chain e1268742…, `.ai/wo-phone.json`): returned but not
  yet reviewed. It is PARTIAL and already pushed; `test:guide` fails 3 checks.

## Known Issues

- `npm run test:speech` has one pre-existing failure (passport fallback plus
  auto "Here you are.").
- `test:guide` has three failures from the phone work.
- `test:soccer3d` is red and parked.
- Real-device behaviour is unverified: webcam, microphone and Chromebook
  touchpad.
- Headless harness note: a test page left awaiting a promise that never
  settles crashes the renderer after about 60 s. The crash shows up as
  AudioContext device errors followed by "Target closed". Give any
  never-settling await a timeout.

## Next Steps

1. On a real Chromebook: the fresh-permission START flow; `?debug` pose Hz
   and inference ms; BUMP/SET/SPIKE at normal speed (SPIKE with the other
   arm out of frame); the move-back framing; no edges showing on the AR
   SPIKE or any finale shake; no regular scene flashing between finale
   shots; no TAP TO EAT during "Camera starting…".
2. Review the phone-attention work (`test:guide` failures).

## Repository State

- Branch `main`.
- Untracked and parked (do not commit): `.ai/`, `assets/vendor/three/`,
  `js/soccer.js`, `js/soccer3d.js`, `soccer3d.css`, `tests/soccer-test.js`,
  `tests/soccer3d-test.js`.
