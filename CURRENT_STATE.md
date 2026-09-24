# Current State

## Status
Playable three-destination ESL trip game (Australia, France, Egypt), deployed
from `main` (GitHub Pages workflow + Vercel).

## What Exists
- Core loop: Grandma → map → flight → passport → activities (cinematic events)
  → souvenir → flight home → Grandma review → scrapbook.
- Spoken answers: `js/speech.js` (recognizer wrapper, yes/no classifier, alias
  matching) + `VA.Dialogue.respond` / `yesNo` (mic UI, hint ladder, fallback).
  Cinematic `offer` step = optional activity that can be declined.
  See DESIGN_DECISIONS.md for which interactions are spoken vs. buttons.

## Tests
- `tests/speech-test.js` — fake recognizer: classifier/alias units, interim
  acceptance, errors/fallback ladder, cleanup, France mixed-trip playthrough.
- `test-e2e.js` — full Australia trip in mic-free (button) mode.
- Run either with `NODE_PATH=C:/Users/nolan/ui-verify/node_modules node <file>`.

## Known Issues
- New lines have no voice recordings. Recorded characters never fall back to
  TTS, so these are text-only for now: player "No, thank you." / "No, I didn't." /
  "Nothing."; Grandma "Oh no!", "Okay! Maybe later!", the three "Nothing?…"
  reactions; the kids'/vendors' "Okay! Maybe later!".
- Real-microphone behaviour is untested on classroom Chromebooks (only the fake
  recognizer has been exercised).

## Next Steps
- Check speech on a real Chromebook: mic permission prompt, recognition
  latency, children's accents against the aliases in `data.js`.
- Record the missing voice lines above.
