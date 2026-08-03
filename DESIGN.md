# Vacation Adventure — Design Document

A 2D educational adventure game for Japanese Grade 6 students (11–12).
Visual-novel / anime-adventure presentation. **The vacation is the game.
The English is the storytelling.**

## Philosophy

The player never takes a grammar test. They go on a vacation, collect
photo-memories, and then *share those memories with Grandma* — which happens
to require exactly the target English. Wrong answers are never punished:
Grandma simply shows you your own photo ("Look at your photo!") and asks again,
so recovering IS re-reading the target sentence.

Every sentence in the game communicates one idea. Receptive language (what
NPCs say) stays one small step above productive language (what the player
says via choice buttons, spoken aloud by TTS).

## Core loop

```
Grandma gives money → choose destination on the map → flight
→ passport stamp ("Passport, please." / "Here you are.")
→ explore the destination hub (3 activities, player picks the order)
→ each activity = cinematic event scene → automatic vacation photo
→ souvenir stand ("The koala, please.") → flight home
→ Grandma's questions (Where did you go? What did you eat/see/play?)
→ answers fill the scrapbook page live → souvenir gift → page complete 🎉
→ next trip … until all pages are done → SUPER TRAVELER finale
```

## Grammar roadmap

| Lesson | Patterns | Status |
|---|---|---|
| **1 (this build)** | I went to… / I ate… / I saw… / I played… (+ Yes, please / Thank you / Here you are) | ✅ playable |
| 2 | I bought… / I took (a photo/a bus)… — extend the souvenir & transport beats | planned |
| 3 | I visited… / I liked… / It was (fun/big/beautiful) — feelings page in the scrapbook | planned |
| 4 | Did you…? / Yes, I did. / No, I didn't. — Grandma's yes-no round, player asks HER questions | planned |

The engine already supports this: questions/answers live in `js/data.js`
(`DEBRIEF_QUESTIONS`, per-destination `sentences` and event `caption`s), so a
new lesson is mostly new data.

## Destinations (this build)

| | Australia 🇦🇺 | France 🇫🇷 | Egypt 🇪🇬 |
|---|---|---|---|
| Mood | bright beach day | romantic evening | golden desert sunset |
| ate | ice cream | a crepe | a kebab |
| saw | a kangaroo | the Eiffel Tower | the pyramids |
| played | volleyball | soccer | in the sand |
| souvenirs | koala / seashell | little tower / beret | gold pyramid / camel toy |

Each destination = one object in `VA.Data.DESTS`. To add a destination:
copy the object, write 3 events (steps use the cinematic vocabulary in
`js/cinematic.js`), add a painter (or just real art files), done.

## Cinematic event grammar

Events are step lists — slow zooms, one-line dialogue, an effect moment,
then the shutter. Example storyboard (ice cream):

```
slow zoom to cart → "Hello!" → "One ice cream?" → player: "Yes, please!"
→ coins fly → cone appears → "Here you are." / "Thank you!"
→ hand-off, camera pushes in close → sparkle → bite sound → "Yummy!"
→ white flash + shutter → polaroid drops in → sentence echo:
   "I ate ice cream." (spoken) → photo flies into the album
```

The **sentence echo at the moment of the memory** is the pedagogical core:
the sentence is attached to an emotional moment, then retrieved later in
Grandma's debrief, then re-read again in the scrapbook. Three exposures,
all inside the fiction.

Every "play" event has a tiny 3-tap mini-game (rally / kick / sand-stack) so
"played" memories physically feel like play.

## Money

Grandma gives 12 coins per trip. Food 3 · sight ticket 3 · play free ·
souvenir 3 → 3 coins always left over (numbers stay small and positive;
no arithmetic stress, and the wallet slowly grows across trips).

## Audio spec

Every scene defines: **music** (theme id), **ambient beds** (waves, wind,
market…), **character sounds** (boing, camel, gull), **interaction sounds**
(coins, camera, stamp, bite, kick…). See ASSETS.md for the full per-scene
lists. Until real files exist, a soft WebAudio stand-in plays: generative
plucked-note themes per destination and filtered-noise ambience — quiet on
purpose, and all toggleable in Settings.

## Environmental animation

Built-in effect vocabulary (canvas overlay): drifting clouds · birds
(gulls/pigeons/hawks) · ocean shimmer · tower-light twinkle · fireflies ·
falling leaves · blowing sand · window-light dust motes · confetti bursts;
plus DOM effects that ride the cinematic camera: sparkles, hearts, steam.
Scene configs live next to each destination in `js/data.js`.

## Camera

No free camera. Cinematic moves only: slow pan, slow zoom, fade in/out,
reveal, focus on landmark (`{cam:{x,y,s,dur}}` steps), plus a slow idle
drift on exploration scenes.

## UI inventory

Travel map · passport (stamps) · vacation scrapbook (pages per destination) ·
photo album (tap a photo → hear its sentence again — built-in review tool) ·
dialogue box with 🔊 replay and optional Japanese hints · large choice
buttons · coins pill · settings (music/sfx/voice/JP hints/asset labels).

## Future ideas (not built)

- **Speaking mode:** answer Grandma by *saying* the sentence (Web Speech API
  recognition), with the choice buttons as fallback — same pattern as the
  agent-briefing project.
- Weather/time variants per revisit (rainy Paris, night beach).
- A photo-frame decoration mini-screen after each trip.
- Printable scrapbook page (PDF) for classroom display.
