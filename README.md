# 🏝️ Vacation Adventure

An English-learning adventure game for Japanese Grade 6 students.
Grandma gives you money for a vacation — go somewhere wonderful, collect
photo-memories, come home, and tell her all about it (in English!).

**Zero dependencies. Zero required assets.** Plain HTML/CSS/JS that runs
offline straight from the folder.

## Play it

Double-click **`index.html`** (Chrome or Edge recommended).
That's it — no server, no build, no install.

- Best with sound on: characters speak their lines using the browser's
  English text-to-speech (toggleable), and there's gentle placeholder
  music/ambience for every scene.
- Progress saves automatically in the browser (localStorage). The title
  screen shows **Continue** when a save exists.

## What's in this build (Lesson 1: past-tense travel talk)

- 3 destinations — Australia (beach day), France (Paris evening),
  Egypt (desert sunset) — each with 3 cinematic activities, a souvenir
  stand, and its own music + ambient life (waves, birds, fireflies, sand).
- Passport stamps, a photo album (tap any photo to hear its sentence),
  and a vacation scrapbook that fills in live while you talk to Grandma.
- Target English: **I went to… / I ate… / I saw… / I played…**, plus
  natural travel phrases (Passport, please / Here you are / Yes, please /
  Thank you). Optional Japanese hints under every line (Settings).
- Wrong answers are gentle: Grandma shows you your own photo and asks again.

## Placeholder assets

Everything you see/hear is a labeled stand-in (the little chips show the
real filename each placeholder represents). Drop real files into `assets/`
with those exact names and the game uses them automatically — chip turns ✓.
Full artist/audio handoff list: **[ASSETS.md](ASSETS.md)**.
Game design + lesson roadmap: **[DESIGN.md](DESIGN.md)**.

## For teachers

- **Settings ⚙️** → turn Japanese hints on/off, voice on/off, and hide the
  developer asset labels for classroom use.
- The photo album doubles as a review tool: every saved photo replays its
  sentence aloud when tapped.
- One full trip (out + activities + debrief) ≈ 6–8 minutes.
- Reset save data from Settings (tap the red button twice).

## Development

```
vacation-adventure/
  index.html         shell
  styles.css         travel-journal UI theme
  js/
    core.js          state/save, screens, small FX
    audio.js         synth SFX + generative music + ambience + TTS (file-upgradeable)
    art.js           procedural painters, SVG characters, polaroids (file-upgradeable)
    ambient.js       clouds/birds/shimmer/fireflies/sand/confetti canvas
    dialogue.js      VN dialogue box + choices + JP hints
    cinematic.js     event-scene step engine (camera, fx, mini-games, photo)
    data.js          ALL content: characters, destinations, scripts
    flows.js         story director (home → map → trip → debrief → scrapbook)
    screens.js       screen builders + HUD + modals
    main.js          boot
  assets/            drop real art/audio here (see ASSETS.md)
  test-e2e.js        Playwright: plays one full vacation end-to-end
```

### Run the end-to-end test

From the repo root (where `playwright` is installed in node_modules):

```
node vacation-adventure/test-e2e.js
```

Plays a complete Australia trip — name entry, flight, passport stamp, all
three events (including the tap mini-game), souvenir, the full Grandma
debrief (with one deliberate wrong answer to exercise the photo-hint path),
and the scrapbook — while capturing screenshots to `.shots/` and failing on
any console error.
