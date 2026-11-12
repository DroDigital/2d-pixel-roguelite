# Emberspire

A 2.5D pixel art roguelite brawler that runs in the browser. You are a hollow vessel with an ember for a heart,
climbing five realms of a burning spire. Every spark, slash, explosion, spell, critter, status, pickup, weather system
and screen transition in the game is a live, code-drawn effect from **[pixelfx](https://github.com/patch-gg/pixelfx)**:
all **244** of them are used somewhere in play.

## Play

```bash
npm install        # only esbuild, for the bundle
npm run dev        # http://localhost:8080
npm run build      # dist/index.html + dist/game.js, and a single-file dist/emberspire.html
```

No build step is needed to play locally: `index.html` loads the ES modules directly.

| action | keyboard | gamepad |
|---|---|---|
| move | WASD / arrows | left stick / d-pad |
| attack (combo) | J / Z | A |
| special | K / X | X |
| dash (i-frames; just before a hit = parry) | L / C / Space / Shift | B / RB |
| ultimate | I / V | Y / LT |
| use | E / F | LB |
| pause | Esc / P | Start |

Touch screens get a thumbstick and buttons.

## The game

- **Six vessels**, each fighting with pixelfx's acted moves (wind-up, freeze on contact, recovery): the Knight
  (sword combo, dash strike, holy smite), Brute (uppercut and hammer, ground pound, earthbreaker), Ranger (piercing
  arrows, vine whip, thornline, starfall), Reaper (scythe curses, grasping hands, void maw), Gunslinger (pistols,
  scattershot, rocket) and Pyromancer (firebolts, ice lance, meteor; blinks instead of dashing).
- **Five realms**: the Sunken Crypt, the Drowned Grotto, the Rime Peak, the Storm Foundry and the Last Sanctum, each
  with its own painted backdrop, decor, weather, enemy roster, way of summoning, hazards, music and warden.
- **Thirty-odd foes**: pixelfx critters given brains (slimes, bats, burning skulls, watchers, wisps, shades, frogs,
  vipers, storm jellies, moths) and rigged vessels in enemy colors whose wind-ups glow red before they land.
- **Five bosses** with phase changes and telegraphed patterns: the Hollow King, the Drowned Oracle, the Rime Queen,
  the Iron Engine (break its shield cores) and the Last Seraph.
- **~45 boons** across twelve elements (ember, rime, storm, void, dawn, blight, thorn, tide, arcana, iron, blood,
  forge), applying pixelfx's status effects (burning, frozen, poisoned, cursed, electrified, bleeding, charmed...)
  wrapped around the real silhouette of whatever they hit.
- **Rooms with choices**: doors show their reward (a boon of an element, gold, a heart, embers, focus) or lead to a
  merchant, a campfire, a blood shrine, a treasure chest, a champion or a mystery.
- **Meta-progression**: embers carried home buy permanent upgrades at the camp's shrine and awaken new vessels.
- **The Codex**: every effect you witness on the climb is recorded and can be replayed, acted out, at the camp.

## How it's built

- `vendor/pixelfx/` is an unmodified copy of pixelfx's `src/core` and `src/fx` (MIT, see its LICENSE and NOTICE).
- `src/engine/`: the 320 x 180 screen and compositor, a cache that bakes looping effects into sparse frames,
  the live-effect manager, the rig renderer with per-vessel palettes and glowing eyes, input, a WebAudio synth for
  all sound and music, and saves.
- `src/game/`: combat, moves performed from pixelfx acts (`perform.js`), the classes, enemies, bosses, boons, rooms,
  procedurally painted backdrops (`art.js`), HUD, menus and scenes.
- `tools/smoke.mjs` and `tools/autoplay.mjs` drive the game in headless Chromium (Playwright) for testing.

## Credits

- Effects: [pixelfx](https://github.com/patch-gg/pixelfx), MIT License, Copyright (c) 2026 Patch and Hugo Duprez,
  including code adapted from [Sprite Fusion's pixel art VFX](https://www.spritefusion.com/pixel-art-vfx) by Hugo
  Duprez and acting adapted from [Hollow Crown](https://github.com/rehan-remade/hollow-crown) by rehan-remade (MIT).
- Everything else in this repository: game code, art, sound and music are generated in code.
