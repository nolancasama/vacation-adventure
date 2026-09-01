# Vacation Adventure — Asset Manifest

The game ships with optimized painted artwork and recorded dialogue. Procedural
canvas art, generated figures, emoji props, and WebAudio remain as fallbacks for
optional assets that have not been supplied.

**To upgrade any asset:** drop the real file into the matching folder with the
exact filename. The game detects it automatically the next time the scene loads
(the chip turns into a ✓). No code changes needed.

```
assets/
  backgrounds/   WebP, sized for the 960×600 stage
  characters/    WebP with alpha transparency, full body, front-facing
  objects/       WebP with alpha transparency, display-sized by use
  audio/sfx/     WAV, short one-shots
  audio/ambient/ WAV, loopable, 20s+
  audio/music/   MP3, loopable
  audio/voice/   MP3 recorded dialogue
```

Art direction for all backgrounds: **painted anime / light-novel style,
warm cinematic lighting, soft painterly shading, rich environmental detail.**
Characters: expressive anime style, kid-friendly proportions.

---

## Global / UI

| File | Description |
|---|---|
| `backgrounds/intro_cloud_long.webp` | Slowly moving painted title sky |
| `backgrounds/intro_paradise_1.webp` | Transparent tropical title foreground |
| `backgrounds/background_travel_sky.webp` | Above the clouds, soft sunlight, cloud sea below |
| `backgrounds/background_map_world.webp` | Storybook world map, painted ocean, stylized continents, dotted flight routes |
| `characters/player-alpha.webp` | Boy player: cheerful 11-year-old traveler, coral T-shirt |
| `characters/player_girl.webp` | Girl player variant |
| `characters/grandma-clean.webp` | Warm smiling grandma, glasses, silver bun, lavender cardigan |
| `characters/officer.webp` | Friendly airport officer, navy uniform + cap |
| `objects/plane.webp` | Small friendly passenger plane, side view, red tail |

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
| `backgrounds/background_home_livingroom.webp` | Cozy Japanese living room, morning light through window, sofa, rug, framed photos, teapot |

- **Music:** `music/theme_home.mp3` — gentle, warm, nostalgic
- **Ambient:** `ambient/room.wav` — quiet room tone, clock, distant birds
- **Animation notes:** dust motes in the window light, teapot steam

---

## 🇦🇺 Australia — Sunny Beach (day)

| File | Description |
|---|---|
| `backgrounds/background_australia_beach.webp` | Golden sand, turquoise ocean, beach umbrella, palms, sailboat |
| `backgrounds/event_australia_icecream.webp` | Close-up of a cute ice-cream cart with striped awning on the sand |
| `backgrounds/event_australia_kangaroo.webp` | Grassy wildlife park, eucalyptus trees, wooden fence |
| `backgrounds/event_australia_volleyball.webp` | Beach volleyball court, net, ocean behind |
| `characters/vendor_icecream-alpha.webp` | Sunny ice-cream man, cap + apron |
| `characters/ranger_australia-alpha.webp` | Park ranger, wide-brim hat |
| `characters/kids_australia-alpha.webp` | Beach kid, pigtails, yellow shirt |
| `characters/kangaroo.webp` | Friendly kangaroo (needs hop pose) |
| `objects/icecream.webp` `objects/volleyball.webp` | Props |
| `objects/souvenir_koala.webp` `objects/souvenir_shell.webp` | Souvenirs |

- **Music:** `music/theme_australia.mp3` — relaxing acoustic guitar
- **Ambient:** `ambient/waves.wav` · `ambient/seagulls.wav` · `ambient/wind.wav`
- **Interaction sounds:** `sfx/bite.wav` (ice cream) · `sfx/boing.wav` (kangaroo) · `sfx/bounce.wav` (volleyball) · `sfx/gull.wav`
- **Animation notes:** ocean shimmer, drifting clouds, seagulls, palm sway

---

## 🇫🇷 France — Paris Evening

| File | Description |
|---|---|
| `backgrounds/background_paris_evening.webp` | Sunset over Paris, Eiffel Tower silhouette, warm windows, string lights, café |
| `backgrounds/event_france_crepe.webp` | Cobbled corner, crêpe stand with round griddle, blue awning, lamplight |
| `backgrounds/event_france_eiffel.webp` | Eiffel Tower from below at dusk, first stars |
| `backgrounds/event_france_park.webp` | Evening park lawn, trees, bench, small soccer goal, tower tip in distance |
| `characters/vendor_crepe-clean.webp` | Crêpe chef, beret + apron |
| `characters/guide_paris.webp` | Marie, friendly guide, long hair |
| `characters/kids_paris.webp` | Louis, park kid with cap |
| `characters/pigeon.webp` | Plump Paris pigeon |
| `objects/crepe.webp` `objects/soccerball.webp` | Props |
| `objects/souvenir_eiffel.webp` `objects/souvenir_beret.webp` | Souvenirs |

- **Music:** `music/theme_paris.mp3` — soft accordion waltz
- **Ambient:** `ambient/city_evening.wav` · `ambient/pigeons.wav` · `ambient/crickets.wav`
- **Interaction sounds:** `sfx/sizzle.wav` (crêpe) · `sfx/kick.wav` (soccer) · `sfx/chime.wav` (tower sparkle)
- **Animation notes:** tower lights twinkle, fireflies in the park, warm window glow, pink clouds

---

## 🇪🇬 Egypt — Desert Sunset

| File | Description |
|---|---|
| `backgrounds/background_egypt_desert.webp` | Golden desert, three pyramids, dunes, market tents with pennant flags, low sun |
| `backgrounds/event_egypt_kebab.webp` | Market stall, striped canopy, hanging lamps, glowing grill |
| `backgrounds/event_egypt_pyramid.webp` | The Great Pyramid up close, huge against the sky |
| `backgrounds/event_egypt_sand.webp` | Soft sand play spot, bucket & spade, pyramids in the distance |
| `characters/vendor_kebab.webp` | Cheerful kebab man, head scarf + apron |
| `characters/guide_egypt.webp` | Amira, desert guide, white scarf |
| `characters/kids_egypt.webp` | Layla, local kid, teal top |
| `characters/camel.webp` | Coco the camel, red saddle blanket |
| `objects/kebab.webp` `objects/sand_pyramid.webp` `objects/flag_small.webp` | Props |
| `objects/souvenir_pyramid.webp` `objects/souvenir_camel.webp` | Souvenirs |

- **Music:** `music/theme_egypt.mp3` — gentle oud / desert flute
- **Ambient:** `ambient/desert_wind.wav` · `ambient/market.wav` · `ambient/hawk.wav`
- **Interaction sounds:** `sfx/sizzle.wav` (grill) · `sfx/camel.wav` (Coco) · `sfx/pop.wav` (sand tap)
- **Animation notes:** blowing sand, waving pennants, hawks circling, lamp glow

---

## Photos (generated in-game)

Polaroids are rendered by the game from the event scene; when real event
backdrops exist they appear inside the photos automatically. Reference names
used in the scrapbook data:

`photo_australia_icecream.webp` `photo_australia_kangaroo.webp` `photo_australia_volleyball.webp`
`photo_france_crepe.webp` `photo_france_eiffel.webp` `photo_france_soccer.webp`
`photo_egypt_kebab.webp` `photo_egypt_pyramids.webp` `photo_egypt_sand.webp`

## Voice (future)

Character voices currently use the browser's text-to-speech. Recorded lines can
later be added as `audio/voice/<character>_<line-id>.wav` once a naming pass is
done over the dialogue in `js/data.js`.
