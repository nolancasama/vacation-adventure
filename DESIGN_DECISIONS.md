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

## 2026-09-25 — The bedroom is the between-trip home base

**What.** The bedroom sits between trips. Its phone shares a real vacation
memory and its PC reviews a real visited place; both use only `VA.Memories`.

**Why.** Optional reflection belongs in a calm home base without interrupting
the trip loop or inventing experiences the player did not have.

**Rejected.** A diary in this version; a quiz layer.

## 2026-09-25 — Souvenirs stay with Grandma

**What.** Souvenirs remain in Grandma's living room. The bedroom reflects
travel with pennants and photos instead.

**Why.** The souvenirs are gifts to Grandma.

## 2026-09-25 — Social posts preserve photos; reviews preserve IDs

**What.** A post keeps a copy of its photo object because replaying a
destination clears that scrapbook page. Reviews store only destination and
event IDs and resolve current place details from `VA.Data`.

## 2026-09-25 — Social bonuses reward communication

**What.** A clear or minor post earns +1 coin once per photo per trip, capped
at 3 per trip. Identical captions cannot earn again. Clear and minor receive
the same reward.

**Why.** The reward is for communicating, not polish. The 12-coin allowance
already covers a full trip costing at most 9, so weak English cannot create a
money trap.

**Rejected.** Converting likes into coins.

## 2026-09-25 — Local, broad language feedback

**What.** Writing is evaluated locally and deterministically as clear, minor,
contradiction or unclear. Spelling, articles and tense can only lower a post to
minor, whose model appears as a friend's conversational reply rather than a
correction marker. Review stars are never checked against the review text.

**Why.** The systems support understandable expression and honest opinion,
not grammar scoring or sentiment policing.

## 2026-09-25 — Declining another trip returns to the bedroom

**What.** “No” to Grandma's “Do you want another trip?” now returns to the
bedroom and gives no allowance.

## 2026-09-26 — The bedroom teaches itself in sequence

**What.** After the first trip, the bedroom guides the phone first and then
the PC. One derived guide stage is calculated from persisted `seen` and `done`
flags and the available memories; the stage itself is never stored. Opening a
device marks it seen and drops its pulse to a quiet notification dot. The
first published post or review marks that device done and ends its part of the
guide.

**Why.** A student who opens the phone but does not post keeps a quiet reminder,
while the PC waits without competing for attention.

**Rejected.** Tutorial modals; locking the room or its objects until the guide
is complete.

## 2026-09-26 — Bedroom controls belong to the objects

**What.** In-world hotspots with labels shown only on hover or keyboard focus
replace the permanent label cards. The passport has left the bedroom because
the HUD already provides it.

**Why.** The room reads as a believable place while its objects remain
discoverable for pointer, touch and keyboard users.

## 2026-09-26 — Bedroom work and memory objects are visually separate

**What.** The scrapbook sits on a new nightstand, while a larger PC stands
alone on the desk.

**Why.** Giving each object its own furniture and silhouette makes the room's
interactive choices easier to recognise.

## 2026-09-26 — Phone and PC reveal a saved outcome over time

**What.** Posting and publishing are no longer instant: Posting… with a
progress bar, then online, then likes / "found this helpful" rising in
irregular steps, typing indicators, and comments or an owner reply. The final
outcome (reactions, comments, follow-up question, helpful count, owner reply)
is computed and saved the moment the student taps POST / PUBLISH REVIEW. The
animation only reveals it, through `VA.Timeline` (one pending timer per
sequence, cancel or finish, shared by phone and PC). Closing a device cancels
the sequence, and reopening or reloading shows the completed state with no
replay. The first post or review plays at normal speed, later ones at 0.6×,
and Skip › (or tapping the card) finishes at once.

**Why.** The student's English should feel as though it went out into a world
that answered. Saving first means an interrupted animation can never lose or
duplicate a post, a coin or a review.

**Rejected.** Persisting in-progress animation state; scattered `setTimeout`
chains; revealing everything at once.

## 2026-09-26 — The follow-up question is part of the comment thread

**What.** A friend's follow-up question is stored as a `kind:'question'`
comment. The reply box shows below the thread only while
`followUp.status === 'pending'`. Replies and the friend's answer append after
it. Old saves are migrated on load (`VA.Phone.migratePosts`).

**Why.** The question used to live outside the thread and render after it, so
a reply appeared above the question it answered.

## 2026-09-26 — Tutorial coaches are in-flow banners

**What.** `VA.Writing.coach` inserts its banner in document flow just before
its target instead of floating it over the page. A test checks that no coach
overlaps any visible control.

**Why.** The floating "Choose a place you visited." bubble covered NEXT, and
the writing coach covered the page heading. In-flow placement rules the whole
class of bug out.

## 2026-09-26 — Realistic app UI inside the illustrated game

**What.** The phone (Postcards) and PC (TripStars) use a crisp system font,
white cards, restrained colour and real-world conventions (avatar and
location header, full-bleed photo, like/comment counts, reaction chips,
"N people found this helpful", owner responses). The branding stays
fictional. The phone is 520 stage px wide, wider than a real phone, for
Chromebook readability.

**Why.** Contrast with the storybook world makes the devices read as "the real
internet", and the size keeps English large for classroom screens.

## 2026-09-26 — Owners respond to opinions without disputing them

**What.** Each reviewed place has a fictional operator (e.g. Pierre · Owner,
Marie · Tour Guide, Park Staff), reusing existing character art where it fits.
Stars choose the mood: 4–5 enthusiastic, 3 grateful, 1–2 negative. Negative
replies mix apologetic, sad, improve-next-time and comic-dramatic styles. A
topic word (boring, bad food, expensive, crowded, …) picks a matching line.
Comic drama is only about one reply in five. Owners never change or question
the stars, never say the opinion is wrong, and a test scans every bank entry
for insulting or disputing language.

**Why.** A negative review is valid English and a valid opinion. The comic
reply makes honesty fun without punishing it.

## 2026-09-26 — Departure has one reserved hub safe zone

**What.** Every destination hub reserves a centred band at the bottom of the
960×600 stage for “Time to go home!”. Once the hub is visible, activity cards
are measured in stage pixels and any card entering that zone, or coming within
24 px of the actual departure button, is lifted just enough to clear it. The
button is centred with equal left/right insets and auto margins so pulse,
hover and active transforms cannot replace its centring transform.

**Why.** Activity labels and completed cards can be larger than their artwork
anchor suggests. A shared rendered-rectangle rule keeps the exit readable and
clickable for current and future destinations.

**Rejected.** Per-country manual nudging, which would duplicate the rule and
could regress when card text or button size changes.

## 2026-09-26 — The phone is held up from below the screen

**What.** The phone is anchored to the stage's bottom edge, rises in when
opened, and its lower body continues past the edge and is clipped
(`overflow: clip`). The whole screen stays on the stage, so no control is ever
cut off. Auto-scroll moves only the device screen, never the overlay.

**Why.** A centred rounded rectangle read as a modal box. Holding the phone up
from below reads as a real device, and keeping the whole screen visible means
the illusion costs nothing in usability.

**Rejected.** Clipping part of the screen itself (it would hide POST / SEND).

## 2026-09-26 — One post per earned photo, one review per place

**What.** A photo is identified by trip + destination + event and can be
posted once. Posted photos stay in the picker as "✓ Posted · View" and open
the existing post. A photo from a later trip is a new photo and can be posted.
Reviews stay keyed by `destId:eventId`: a reviewed place shows its stars and
"✓ Reviewed · View" and opens the existing review, where Edit is the only way
to change it. Both pickers have an all-done message.

**Why.** Repeating the same memory to keep interacting is farming, not
communication. Ongoing interaction lives in the comment threads and review
history instead.

## 2026-09-26 — Replies are inline threads on any friend comment

**What.** Every top-level friend comment (including the follow-up question)
has a subtle "Reply" link. The reply editor opens inside that comment's thread.
A comment takes one player reply and at most one short friend acknowledgment
(`comment.replies`), with no reply-to-reply. Thanks and flavours are always
acknowledged, the follow-up question always is, and other replies usually are.
Comments and replies have stable ids, and migration nests old top-level
follow-up replies under their question.

**Why.** Replying becomes a reading choice rather than a required step, and
nesting makes "the reply renders under what it answers" true by construction.

**Rejected.** One global reply box; unlimited nested discussion.

## 2026-09-26 — Japanese is allowed; the world shows why English helps

**What.** `VA.Lang.languageOf` broadly classifies text as english, mixed,
japanese or unclear by script (kana/kanji versus Latin words, with no
percentages). The student never sees the classification. Mixed text is
judged by its English part (`englishPart`): if that part is understandable,
the post or review is normal English, with normal reactions and bonus. A
Japanese-only post publishes unchanged. Friends react 🤔 😕 😅, ask for
English, and usually one thinks "Japanese is cool!". It earns no travel bonus
yet ("your friends need some English!") and offers ✏️ Edit post. Editing
updates the same post, keeps the old comments as history, adds "Oh! I
understand now!" comments, marks it Edited and can claim the bonus under the
usual rules. Contradiction checking runs only on English, because the local
evaluator cannot read Japanese meaning. A Japanese-only reply is sent, the
friend asks for English, and one more (English) reply is allowed. On the PC a
Japanese-only review publishes, and the owner reacts to the stars
("ONE STAR?! 😱 I can't read Japanese, but…") and invites an English edit of
the same review.

**Why.** Forbidding Japanese teaches nothing. Letting international
characters visibly fail to understand, and then understand, shows why English
is useful.

**Rejected.** Blocking or auto-replacing Japanese; percentage thresholds;
exposing a language score; editing understood posts (it would wipe reply
threads and invite bonus farming).
