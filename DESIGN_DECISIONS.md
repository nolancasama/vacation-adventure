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

## 2026-09-26 — Engagement pass: the student does the vacation verb

**What.** Each vacation verb gets its own interaction, added as reusable
cinematic steps so `data.js` stays declarative:

- **SAW → `look` step.** The guide's line ("Look over there!", "Look up!",
  "Look! The pyramids!", "Now look at Coco!") is the only instruction; the
  student pans the view (arrow keys / WASD, pointer or touchpad drag, large
  on-screen arrows) until the target sits under a centre reticle for ~0.6 s.
  Generous invisible hit regions, no select button, named decoys give friendly
  feedback ("That's a pyramid! 😄") and never fail. A gentle assist appears
  after a few idle seconds (pulsing arrow toward the target) and, later, a
  "Show me" button that glides the view there, so no student is gated on aim.
  The Eiffel Tower uses the same step on the vertical axis by driving the
  existing source-image `towerPan` crop instead of the world transform.
- **PLAYED → soccer arcade.** France soccer's three-tap game becomes a short
  top-down overlay minigame (`js/soccer.js`, `{soccerGame:{…}}` step): dribble
  past three readable defenders (chaser, lane-blocker, fast last defender),
  contact knocks the ball loose to be recovered (never game over), shooting
  zone opens a LEFT/CENTRE/RIGHT aim against a visible goalkeeper. One optional
  utterance of the memory sentence "I played soccer!" fills the remaining power
  meter → ENGLISH POWER super shot (wider target, slower keeper, comic effects).
  Speech never gates shooting; mic-off shows the sentence as a tap button (the
  same pattern as the rest of the game's mic-free mode). A save repositions for
  another shot, and the keeper "slips" after two saves. Afterward the existing
  side-view park scene resumes with the ball in the net for the same photo.
  Volleyball and sand keep their tap games for now; the soccer module is the
  reference for giving each played event its own mechanic later.
- **ATE → `eatGame` step.** After the unchanged purchase/reward, the food
  appears large and the student takes 3 bites; each bite visibly removes part
  of the food (mask cut-outs), with CHOMP!/NOM! feedback. Tapping always works.
  Camera eating is **opt-in** via a small "📷 Eat with the camera" button (and a
  Settings toggle), never an automatic permission prompt: a mid-lesson browser
  prompt in front of 30 children is a classroom problem. Camera detection
  (`js/camera-mouth.js`, `VA.CameraMouth`) uses vendored MediaPipe Face
  Landmarker (assets/vendor/mediapipe, lazy-loaded on first use), mouth
  openness = lip gap / mouth width with open/closed hysteresis, ~8 checks per
  second, tracks and loop stopped when the food is finished.

**Why.** Students clicked through events like a picture book. Tying each
English instruction to an action ("Look up!" → look up) makes the reading
matter and makes the photo a memory of something the student did.

**Rejected.** More dialogue as the fix; new countries before these three are
fun; auto-requesting the camera; speech as a gate on shooting; repeating the
sentence per shot; a post-eating "I ate …!" utterance (Grandma's debrief
already asks exactly that, so it would be repetition); a live CDN for the
face model (the game must run offline/static); hand tracking.

## 2026-09-26 — Engagement pass details settled during review

**What.** Guides (ranger, Amira) step aside while the student searches and
return afterwards, so the target is never behind a person and photo
compositions are unchanged. The eating game ends on "All gone! 😋" rather
than "YUMMY!", because the unchanged feast reaction and the player's "Yummy!"
line follow straight after. Bites are cut from the existing food art with
mask holes; what a finished snack leaves (empty cone, plate, skewer) comes
from the art itself or a CSS redraw underneath, not new artwork.

**Why.** Searching around a guide's body made the decoy line fire on the
guide ("That's a pyramid!" on Amira's face); three "yummy"s in a row reads as
a bug; new per-bite artwork was not needed for a clear effect.

**Rejected.** Per-bite illustration sets; fading the food out on the last
bite (loses the satisfying empty cone / clean plate).

## 2026-09-26 — Engagement pass revision: 3D soccer, camera by default, observation screens

**What.**

- **Soccer is a compact third-person 3D minigame** (`js/soccer3d.js`,
  `VA.Soccer3D.start(cfg) → Promise<result>`), not the top-down overlay. It
  keeps the top-down design's rules: 3 readable defenders (direct chaser,
  lane blocker, shooting-area guard), contact knocks the ball 1–3 m loose to
  be recovered, a shooting state with LEFT/CENTRE/RIGHT aim against a keeper,
  retry the shot (not the course) after a save, keeper slips after two saves,
  one optional "I played soccer!" fills the power meter → ENGLISH POWER super
  shot. Aim still matters: a super shot aimed at the keeper can be saved. The
  camera follows automatically behind/above; no mouse-look. three.js r158 is
  vendored (`assets/vendor/three/`, the classic-script build so `file://`
  still works) and injected only when soccer starts, together with the
  minigame's own `soccer3d.css`. Everything is disposed on exit. When WebGL or
  three.js is unavailable, the existing top-down `VA.Soccer` runs instead, so
  soccer never blocks the trip. The France event still owns the invitation,
  refusal, GOAL scene, photo and memory ("I played soccer.").
- **Camera eating is on by default** (`facingMode: 'user'`) — a deliberate
  reversal of the earlier opt-in rule, at the user's direction. Settings →
  camera off remains the teacher's switch. Layout: big "EAT! 😋" prompt and
  food in the centre, a small mirrored preview bottom-right, a full-width
  "TAP TO EAT" bar at the bottom that works from the first frame and is never
  renamed "skip". First ever food shows an in-place Japanese control hint
  (口をあけて、とじてね！) and a looping cartoon mouth demo; no gate, no extra
  screen. `guides.eating` remembers it. A mouth-state indicator (○ ◔ ●)
  replaces any numeric readout. If the camera is running and no bite has
  happened for ~6 s, the hint returns; a tap bite in that food silences it.
- **Phone attention.** The first return with a postable photo (`phone-new`)
  plays a one-time sequence over the painted phone: notification sound, glow,
  large bouncing red badge, 2–3 pulses and "New! Share your trip! 📱", plus
  one extra gentle pulse if ignored. Opening the phone sets `phoneSeen` as
  before. Later trips get a quiet ding, a badge and one pulse, once per trip
  (`bedroomGuide.phoneNotifiedTrip`). The painted phone is never animated,
  only overlays on its hotspot.
- **Photo picker.** Single tap selects (border, ✓, "Selected", small pop),
  then a short smooth scroll reveals NEXT if it is hidden. It never advances
  on its own.
- **Observation screens.** Australia's kangaroo and Egypt's pyramids and Coco
  searches move to a dedicated full-screen `observe` presentation of
  `VA.Look` (same input, dwell, assists and cleanup), over a wide panorama
  with dynamic sprites. France stays on its existing Eiffel background in
  tower mode. One Egypt panorama serves both targets: the pyramids sit far
  right, Coco's open sand is centre-left, so each search needs its own pan.
  Panoramas are 3000×1000 (3:1) and are generated by the user from the
  prompts in `ASSETS.md`, never by code. Until a panorama file exists, the
  step falls back to today's in-scene look, so the trip stays playable.
  Existing recorded lines ("Look over there!", "Look! The pyramids!") are
  kept rather than rewritten.

**Why.** Soccer should feel like playing, not steering a dot. Camera eating is
the fun default and tapping is a real alternative, not an error path. The
first phone notification was too subtle to discover. Double-checking what's
selected and where NEXT is cost young students a hunt. Searching the same
backdrop the dialogue sits on isn't observation, and the existing Egypt art
is one pyramid filling the frame, so there was nothing to search.

**Rejected.** A full soccer simulation, free camera, or physics engine; ES
module three.js (breaks `file://`); a HOW TO PLAY screen before eating; a
CAMERA/TAP mode chooser; code-drawn or placeholder panoramas; two Egypt
panoramas; animating the baked phone art.

## 2026-09-26 — Soccer returns to the legacy tap game

**What.** France's soccer event plays the original 3-tap KICK! game again.
Both new soccer minigames (3D `VA.Soccer3D` and its top-down `VA.Soccer`
fallback) are parked: not loaded by `index.html`, not deployed, kept on disk
for later.

**Why.** The user's call when shipping the engagement pass: the 3D version was
not accepted (keyboard play could not reach the shooting line) and the user
did not want the top-down fallback live on its own either.

**Rejected.** Shipping the 2D top-down game alone as France's soccer.

## 2026-09-26 - Observation positions and webcam fallback

**What.** The Australia ranger and Egypt guide stay in their conversation
positions when their dedicated observe screens open; the observe presentation
owns the act of looking. Webcam eating is the active eating method once it is
successfully running. TAP TO EAT remains the fallback while camera startup is
pending, unavailable, disabled or failed, and returns after 10 seconds with no
camera bite; the camera continues running during that fallback.

**Why.** A dedicated observation screen no longer needs a guide to move out of
the way. A student must never be stranded by a camera that is technically on
but cannot register a bite.

**Rejected.** Hiding TAP TO EAT for as long as the camera is merely on, which
can strand a student.

## 2026-09-26 — The kangaroo's entrance is the reward for finding it

**What.** In Kangaroo Park the cinematic kangaroo waits offscreen right during
the panorama search and hops in (x 1090 → 660, then boing + hops) only after
"Found it!" closes the observe screen. If the panorama fails to load, the look
step's `fallback.before` steps bring it on stage first, because the in-scene
search needs a visible kangaroo.

**Why.** Seeing it walk in before the search gives the answer away; entering
right after the find makes the normal scene the payoff.

**Rejected.** Moving the old pre-search `roo → 760` step to after the search:
followed by the existing `roo → 660` move it made the kangaroo stop and
shuffle mid-entrance.

## 2026-09-26 — Egypt is a discovery sequence

**What.** Egypt opens on the arrival desert without pyramids or Coco. Finding
the pyramids changes the cinematic backdrop to the pyramid art; finding Coco
then brings the cinematic camel in from offscreen. The saved photo uses the
backdrop currently on screen.

**Why.** Each discovery earns its normal-scene reveal, mirroring the kangaroo
entrance. The memory must preserve the discovered pyramids.

**Rejected.** Keeping `evt.backdrop` for the photo, which would drop the
pyramids from every Egypt memory. Fallback searches reveal their targets first
because the in-scene target must be visible.

## 2026-09-27 — Beach volleyball uses body play with a timing fallback

**What.** Australia's volleyball game is now camera BUMP → SET → SPIKE using
local pose landmarks. If the camera cannot work, the same three ball paths use
a HIT-window timing control. The existing dramatic finale begins only after a
successful SPIKE and after the camera has fully stopped.

This re-enables the finale that was switched off on 2026-08-09; it plays only
after the new camera/timing game, never after the old tap game. High ball
targets (SET, SPIKE) stay below the command pill so the prompt stays readable.

**Rejected.** Speech commands, a physics simulation, and a calibration wizard.

## 2026-09-27 — France soccer is spoken: PASS → PASS → SHOOT

**What.** The 3-tap KICK game is replaced by a `soccerVoice` cinematic step:
the student says "pass" (ball player → Louis), "pass" (Louis → player), then
"shoot" (existing goal shot), each accepted on the first interim match
(`pass`/`past`, `shoot`/`shot`, whole words only). It is not a reaction task;
the ball moves only after the word. Misses ladder: "Try again!" → Japanese
hint → a button repeating the command word (never "SKIP"); soft misses keep
listening behind that button. Mic off or a hard recognizer error shows the
command button at once. Speech controls soccer; the body controls volleyball
— the two are intentionally different.

**Rejected.** Reviving the parked 3D / top-down soccer, accepting vague words
(go, kick, play, yes), and a generic skip.

## 2026-09-27 — Sports instructions for seated classrooms

**What.** Soccer: a new spoken word shows 「PASS!」と言ってね！ /
「SHOOT!」と言ってね！ at once (first PASS and SHOOT; the repeated PASS starts
bare) — a child must know the word is *said* before failing, so this
overrides the English-first ladder for these two beats. Volleyball is a
waist-up, desk-friendly camera game: copy never says stand or move back
("Show your upper body!", "Show your arms!"), move hints are short control
instructions directly under the command, and the first appearance of each
move plays a ~1.2 s CSS gesture demo (waist-up figure, no legs) while the
ball waits; retries never replay it. The demo sits beside the command, not
under it, so it does not cover the student's face. The BUMP ball meets the
lower chest (shoulders + 0.23, max 0.74) so a desk edge does not hide it.
The tap fallback gets its own tapping instruction instead of gesture copy.

**Rejected.** Tutorial screens, Next/Skip buttons, images/GIFs, live skeleton
overlays, full-body tracking, and a demo centred under the command.

## 2026-09-27 — Volleyball countdown; memories live in the bedroom

**What.** Every volleyball ball (first try and retries, camera and tap
fallback) is preceded by a quick 3 → 2 → 1 → GO! (500 ms each, GO 400 ms) so
a seated child can reset their arms; nothing is hittable until the ball
launches after GO. The gesture demo still plays only on a move's first
appearance, before the countdown. A lost pose cancels the countdown (or holds
one that was about to start) and it restarts from 3 when the child is back.
Soccer has no countdown — it waits for speech.

The HUD no longer has Photo Album 📷 or Scrapbook 📖 buttons: photos are seen
on the bedroom corkboard and the scrapbook on the bedroom's scrapbook object,
making the bedroom the place to look back on a trip. Passport and Settings
stay global. The saved-photo animation now rises and fades instead of flying
into the (removed) album button.

**Rejected.** A slower dramatic countdown, resuming a cancelled countdown
mid-way, hiding the HUD buttons with CSS, and a new bedroom album object (the
corkboard already is one).

## 2026-09-27 — Physical handoffs use waist-up movement

**What.** Speak to communicate; move to act. Passport control and receiving
the chosen souvenir use a reusable waist-up handoff: either wrist acts as the
hand, the object follows it to a visible target, and a short dwell completes
each contact. Camera-off play uses a direct button, and a quiet button assist
appears only after a long wait while a working camera continues.

**Rejected.** Finger or grasp recognition, dragging, and countdowns.

## 2026-09-27 — Social replies are spoken only at the three big rituals

**What.** The player answers out loud (via `VA.Dialogue.respond`) only where
they genuinely reply to someone: the passport officer's "Hello!" (hello / hi /
hey), the souvenir vendor's "Goodbye!" (goodbye / bye / bye bye / see you) and
Grandma's "Welcome home" ("I'm home!" / "I am home"). Matching is loose and
whole-word; the canonical line is then modelled by the player. The target is
shown before any miss via a new optional `initialHint` (🎤 HELLO! plus
「Hello!」と言ってね！ only when Japanese hints are on); callers without it are
unchanged. Mic off / hard error → one button with the same line.

Interaction rule going forward: major social ritual → STT; real yes/no
participation → existing `yesNo`; physical object action → AR handoff;
search → LOOK; food order → existing Yes/Yes please offer; souvenir choice →
visual buttons; trip memory → past-tense STT.

**Rejected.** STT for food ordering, souvenir selection, "Where is…?"
questions, "Grandma, this is for you!", activity NPC greetings, every goodbye,
small reactions, and any speech scoring.

## 2026-09-27 — Easier souvenir pickup; SPIKE uses the swept wrist path

**What.** Taking a souvenir is reach → touch → snap: no pickup dwell, a wider
0.17 zone, and only one visible wrist needed; after pickup only the carrying
wrist must stay in frame (passport and souvenir). The carry prompt is "Bring
it back!" / 手をもどしてね！. Passport pickup keeps both wrists and its dwell.
SPIKE now tests the whole wrist path between two ~10 Hz pose samples against
the ball, and only for a downward swing from a raised arm (either end above
the shoulder), so a fast strike through the ball counts on the first swing
and the upward pull-back never does.

**Rejected.** Raising the pose rate, enlarging spikeRadius or the hit window
to paper over sampling, hand/finger tracking, and loosening volleyball's
both-arm BUMP/SET pose.

## 2026-09-27 — Handoffs show the other person, not a marker

**What.** The handoff overlay shows the NPC at the right edge (waist-up crop of
the existing sprite, no tag/chip/shadow, pointer-inert, under the object and
instructions, kept in fallback). GIVE: object with the player → the visible
officer; the "PASSPORT HERE" rectangle is gone and the officer glows while the
passport dwells. The invisible zone moved from (0.77, 0.38) to the officer's
chest (0.79, 0.64) so the card never covers his face and the motion is a
natural hand-over. RECEIVE: the destination vendor (already resolved in
`_departureInner`) stands behind the souvenir. `ARHandoff` only displays
`cfg.npcId` and stays destination-agnostic.

**Rejected.** Any hand, arm, pointing or reaching graphic or animation, new or
edited character art, world-space AR (depth, floor, occlusion), and a visible
target shape for the passport.

## 2026-09-27 — Souvenir sits in the vendor's hands; hits show what they mean

**What.** The souvenir is offered smaller (145 px, 170 px once carried) and low
over the vendor's own drawn hands: shared anchor `RECEIVE_START` (0.73, 0.58)
for the France and Egypt vendors, with one art-keyed exception
(`RECEIVE_START_BY_CHAR.au_vendor` = 0.78, 0.66) because the ice-cream vendor's
arms hang down. That exception deliberately stops short of his hands' full
depth: with instant pickup, a hand resting at desk height near the bottom
edge must not grab it by accident. Volleyball hit reactions: BUMP and SET
send the ball straight up from the hit point; SPIKE glows, jolts the stage
3 px (none with reduced motion), plays the synthesized `spike` SFX and drives
the ball down and slightly away in 330 ms while it shrinks to 0.4 via a
`--ball-scale` CSS variable (so the centring translate is never overwritten).
Incoming paths, hit windows and recognition are unchanged.

**Rejected.** Hand graphics, per-destination anchors where one shared point
works, a full-screen flash, large shakes, and reusing the `.is-hit` pop for
SPIKE (it animates transform and would fight the shrink).

## 2026-09-27 — Passport handoff says TAKE, then GIVE

**Decision.** The passport instruction names each physical step: before
pickup `TAKE THE PASSPORT!` / 手でパスポートをとってね！ with a gentle glow on
the passport; once it attaches, `GIVE IT!` / 係の人にわたしてね！ (the officer
is already on screen). `_setInstruction` picks the copy from mode + stage, so
a lost-and-found pose restores the right step. Passport pickup dwell is
180 ms (`TUNING.passportPickupDwellMs`, passed to the shared `_dwell`); the
officer target keeps `dwellMs`. The fallback button reads `GIVE PASSPORT`.

**Why.** "Show your passport!" did not tell children to touch the virtual
passport and carry it to the officer, and a 350 ms pickup with no visible
change read as "I'm doing it wrong".

**Rejected.** An arrow, dotted path or hand graphic (wait for classroom
evidence); enlarging the pickup radius at the same time as shortening the
dwell (one sensitivity change at a time); "Grab it!" (less familiar word).

## 2026-09-27 — Kangaroo LOOK becomes search, then spot

**What.** The panorama search is true X+Y exploration with a smaller viewing
window. Finding the kangaroo locks that view and starts an optional in-LOOK
spot phase: the same kangaroo visibly hops between safe fixed-view positions
and the student finds it three times. It never teleports, and an untapped
landing simply leads to another hop with no penalty. The in-scene fallback
skips spot and keeps its original completion path.

**Why.** The search and the quick moving-target play are two readable beats.
The short intro stays inside LOOK instead of coupling this reusable
presentation to ranger dialogue or closing and reopening the panorama.

**Rejected.** Ranger dialogue for the transition, multiple kangaroos,
teleporting between positions, misses, lives, scores or other penalties.

## 2026-09-28 — Egypt sand play becomes a drag-build

**What.** The TAP x3 sand pyramid is replaced by `VA.SandGame`
(`js/sand-game.js`, `sandGame` step): SCOOP 3 piles → PACK 3 times →
LIFT the bucket → SMOOTH 3 rough patches → drag the FLAG to the top. Pointer
Events only (mouse, touch, pen, touchpad click-drag), no timer, score or
failure; misses slide back. Tolerances: pile snap 115 stage px, pack when
the bucket bottom reaches the mound (±105 px), reveal after a 120 px upward
drag (520 ms lift), 60 px cumulative rub per patch (nearest patch within
30 px, any direction, pointer down), flag snap 95 px. One subtle assist
after 4.5 s idle per phase. The finished pyramid and flag are the existing
props at the old final size/position, so the photo is unchanged.

**Why.** Physically building the pyramid is more satisfying and readable
than tapping a button, and drags work the same on Chromebook touchpads,
mice and touchscreens.

**Rejected.** Extending the generic `game` tap step with sand branches;
new art assets (the bucket is inline SVG, sand is CSS); a hand/finger hint
graphic; one pack per drag *release* (one continuous press counts once,
then the bucket returns); requiring back-and-forth rubbing.

## 2026-09-28 — `#stage` never flex-shrinks

**What.** `#stage` has `flex-shrink:0`. Below 960 CSS px of viewport the
flex `#app` was squeezing its layout width while `VA.Stage.fit()` also
scaled it, so the right side of every screen was clipped and hit points
drifted (found by the sand game's 700 px alignment test; it also fixed the
bedroom guide's 800x600 glow/hint alignment check).

## 2026-09-29 — Chromebook camera polish from classroom testing

**What.**
- **Early camera preflight.** START and CONTINUE await
  `VA.CameraPose.preflight()` before the look picker / `Flows.resume()`.
  The camera prompt now appears at the start of the game, not during
  passport control. Preflight warms the pose model, asks for the camera,
  stops every track at once and resolves on the decision. It never rejects,
  and it is skipped when Camera activities is off. A "SETTING UP CAMERA… /
  カメラをじゅんびしています…" card appears only if the decision takes
  more than 250 ms, so a stored permission never flashes it. A denial is
  remembered for the session: activities fall back without re-prompting
  unless `navigator.permissions` now reports granted.
- **Timeouts count only after the camera starts.** The handoff and volleyball
  pose timeouts start after `CameraPose.start()` resolves. A separate 30 s
  cap (`startLimitMs`) falls back if the start never finishes, for example
  an unanswered prompt or a stalled model download.
- **Adaptive sampling.** The pose loop spaces checks 50 ms apart, and
  inference time counts toward that. A slow Chromebook samples again at
  once instead of waiting a fixed 100 ms on top. The video request is
  480×360 front-facing. One landmarker serves the whole session.
  `?debug` shows a pose Hz / inference ms / video size badge.
- **Swept BUMP/SET.** BUMP also tests the wrist-midpoint path between two
  samples, and SET tests each wrist's path, so fast movements between
  samples still count. SPIKE is unchanged.
- **Move-back copy.** The first framing message is now "MOVE BACK — SHOW
  BOTH ARMS! / 少しうしろに下がって、りょううでを見せてね！". A later loss
  shows "SHOW BOTH ARMS! / りょううでを見せてね！". This reverses the
  2026-09-27 rule that the copy never says move back. In classrooms,
  students sat too close to the Chromebook camera for their arms to be in
  frame. The copy still never says stand.
- **SPIKE shake on an overscanned layer.** The jolt moves
  `.volleyball-ar-visual`, which holds the video, shade and fallback beach
  and extends 12 px past each edge, not the clipped root, so the screen
  underneath never shows. Pose-to-screen alignment shifts by ≤ ~1% at the
  edges, which was accepted.
- **Command boxes size to their text** (`width:max-content`, still capped at
  720 px). With `left:50%`, shrink-to-fit stopped at half the stage and the
  long framing line wrapped under the JP line.

**Why.** Real Chromebook classroom testing showed four problems. The
permission prompt appeared mid-passport and used up the fallback timeout.
Pose tracking lagged. The SPIKE shake revealed the screen underneath.
Students sat too close for their arms to be in frame.

**Rejected.** Keeping the stream open from START (the camera light would
stay on through non-camera scenes); counting permission time toward the
pose timeout; the GPU delegate or a different model (out of scope, and
unverified on Chromebooks).

## 2026-09-30 — Phase-specific arm requirements, eat fallback, finale layers

From Chromebook classroom observations.

- **Arm requirements per move.** BUMP and SET need both arms (shoulder,
  elbow and wrist on each side). SPIKE needs one complete striking arm,
  left or right, so the other arm may leave the frame mid-swing without a
  pause or "SHOW BOTH ARMS!". The first framing (before READY) still needs
  both arms, because the sequence opens with BUMP. Pose loss is judged
  against the current phase (`_poseEnoughForPhase`). A one-armed SPIKE ball
  is served above the arm that is in view.
- **TAP TO EAT is a real fallback.** It is hidden while the camera starts
  and while camera eating works. It appears when the camera is off or
  unsupported (immediately), fails, times out, or stalls (the existing
  STALL_MS rule). Space/Enter count only while it is shown. This reverses the
  earlier "tap is available until webcam eating is active" rule: students
  saw TAP TO EAT during "Camera starting…" and tapped instead of eating.
- **The volleyball finale is one opaque overlay.** It fades in once and out
  once. Shot changes inside it are hard cuts: a brief opaque black frame
  (`.internal-cut`), never a fade to transparent, which had shown the
  regular volleyball scene between shots.
- **Finale shakes move an overscanned inner layer.** Each shot is a
  stationary clipped `.volleyball-finale-shot` around a
  `.volleyball-finale-visual` that extends 32 px past every edge (the
  biggest shake is 17 px) and carries the background, the CSS void and every
  character and effect. Power-up, hit, aftershock and crater shakes animate
  only that layer. A `.volleyball-finale-frame` inside it matches the
  viewport exactly, so the composition is unchanged.

**Rejected.** Reducing the finale shake to zero (it loses the impact);
scaling the shots up instead of overscanning (changes the art framing);
making SET or BUMP one-armed (they are two-hand moves).
