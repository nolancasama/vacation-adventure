# Current State

## Current Goal

Chromebook camera + motion-recognition polish, based on real classroom
testing. The code and tests are done and validated headless. What's left is
checking it on a real Chromebook (Next Steps).

## What Changed (camera polish)

- `js/camera-pose.js`: `preflight()` runs from START / CONTINUE. It warms the
  model, asks for the camera, stops the tracks and resolves on the decision.
  A denial is remembered for the session. One landmarker serves the whole
  session. The sampling loop is adaptive: 50 ms spacing, with inference time
  counted toward it. The video is 480×360. `state()` reports
  `inferenceMs`/`poseHz`/`frameIntervalMs`/video size/permission/model.
  `?debug` shows a stats badge.
- `js/main.js`: `prepareCamera()` shows a "SETTING UP CAMERA…" card
  (`.camera-setup-card`) only if the decision takes more than 250 ms. A
  `launching` flag guards double clicks.
- `js/ar-handoff.js`, `js/volleyball-ar.js`: the pose timeout starts only
  after `CameraPose.start()` resolves. A separate 30 s `startLimitMs` cap
  covers a start that never finishes. New copy: "MOVE BACK — SHOW BOTH ARMS!"
  and "SHOW BOTH ARMS!". BUMP/SET also test the swept wrist path. The SPIKE
  jolt moves the overscanned `.volleyball-ar-visual` layer.
- `styles.css`: the visual layer and shake, the setup card, the debug badge,
  and `width:max-content` on both command boxes (the long framing line used
  to wrap under the JP line).
- Tests: new `tests/camera-test.js` (`npm run test:camera`). It has been
  checked against known-bad code (no preflight, fixed wait) and fails
  correctly. `handoff-test.js` and `volleyball-test.js` gained no-overlap
  checks for the framing command.

Decisions are recorded in `DESIGN_DECISIONS.md` (2026-09-29 entry).

## Test Status (2026-09-29)

- Pass: `test:camera`, `test:handoff`, `test:volleyball`, `test`, `test:e2e`,
  `test:depart`, `test:bedroom`, `test:eat`.
- `test:speech`: 1 failure, pre-existing (it also fails on 835fed0; see
  Known Issues).
- Not run this round: `test:guide`, `test:look`, `test:japanese`,
  `test:sand`, `test:soccer-voice`.

## Codex / Delegated Work

- Camera polish: done by Claude directly; nothing delegated.
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
   and inference ms; BUMP/SET/SPIKE at normal speed; the move-back framing;
   and no edges showing on SPIKE.
2. Review the phone-attention work (`test:guide` failures).

## Repository State

- Branch `main`.
- Untracked and parked (do not commit): `.ai/`, `assets/vendor/three/`,
  `js/soccer.js`, `js/soccer3d.js`, `soccer3d.css`, `tests/soccer-test.js`,
  `tests/soccer3d-test.js`.
