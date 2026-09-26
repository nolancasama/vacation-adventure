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
- `tests/japanese-test.js` — Japanese-only, mixed and edited posts, replies
  and reviews (never blocked, English earns the normal response and bonus).
- `test-e2e.js` — full Australia trip in mic-free (button) mode.
- Run browser harnesses with
  `NODE_PATH=C:/Users/nolan/ui-verify/node_modules node <file>`.

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
  reactions; the kids'/vendors' “Okay! Maybe later!”.
- Real-microphone behaviour is untested on classroom Chromebooks (only the fake
  recognizer has been exercised).

## Next Steps

- Add the painted bedroom background while preserving the procedural fallback.
- Check speech and dictation on a real Chromebook: permission prompt,
  recognition latency and children's accents.
- Record the missing voice lines above.
