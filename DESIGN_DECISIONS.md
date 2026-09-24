# Design Decisions

This file records meaningful product, UX, visual, architectural, or behavioral decisions for this project.

For each significant decision, record:

- Date
- What was decided or changed
- Why
- Previous approach, if relevant
- Rejected alternatives, if useful

Only record decisions that may be useful to understand later.

Do NOT record:
- trivial UI adjustments
- routine bug fixes
- formatting changes
- mechanical refactors with no design consequence
- every individual code modification

Git is the source of truth for detailed code-change history.

A useful rule:

> If a future developer or AI could reasonably ask, "Why is it designed this way?", record the answer here.

---

## 2026-09-24 — Spoken answers only where the answer means something

**What.** The player answers out loud (browser SpeechRecognition, press-to-talk)
only where more than one answer is genuinely valid: optional activity invitations
(food offers, "Let's play!"), "Did you have fun?", "Do you want another trip?",
and Grandma's review questions. Required progression stays on buttons: passport
and ticket "Here you are.", the thank-yous, handing Grandma the souvenir,
souvenir selection, navigation and the tap mini-games.

**Why.** Speech is there to practise producing meaning. Making a child say a line
just to move the script forward adds friction, and it makes progression depend on
classroom speech recognition working.

**Rejected.** Converting every button for consistency; also always-on/proximity
listening.

## 2026-09-24 — Declining an activity means "not yet"

**What.** A spoken "no" to an optional activity (cinematic `offer` step) ends the
event before any coins, photo or completion. The hotspot stays open and can be
accepted later. Nothing records the refusal. The Leave button now appears once
at least one photo is taken, not only when every activity is done. "All photos
taken!" still means every activity.

**Why.** A refusal must never trap the player or count as a memory. Ticketed
sightseeing events use a button and can't be refused, so one memory is always
reachable.

**Rejected.** Refusal flags, per-destination refusal branches, and completing
the event "as refused".

## 2026-09-24 — Grandma reviews real memories, not a multiple-choice quiz

**What.** The review asks only about completed events. When there is a memory,
the player names it out loud and matching is by keyword: the caption's object
plus the event's `speechAliases`. Grammar and tense are not graded, and the full
model sentence is played back. A recognised wrong answer gets "Hmm? Really?" and
the passport or photo. With no memory, the only option is a single "Nothing."
button (no mic), and Grandma reacts. The multiple-choice list built from every
destination was removed.

**Why.** The practice is in recalling and saying your own experience. Picking
another country's sentence from a list tested reading, not memory.

## 2026-09-24 — Speech failure never blocks progress

**What.** Every spoken prompt has a ladder. After the first miss the player sees
"Try again." plus a sentence-frame hint, then a vocabulary cue. After three
misses the contextual answer buttons appear. A blocked or broken mic
(not-allowed, network, …) shows the buttons at once. With no SpeechRecognition,
or Settings → "🎤 Spoken answers" off, the game runs as buttons (mic-free mode).
Interim transcripts are accepted as soon as they match.

**Why.** Classroom Chromebooks and mics are unreliable. A recognition error is
not a wrong answer.

## 2026-09-25 — English first, Japanese when needed

**What.** Dialogue Japanese is scaffolding, not a subtitle. Each line has a
`jpMode`: `hint` (the `say` default) hides the Japanese behind a small
"? 日本語" pill that reveals only that line and resets on the next;
`visible` shows it at once; `hidden` (the `auto` default, for the player's
quick exclamations) never shows it. `visible` is opted into by metadata, not
phrase lists: story exposition and the photo goal in Grandma's intro, one-off
facts ("It is 4,500 years old!"), unusual words ("sand pyramid"), the souvenir
question and its buttons, the "Nothing?…" reactions, and recovery instructions
("Look at your photo!"). Answer buttons show Japanese only when the item
opts in (souvenir selection). In the spoken-answer ladder the question's
Japanese appears from the second miss, alongside the vocabulary cue. It is not
an extra rung, so fallback buttons still come at three misses, a blocked mic
still shows them at once, and mic-free mode is unchanged. Settings → Japanese
hints off shows no Japanese anywhere, including `visible` lines, the reveal pill
and the ladder. No `jp` strings were removed.

**Why.** The children have met these phrases before. Japanese under every
line meant they read the translation instead of processing the English,
especially in Grandma's review, which is the retrieval practice.

**Rejected.** A hardcoded list of "easy phrases" compared by string; putting
the ladder's Japanese in the hint panel (revealing it in the dialogue box
works for every spoken prompt with no per-call wiring); a fourth ladder rung
for Japanese, which would delay the buttons.
