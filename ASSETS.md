# Vacation Adventure — Asset Manifest

The game ships with **zero real assets**. Every visual and sound is a labeled
placeholder (procedural canvas painting, generated SVG figure, emoji prop, or
WebAudio synth). Each placeholder shows a small chip with the filename below.

**To upgrade any asset:** drop the real file into the matching folder with the
exact filename. The game detects it automatically the next time the scene loads
(the chip turns into a ✓). No code changes needed.

```
assets/
  backgrounds/   PNG, 1920×1200 (displayed at 960×600, 2× for crisp scaling)
  characters/    PNG with transparency, ~300px tall, full body, front-facing
  objects/       PNG with transparency, ~128px
  audio/sfx/     WAV, short one-shots
  audio/ambient/ WAV, loopable, 20s+
  audio/music/   MP3, loopable
  audio/voice/   WAV (future: recorded lines replace text-to-speech)
```

Art direction for all backgrounds: **painted anime / light-novel style,
warm cinematic lighting, soft painterly shading, rich environmental detail.**
Characters: expressive anime style, kid-friendly proportions.

---

## Global / UI

| File | Description |
|---|---|
| `backgrounds/background_title.png` | Bright tropical bay, big sky, distant island — invites adventure |
| `backgrounds/background_travel_sky.png` | Above the clouds, soft sunlight, cloud sea below |
| `backgrounds/background_map_world.png` | Storybook world map, painted ocean, stylized continents, dotted flight routes |
| `characters/player.png` | The player: cheerful 11-year-old traveler, coral T-shirt (also: `player_happy` / `player_wow` expressions later) |
| `characters/grandma.png` | Warm smiling grandma, glasses, silver bun, lavender cardigan |
| `characters/officer.png` | Friendly airport officer, navy uniform + cap |
| `objects/plane.png` | Small friendly passenger plane, side view, red tail |

**Sounds (interaction, used everywhere)**
`sfx/click.wav` `sfx/tap.wav` `sfx/pop.wav` `sfx/coins.wav` `sfx/camera.wav`
`sfx/chime.wav` `sfx/fanfare.wav` `sfx/stamp.wav` `sfx/page.wav` `sfx/hmm.wav`
`sfx/heart.wav` `sfx/cheer.wav` `sfx/plane.wav`

**Music**
`music/theme_title.mp3` (bright, welcoming) · `music/theme_map.mp3` (light travel bounce) ·
`music/theme_travel.mp3` (upbeat flying) · `music/theme_scrapbook.mp3` (music box, tender)

---

## Home — Grandma's Living Room

| File | Description |
|---|---|
| `backgrounds/background_home_livingroom.png` | Cozy Japanese living room, morning light through window, sofa, rug, framed photos, teapot |

- **Music:** `music/theme_home.mp3` — gentle, warm, nostalgic
- **Ambient:** `ambient/room.wav` — quiet room tone, clock, distant birds
- **Animation notes:** dust motes in the window light, teapot steam

---

## 🇦🇺 Australia — Sunny Beach (day)

| File | Description |
|---|---|
| `backgrounds/background_australia_beach.png` | Golden sand, turquoise ocean, beach umbrella, palms, sailboat |
| `backgrounds/event_australia_icecream.png` | Close-up of a cute ice-cream cart with striped awning on the sand |
| `backgrounds/event_australia_kangaroo.png` | Grassy wildlife park, eucalyptus trees, wooden fence |
| `backgrounds/event_australia_volleyball.png` | Beach volleyball court, net, ocean behind |
| `characters/vendor_icecream.png` | Sunny ice-cream man, cap + apron |
| `characters/ranger_australia.png` | Park ranger, wide-brim hat |
| `characters/kids_australia.png` | Beach kid, pigtails, yellow shirt |
| `characters/kangaroo.png` | Friendly kangaroo (needs hop pose) |
| `objects/icecream.png` `objects/volleyball.png` | Props |
| `objects/souvenir_koala.png` `objects/souvenir_shell.png` | Souvenirs |

- **Music:** `music/theme_australia.mp3` — relaxing acoustic guitar
- **Ambient:** `ambient/waves.wav` · `ambient/seagulls.wav` · `ambient/wind.wav`
- **Interaction sounds:** `sfx/bite.wav` (ice cream) · `sfx/boing.wav` (kangaroo) · `sfx/bounce.wav` (volleyball) · `sfx/gull.wav`
- **Animation notes:** ocean shimmer, drifting clouds, seagulls, palm sway

---

## 🇫🇷 France — Paris Evening

| File | Description |
|---|---|
| `backgrounds/background_paris_evening.png` | Sunset over Paris, Eiffel Tower silhouette, warm windows, string lights, café |
| `backgrounds/event_france_crepe.png` | Cobbled corner, crêpe stand with round griddle, blue awning, lamplight |
| `backgrounds/event_france_eiffel.png` | Eiffel Tower from below at dusk, first stars |
| `backgrounds/event_france_park.png` | Evening park lawn, trees, bench, small soccer goal, tower tip in distance |
| `characters/vendor_crepe.png` | Crêpe chef, beret + apron |
| `characters/guide_paris.png` | Marie, friendly guide, long hair |
| `characters/kids_paris.png` | Louis, park kid with cap |
| `characters/pigeon.png` | Plump Paris pigeon |
| `objects/crepe.png` `objects/soccerball.png` | Props |
| `objects/souvenir_eiffel.png` `objects/souvenir_beret.png` | Souvenirs |

- **Music:** `music/theme_paris.mp3` — soft accordion waltz
- **Ambient:** `ambient/city_evening.wav` · `ambient/pigeons.wav` · `ambient/crickets.wav`
- **Interaction sounds:** `sfx/sizzle.wav` (crêpe) · `sfx/kick.wav` (soccer) · `sfx/chime.wav` (tower sparkle)
- **Animation notes:** tower lights twinkle, fireflies in the park, warm window glow, pink clouds

---

## 🇪🇬 Egypt — Desert Sunset

| File | Description |
|---|---|
| `backgrounds/background_egypt_desert.png` | Golden desert, three pyramids, dunes, market tents with pennant flags, low sun |
| `backgrounds/event_egypt_kebab.png` | Market stall, striped canopy, hanging lamps, glowing grill |
| `backgrounds/event_egypt_pyramid.png` | The Great Pyramid up close, huge against the sky |
| `backgrounds/event_egypt_sand.png` | Soft sand play spot, bucket & spade, pyramids in the distance |
| `characters/vendor_kebab.png` | Cheerful kebab man, head scarf + apron |
| `characters/guide_egypt.png` | Amira, desert guide, white scarf |
| `characters/kids_egypt.png` | Layla, local kid, teal top |
| `characters/camel.png` | Coco the camel, red saddle blanket |
| `objects/kebab.png` `objects/sand_pyramid.png` `objects/flag_small.png` | Props |
| `objects/souvenir_pyramid.png` `objects/souvenir_camel.png` | Souvenirs |

- **Music:** `music/theme_egypt.mp3` — gentle oud / desert flute
- **Ambient:** `ambient/desert_wind.wav` · `ambient/market.wav` · `ambient/hawk.wav`
- **Interaction sounds:** `sfx/sizzle.wav` (grill) · `sfx/camel.wav` (Coco) · `sfx/pop.wav` (sand tap)
- **Animation notes:** blowing sand, waving pennants, hawks circling, lamp glow

---

## Photos (generated in-game)

Polaroids are rendered by the game from the event scene; when real event
backdrops exist they appear inside the photos automatically. Reference names
used in the scrapbook data:

`photo_australia_icecream.png` `photo_australia_kangaroo.png` `photo_australia_volleyball.png`
`photo_france_crepe.png` `photo_france_eiffel.png` `photo_france_soccer.png`
`photo_egypt_kebab.png` `photo_egypt_pyramids.png` `photo_egypt_sand.png`

## Voice (future)

Character voices currently use the browser's text-to-speech. Recorded lines can
later be added as `audio/voice/<character>_<line-id>.wav` once a naming pass is
done over the dialogue in `js/data.js`.
