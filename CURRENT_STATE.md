# Current State

## Status

Playable three-destination ESL trip game (Australia, France, Egypt) with a
bedroom home base between trips, deployed from `main` (GitHub Pages workflow +
Vercel).

## What Exists

- Core loop: Grandma → bedroom → map → flight → passport → activities
  (cinematic events) → souvenir → flight home → Grandma review → scrapbook →
  bedroom.
- Bedroom: `js/bedroom.js` builds the room with separate phone, scrapbook,
  suitcase, PC, corkboard and travel-shelf objects. In-world hotspots expose
  hover/focus labels and empty objects give lightweight bilingual hints.
  `VA.Memories.list()` is the only eligibility source for the phone and PC.
  A persisted two-stage guide introduces the phone first and then the PC;
  its current stage is always derived rather than stored.
- Phone: `js/social.js` provides the fictional Postcards feed (realistic app
  UI, 520 stage px wide, held up from below the stage edge), photo-first
  composer, capped communication bonus, and a timed reveal: posting → online
  → rising likes/reactions → typing → friend comments → follow-up question.
  One post per earned photo (trip + place). Every friend comment has an
  inline Reply thread (`comment.replies`: player reply + optional
  acknowledgment). `VA.Social` holds helpers shared with the PC (avatars,
  photo crop, typing row, rising counts, device-only auto-scroll, throttled
  SFX).
- PC: `js/reviews.js` provides the fictional TripStars site: place cards, big
  star controls, free-writing review, timed publish (posting → online →
  helpful count → owner typing → owner reply), and editable history. One
  review per place; reviewed places open their review (Edit only). Owners and
  reply banks live in `VA.Reviews.owners` / `.replies`.
- Explore hubs reserve a departure safe zone (`VA.Layout.DEPART_ZONE` in
  `js/core.js`); hotspots that would crowd "Time to go home" are lifted.
- `js/look.js` (`VA.Look`) provides the reusable cinematic `look` step:
  keyboard/WASD, pointer-drag and large on-screen controls move a zoomed view
  under a dwell reticle, with friendly decoys and timed hint / Show me assists.
  Australia and Egypt use its full-screen `observe` presentation over approved
  panoramas, with moving/attracting character sprites and silent fallback to
  the original in-scene searches if panorama loading fails. France keeps the
  existing Eiffel Tower crop. The ranger and Amira stay at their conversation
  positions while observe owns the looking. Egypt's pyramid event starts on the
  arrival art, swaps to the pyramid art after its first discovery, then brings
  Coco in after the second; its saved photo records the displayed backdrop.
  `VA.Look.state()` is the read-only semantic
  harness surface, including presentation/panorama/load/fallback state.
- France soccer is spoken: the `soccerVoice` step (`VA.Cine._soccerVoice` in
  `js/cinematic.js`, prompt card in `#soccer-game`) asks PASS → PASS → SHOOT,
  reusing `_volleyPass` / `_goalShot` and `VA.Speech.listen`; the first PASS
  and SHOOT show 「…」と言ってね！ immediately; a command button
  appears only with the mic off, a hard error, or after three misses.
  `VA.Cine.soccerVoiceState()` is the test surface. The older soccer
  minigames are parked, uncommitted and not loaded:
  `js/soccer3d.js` (`VA.Soccer3D`, third-person 3D, lazy three.js from
  `assets/vendor/three/` + `soccer3d.css`) and its top-down fallback
  `js/soccer.js` (`VA.Soccer`). `js/cinematic.js` still dispatches the
  `soccerGame` step, but nothing uses it.
- `js/eat-game.js` (`VA.EatGame`) provides the `eatGame` step after the food
  reward in the ice cream, crepe and kebab events: 3 bites, each cutting
  mask holes from per-food geometry in `VA.EatGame.SHAPES` (empty cone, clean
  plate and bare skewer are redrawn underneath in CSS). TAP TO EAT is the
  fallback (full-width bar at the bottom) while camera eating is starting,
  disabled, unavailable, failed, or has stalled for 10 seconds; it hides while
  a working camera is registering eating. "EAT! 😋" is the prompt; each bite
  pops CHOMP!. The front webcam (`facingMode: 'user'`) starts by default
  unless Settings → Camera activities (`settings.camera`) is off, shown as a small mirrored
  preview bottom-right with a ○/◔/● mouth indicator; any failure quietly
  removes it. The first camera food shows 口をあけて、とじてね！ plus a looping
  mouth demo until the first camera bite (`guides.eating`); after that the
  hint returns only after ~6 s with no bite and never once the student taps.
  The same Camera activities setting controls eating, volleyball and handoffs;
  `settings.cameraEat` is unused but kept in saves.
- `js/camera-mouth.js` (`VA.CameraMouth`) is the only webcam/face-model code:
  vendored MediaPipe Face Landmarker (`assets/vendor/mediapipe/`, loaded on
  first use), lip-gap/mouth-width openness with open/close hysteresis,
  ~8 checks/s, tracks stopped when the food is finished. Unsupported under
  file:// (tap only); `_setProviderForTest()` is the test seam.
- Australia's volleyball uses `VA.VolleyballAR` for camera BUMP → SET → SPIKE,
  driven by the local vendored Pose Landmarker through `VA.CameraPose` at about
  10 checks/s. It pauses when the body leaves frame and retries only the missed
  phase with hidden adaptive forgiveness. When camera use is disabled,
  unsupported or fails, the same ball sequence becomes a HIT-window timing
  game. Camera inference and tracks stop before the existing finale begins.
  It is a waist-up (seated) game: each move's first appearance shows its
  Japanese under the command plus a CSS gesture demo while the ball waits
  (`TUNING.tutorialMs`); copy lives in `VA.VolleyballAR.HINTS` / `.COPY`.
  Every ball (retries and fallback too) follows a 3-2-1-GO! countdown
  (`TUNING.countdownMs` / `goMs`, `state().countdown`); a lost pose restarts it.
- `js/ar-handoff.js` (`VA.ARHandoff`) provides reusable waist-up present and
  receive actions, currently only for passport control and receiving the chosen
  souvenir. Either wrist picks up by a short dwell, the attached object follows
  that wrist to the officer/chest target, and lost pose pauses then resumes the
  same stage. Camera failures use a direct button; a quiet button assist appears
  after a long wait while working camera play continues. Camera inference and
  tracks stop before the handoff promise resolves.
- HUD: coins, Passport, Settings only. Photos open from the bedroom corkboard
  and the scrapbook from the bedroom scrapbook object.
- `js/timeline.js` (`VA.Timeline`) runs every reveal. Outcomes are saved
  before animating, and a reveal is never persisted or replayed.
  `window.VA_TIMELINE_SCALE` speeds it up for tests.
- `js/language.js` supplies deterministic local post/review feedback and broad
  language detection (`languageOf`, `englishPart`): Japanese-only writing
  publishes, and friends/owners ask for English; mixed text counts as English.
  Free-form mic input uses `VA.Speech.dictate()`.
- Spoken answers: `js/speech.js` (recognizer wrapper, yes/no classifier, alias
  matching) + `VA.Dialogue.respond` / `yesNo` (mic UI, hint ladder, fallback).
  Cinematic `offer` step = optional activity that can be declined.
  See DESIGN_DECISIONS.md for which interactions are spoken vs. buttons.
- English first: dialogue Japanese is hidden behind a “? 日本語” reveal by
  default (`jpMode` in `VA.Dialogue.say`; `visible` opts in per line), and the
  spoken-answer ladder reveals the question's Japanese from the second miss.

## Tests

- `tests/lang-test.js` — pure Node contract for local language evaluation.
- `tests/bedroom-test.js` — bedroom, phone, PC, persistence, bonus and route
  coverage with the required screenshot set, including reveal ordering
  (recorded with a MutationObserver), the reply-below-question regression,
  legacy-post migration, cancel-on-close, no replay after reload, owner-reply
  tone scan and Chromebook fit.
- `tests/bedroom-guide-test.js` — empty bedroom hints, hotspot geometry,
  phone-to-PC guide progression, persistence, tutorials (including a check
  that no coach banner overlaps any control) and accumulated-room screenshot
  coverage.
- `tests/speech-test.js` — fake recognizer: classifier/alias units, interim
  acceptance, errors/fallback ladder, cleanup, Japanese scaffolding (`jpMode`,
  reveal, ladder, hints off), France mixed-trip and Egypt all-spoken
  playthroughs.
- `tests/depart-test.js` — departure safe-zone geometry for partial and fully
  completed Australia, France and Egypt hubs, including stable centring during
  hover/animation and destination screenshots.
- `tests/look-test.js` — shared LOOK input, dwell/target/decoy/assist, cleanup,
  reduced-motion, panorama fallback and replay contracts plus all three
  sightseeing timelines, saved-photo composition and the
  `.shots/look/observe/` screenshot set.
- `tests/soccer-test.js`, `tests/soccer3d-test.js` — parked with the soccer
  minigames (uncommitted); they fail while soccer uses the legacy step.
- `tests/eat-test.js` — pure bite-detector units, tap path, camera path via
  a canvas stream + scripted fake landmarker (camera by default, off in Settings, tutorial/reminder, denied /
  unavailable / no-face fallbacks, tracks and loop stopped), settings, the
  three real food events and decline, plus an http smoke check that the
  vendored model loads (and is not fetched at startup); `.shots/eat/`.
- `tests/soccer-voice-test.js` — waiting fake recognizer: command matching,
  PASS/PASS/SHOOT ball path, interim acceptance, wrong words, hint ladder,
  fallback (misses, hard error, mic off), stale callbacks, cleanup, and the
  real France event (refusal, GOAL, photo); `.shots/soccer-voice/`.
- `tests/volleyball-test.js` — pose geometry and mirroring, camera lifecycle,
  BUMP → SET → SPIKE order, retry/forgiveness and lost-pose pause, timing
  fallback paths, finale handoff, real Australia event, cleanup, vendored model
  smoke coverage and `.shots/volleyball/` screenshots.
- `tests/handoff-test.js` — handoff geometry, either-wrist dwell and following,
  receive/chest carry, lost-pose resume, camera failure fallbacks, quiet assist,
  cleanup, real arrival/departure integration and `.shots/handoff/` screenshots.
- `tests/japanese-test.js` — Japanese-only, mixed and edited posts, replies
  and reviews (never blocked, English earns the normal response and bonus).
- `test-e2e.js` — full Australia trip in mic-free (button) mode.
- Run browser harnesses through their declared `npm run test:<name>` scripts;
  `tests/pw-path.js` supplies the shared Playwright installation.

## Known Issues

- The bedroom uses the painted `assets/backgrounds/background_bedroom.webp`
  (ChatGPT Images, 1200x750). Hotspots, screen overlays (the phone's is
  clip-pathed to the angled painted screen), the corkboard photo area and the
  shelf pennants are positioned to that painting; if it is ever replaced,
  re-measure the table in `VA.Bedroom.hotspots` and the `.bedroom-corkboard` /
  `.bedroom-pennants` CSS. `VA.Art.painters.bedroom` stays as the load-failure
  fallback and no longer matches the painting exactly.
- `img.decode()` can stay pending forever in headless Chromium under file://
  (seen on the pre-bedroom code too), which hung the boot cover. `_decodeEntry`
  now caps the wait at 3 s; not yet observed on a real Chromebook.
- New lines have no voice recordings. Recorded characters never fall back to
  TTS, so these are text-only for now: player “No, thank you.” / “No, I didn't.”
  / “Nothing.”; Grandma “Oh no!”, “Okay! Maybe later!”, the three “Nothing?…”
  reactions; the kids'/vendors' “Okay! Maybe later!”; Egypt guide “Now find my
  camel, Coco!”.
- Real-microphone behaviour is untested on classroom Chromebooks (only the fake
  recognizer has been exercised).
- Real-webcam eating is untested: the open/close thresholds (0.32 / 0.16 in
  `VA.CameraMouth`) are reasoned, not tuned on children's faces. Camera eating
  needs the hosted (http/https) build; opening `index.html` from disk is
  tap-only.
- The phone attention work (item 3 below) is live but unfinished:
  `npm run test:guide` fails 4 checks (phone-new dot, glow/hint alignment at
  800x600, pc-new gold star screen, no effects once done).
- The intermittent LOOK harness crashes ("Coco dwell", "active look did not
  finish: pyramids") were harness steering bugs, fixed 2026-09-26: helpers
  switch axis when the view is pinned at a pan limit, and wait for dwell only
  at `distance === 0` (inside the target). Both helpers print
  `VA.Look.state()` if a look ever fails to finish.

## Codex / Delegated Work

Engagement pass revision (2026-09-26, see the newest DESIGN_DECISIONS entry).
Codex is available (quota refilled). Route each item through `delegate.js` as
usual.

1. **Eating (`.ai/wo-eat.json`) — DONE, accepted.** Reviewed screenshots,
   `npm run test:eat` green after one controller fix (the prompt stays "EAT!"
   during a bite; only the big pop says CHOMP!). Docs updated.
2. **3D soccer — parked by the user (2026-09-26); live game uses legacy
   soccer.** Resume only if asked. First pass on disk, uncommitted, NOT
   accepted. Chain from
   `.ai/wo-soccer3d.json` changed js/soccer3d.js, soccer3d.css,
   tests/soccer3d-test.js, index.html, js/cinematic.js, tests/soccer-test.js,
   tests/speech-test.js (forces 2D), CURRENT_STATE.md. `test:soccer` and
   `test:speech` green; `test:soccer3d` red (keyboard play never reached the
   shooting line). Next: run `.ai/wo-soccer3d-fix.json` (never started; chain
   6a524ad2 stopped on quota before any change). It covers reachability, aim
   framing, zones on the goal, d-pad hiding, super-shot banner, full harness.
3. **Phone attention + photo picker — PARTIAL on quota**, chain
   e1268742-a323-49c8-b450-5829bfee60dc, from `.ai/wo-phone.json`. Changed
   js/bedroom.js, js/social.js, js/core.js, styles.css,
   tests/bedroom-guide-test.js, tests/bedroom-test.js (+617/−23).
   `test:bedroom` passed, `test:guide` failed; unreviewed, but committed and
   pushed live at the user's request (2026-09-26). Resume with the same order plus a partial-work brief:
   inspect the existing diff, keep what is correct, repair or revert what is
   wrong, then finish and validate.
The controller writes the CURRENT_STATE/DESIGN_DECISIONS updates for item 3
after review (that order was told not to edit docs).

## Next Steps

- On a real Chromebook (hosted build): soccer PASS/SHOOT recognition latency
  and accuracy with children; Pose Landmarker frame rate; BUMP/SET/SPIKE
  thresholds (`VA.VolleyballAR.TUNING`, hit window 430 ms) for children;
  camera permission in managed Chrome.

- Try webcam eating on a real Chromebook (hosted build) and tune the
  open/close thresholds if bites are missed or doubled.
- Add the painted bedroom background while preserving the procedural fallback.
- Check speech and dictation on a real Chromebook: permission prompt,
  recognition latency and children's accents.
- Record the missing voice lines above.
