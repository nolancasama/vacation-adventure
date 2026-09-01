# Vacation Adventure performance report

Branch: `perf/chromebook-optimization`
Baseline: `ec66c8c` (`main` / `origin/main`)

## Overall asset result

| Measurement | Before | After | Reduction |
|---|---:|---:|---:|
| Deployable images | 87.45 MiB / 76 PNGs | 9.11 MiB / 67 WebPs | 89.6% |
| Entire `assets/` directory | 93.11 MiB | 14.77 MiB | 84.1% |

All 76 source images were converted and verified before PNG removal. Nine
proven-unreferenced legacy title/character variants were then removed. The
disabled volleyball finale artwork remains in the repository and remains
disabled in gameplay.

## Largest images

### Before

| Asset | Dimensions | Size |
|---|---:|---:|
| `volleyball_finale_girl_scared.png` | 1024×1536 | 2.491 MiB |
| `volleyball_finale_spiker.png` | 1024×1536 | 2.386 MiB |
| `volleyball_finale_girl_cowering.png` | 1024×1536 | 2.377 MiB |
| `volleyball_finale_spiker_girl.png` | 1024×1536 | 2.365 MiB |
| `volleyball_finale_court.png` | 1448×1086 | 2.212 MiB |
| `volleyball_finale_ball.png` | 1024×1536 | 2.197 MiB |
| `volleyball_finale_net.png` | 1536×1024 | 2.142 MiB |
| `volleyball_finale_spiked_court.png` | 1448×1086 | 2.101 MiB |
| `background_map_world.png` | 1200×900 | 2.054 MiB |
| `kebab_reaction_girl.png` | 1100×1200 | 1.889 MiB |
| `background_home_livingroom.png` | 1200×962 | 1.855 MiB |
| `kebab_reaction_boy.png` | 960×1200 | 1.760 MiB |
| `event_australia_kangaroo.png` | 1200×800 | 1.708 MiB |
| `intro_paradise_1.png` | 1200×800 | 1.689 MiB |
| `event_egypt_sand.png` | 1200×800 | 1.659 MiB |

### After

| Asset | Size |
|---|---:|
| `intro_paradise_1.webp` | 469 KiB |
| `background_map_world.webp` | 350 KiB |
| `volleyball_finale_girl_scared.webp` | 306 KiB |
| `volleyball_finale_court.webp` | 279 KiB |
| `event_australia_kangaroo.webp` | 277 KiB |
| `volleyball_finale_girl_cowering.webp` | 271 KiB |
| `event_france_park.webp` | 271 KiB |
| `volleyball_finale_spiked_court.webp` | 261 KiB |
| `background_home_livingroom.webp` | 259 KiB |
| `kebab_reaction_boy.webp` | 254 KiB |
| `kebab_reaction_girl.webp` | 246 KiB |
| `background_paris_evening.webp` | 244 KiB |
| `event_france_crepe.webp` | 244 KiB |
| `volleyball_finale_spiker.webp` | 235 KiB |
| `volleyball_finale_spiker_girl.webp` | 232 KiB |

## Estimated cold first-visit image payloads

| Screen / transition | Before | After |
|---|---:|---:|
| Title | 2.34 MiB | 566 KiB |
| Character selection | 948 KiB | 248 KiB |
| Home | 2.31 MiB | 331 KiB |
| Map including three cards | 6.34 MiB | 590 KiB |
| Outbound travel, boy | 2.61 MiB | 279 KiB |
| Australia hub | 1.97 MiB | 307 KiB |
| France hub | 1.96 MiB | 338 KiB |
| Egypt hub | 1.93 MiB | 237 KiB |
| Ice-cream event including selected reaction | 6.61 MiB | 665 KiB |
| Crêpe event including selected reaction | 7.37 MiB | 784 KiB |
| Kebab event including selected reaction | 7.13 MiB | 752 KiB |

Optional map-card warming and travel warming now run sequentially during idle
time. Food scenes warm only the selected player-gender reaction image, and map
travel warming loads only the next travel direction.

## Rendering changes

| Measurement | Before | After |
|---|---:|---:|
| Typical ambient backing canvas | 1920×1200 | 960×600 |
| Higher-DPI/powerful-device maximum | 1920×1200 fixed | 1200×750 adaptive |
| Ambient draw rate | approximately 60 FPS | approximately 30 FPS |

The measured optimized loop produced 34 draws in 1.1 seconds (about 30.9 FPS).
Motion continues to use elapsed time, so effects retain their real-world speed.
The loop cancels while the page is hidden or an item reward freezes the scene,
then resumes without resetting effect state.

`VA.Art.layer()` now clears its temporary CSS background and fallback canvas
after inserting the decoded image, eliminating duplicate painting. Cached
preloads track and reuse `Image.decode()` promises instead of assuming every
loaded image is already decoded.

## Network and caching

- A generated audio manifest prevents guaranteed 404 probes for optional music,
  ambience, and SFX while preserving synth fallbacks and recorded voices.
- Vercel assets use a conservative one-hour browser cache plus one-day
  stale-while-revalidate. HTML, JavaScript, and CSS always revalidate.
- Immutable caching was deliberately avoided because asset filenames are stable
  rather than content-hashed.
- A localhost cold-load check produced no failed requests and no console errors;
  title plus idle map warming never exceeded two simultaneous image requests.

## Image verification

- Browser decode: 67/67 retained WebP images passed, including disabled finale
  assets.
- Transparency: every transparent source retained alpha; normalized meaningful
  alpha bounds stayed aligned after resizing.
- Visual-equivalence PSNR across all converted files averaged 39.20 dB, with a
  minimum of 32.66 dB.
- Character sprite canvas geometry was preserved. Resizing was limited to map
  cards, small props/clouds, food/souvenir rewards, the plane, and the finale
  ball according to their maximum real display sizes.

## Gameplay verification

Three independent complete trips passed in Chromium:

- Australia: ice cream, kangaroo, regular volleyball, koala souvenir.
- France: crêpe, Eiffel Tower, soccer, tower souvenir.
- Egypt: kebab, pyramids, sand activity, gold pyramid souvenir.

Each run covered title, look selection, name entry, Grandma/home, map, travel,
passport stamp, all three destination activities, dialogue portraits, item
reward, reaction art, photos, souvenir reward, return flight, Grandma debrief,
an intentional wrong answer and photo hint, scrapbook, album, and passport.
Save assertions passed with three photos, the correct stamp/souvenir, completed
destination state, and expected coin balance. The regular volleyball activity
remains enabled; its three-shot finale remains disabled.

Additional checks passed:

- JavaScript syntax checks for all changed scripts.
- `git diff --check`.
- `vercel.json` JSON validation.
- Vercel preview build (`vercel build --yes`).
- No old `.png` runtime references.
- No zero-byte or failed image assets.
- Ambient pause/resume and page-visibility behavior.
- Selected-gender-only reaction preload.
- Single-paint art-layer behavior.

## Deliberately retained behavior/assets

- No dialogue, ESL content, gameplay, layout, actor placement, progression, or
  animation timing was changed.
- The disabled volleyball finale code and artwork were retained for later
  re-enabling.
- The currently unused plane asset was retained conservatively because it is an
  established travel asset and removing it is unnecessary for runtime loading.
- Transform-only title cloud movement, character breathing, and brief reward
  effects were retained because they are user-visible and not ongoing CPU-heavy
  loops.
