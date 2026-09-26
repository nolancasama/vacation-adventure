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

## Observation panoramas (LOOK screens) — approved art in place (2026-09-26)

The Australia and Egypt LOOK searches run on a dedicated full-screen panorama.
The code never draws these; if the file at the path below fails to load, the
event falls back to the in-scene look. Generate the image, review it, then
save it as WebP at exactly 3000×1000. Both files below are the user's approved
ChatGPT Images paintings (2172×724, upscaled to 3000×1000, WebP q82).

**How the code uses a panorama.** The screen shows a 1280×800 window of the
image (scaled to the 960×600 stage), so the student can pan across about 2.3
screen-widths, plus 200 px vertically in Egypt only. The view starts centred at
x≈640 (the left third). Targets are placed in image pixel coordinates (listed
under each prompt). If the approved image puts things elsewhere, update those
coordinates in `js/data.js`; the art does not have to match them exactly.

If your image tool can't produce 3:1 directly, generate it wide and extend it
sideways (outpainting) to 3:1 rather than stretching it.

### `backgrounds/look_australia_park.webp` — AUSTRALIA OBSERVATION BACKGROUND PROMPT

```text
Wide panoramic background painting for a children's educational travel game, exact aspect ratio 3:1, final size 3000x1000 pixels. Painted anime / light-novel background style: warm cinematic lighting, soft painterly shading, rich environmental detail, clean readable shapes, kid-friendly. Match this existing scene: a sunny Australian wildlife park at midday, bright blue sky with a few puffy white clouds, lush green grass, tall pale-trunked eucalyptus (gum) trees, low weathered wooden rail fences, grey rounded boulders, soft green hills in the distance.

Viewpoint: first-person, standing eye height of a 10-year-old, looking straight out across the park. Horizon at about 45% of the image height. Natural perspective, no fisheye, no curved horizon. This is one continuous landscape read left to right, meant to be panned across by the player.

Left third (the view the player starts on): the park entrance area. A wooden fence with a gate, a large gum tree trunk partly framing the left edge in the foreground, a wooden park sign post with no readable text, a picnic table, bushes. Busy and interesting but NO animal here.

Middle third: an open grassy meadow dotted with eucalyptus trees, a few boulders, grass tussocks, a small shallow billabong/pond with reeds, low shrubs. Mixed open and cluttered areas so the eye has to search.

Right third: the park slopes gently down toward the coast. In the distance, a turquoise ocean and a small pale sandy cove with gentle waves, a rocky headland, more gum trees and bushes on the slope. Open sunny clearings of short grass in the midground.

Depth: clear foreground (grass tufts, a few leaves and flowers along the bottom edge, one tree trunk at the far left), midground (the main walkable grass band where animals could stand, from about 62% to 90% of the image height, running across the full width, kept mostly open, especially between 50% and 90% of the width), and background (trees, hills, ocean, sky). Consistent midday sunlight from the upper left, soft dappled tree shadows on the grass.

Leave plenty of empty open grass in the midground where a separate kangaroo character will be added later by the game: several clear patches roughly 300 px wide by 350 px tall, not blocked by trees, fences or rocks.

No people, no player, no park ranger, no kangaroo or any other animal, no birds, no text, no letters, no signage wording, no logos, no UI, no reticle, no crosshair, no arrows, no buttons, no dialogue boxes, no borders, no watermark.
```

Code placement (image px): kangaroo hops along the midground band (feet at
y≈860, sprite ≈300 px tall), roaming x≈1700–2650, and starts out of view.

### `backgrounds/look_egypt_desert.webp` — EGYPT OBSERVATION BACKGROUND PROMPT

One image serves both Egypt searches (the pyramids, then Coco the camel).

```text
Wide panoramic background painting for a children's educational travel game, exact aspect ratio 3:1, final size 3000x1000 pixels. Painted anime / light-novel background style: warm cinematic lighting, soft painterly shading, rich environmental detail, clean readable shapes, kid-friendly. Match this existing scene: the Giza desert at golden late afternoon, a glowing orange and gold sky with dramatic painterly clouds, warm honey-coloured sand, long soft shadows, sun low on the left.

Viewpoint: first-person, standing eye height of a 10-year-old on a sandy rise, looking out across the desert. Horizon at about 55% of the image height. Natural perspective, no fisheye, no curved horizon. This is one continuous landscape read left to right, meant to be panned across by the player (mostly sideways, a little up and down).

Left third (the view the player starts on): close, detailed ground. Fallen ancient sandstone blocks, a broken carved column, a small cluster of date palms, a low mud-brick wall ruin, scattered rocks and desert shrubs. Interesting but NO pyramids and NO animals here.

Middle third: rolling sand dunes with gentle ridges, a few rocks and a lone palm. Keep a wide, clearly open flat stretch of sand in the midground between about 35% and 55% of the image width, from about 65% to 92% of the image height. A separate camel character will be added there later by the game.

Right third: the three Great Pyramids of Giza in the midground and distance, occupying roughly 70% to 93% of the image width. The largest pyramid's tip at about 20% of the image height and its base at the horizon, about 560 px wide. The two smaller pyramids stepped behind and to the side. Optionally a small distant Sphinx near their base. Dunes and a few rocks in front of them.

Depth: foreground (sand ripples, small stones, a few dry tufts along the bottom edge), midground (dunes, the open sand for the camel), background (pyramids, far dunes, sky). Leave the top 20% of the image as sky with clouds, and the bottom 10% as sand, so the view can move a little up and down without running out of scenery.

No people, no player, no guide, no camel or any other animal, no birds, no tents, no vehicles, no text, no letters, no hieroglyph writing, no logos, no UI, no reticle, no crosshair, no arrows, no buttons, no dialogue boxes, no borders, no watermark.
```

Code placement (image px, measured on the approved art): the three pyramids
span x≈2140–2990, tips y≈245, bases y≈515 (largest x≈2320–2865), Sphinx at
x≈2895; pyramids target rect ≈ x 2200–2990, y 240–510 with a 15 px dwell
radius, so the crosshair must be on a pyramid, not the sand beside it. The horizon sits at
≈45% height. Coco (camel sprite ≈300 px tall) stands on the open sand at
x≈1350, feet y≈880, and wiggles.

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
