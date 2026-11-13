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

## Desktop (macOS, Windows, Linux)

The desktop app is an Electron shell around the same game, with the GPU and every CPU core put to work:

```bash
npm run desktop       # run it from source
npm run dist:linux    # release/: AppImage, deb, tar.gz
npm run dist:win      # release/: NSIS installer, portable .exe, zip (best built on Windows)
npm run dist:mac      # release/: universal .dmg and zip (must be built on macOS)
```

The **Desktop builds** workflow (`.github/workflows/desktop.yml`) builds all three on their own runners for every
pull request that touches the game, uploading the packages as workflow artifacts; pushing a tag like `v1.1.0`
attaches them to a GitHub release. Builds are unsigned: on macOS, right-click the app and choose Open the first time;
on Windows, SmartScreen may ask you to confirm.

Launch flags: `--fullscreen`, `--windowed`, `--renderer=2d|webgl2`, `--workers=0`, `--software` (no GPU),
`--bench=20`. F11 or Alt+Enter toggles fullscreen.

## Performance

Everything heavy runs where the hardware is:

- **Every core.** A pool of worker threads (one per spare core, up to 8) runs the big pixelfx effects
  (explosions, weather, large spells, screen transitions) and bakes looping effects into sprite frames. The main
  thread only stamps the pixels each effect touched, which come back as sparse lists in transferred buffers. A busy
  worker gets a larger step next time, so a heavy moment lowers an effect's frame rate, never the game's.
- **The GPU.** A WebGL2 presenter composites the world, its light, the backdrop and the HUD in one shader at the
  display's native resolution, with shake, flashes, an optional glow (bloom of the light buffer) and scanlines. On a
  software GL driver it steps aside for the 2D path, which is faster there.
- **Tight loops.** Stamping is integer math with no per-pixel calls; every realm's sprites are baked in the background
  at boot, so rooms don't hitch.

`?bench=20` (or `npm run bench`) runs a seeded stress fight (twelve foes, fog and rain, ultimates and big explosions)
and reports main-thread time per frame. On a 4-core machine without a GPU, main-thread time per frame went from
about 100 ms before these changes to about 15 ms (from about 10 fps to about 55 fps under that load).

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
- `src/engine/workers.js` and `fxworker.js`: the multi-core effect pool; `gl.js`: the GPU presenter.
- `desktop/`: the Electron main process, preload bridge and icon; `tools/icon.mjs` draws the icon with pixelfx.
- `tools/smoke.mjs`, `tools/autoplay.mjs` and `tools/desktop-smoke.mjs` drive the game (and the desktop app) in
  headless Chromium and Electron through Playwright for testing.

## Credits

- Effects: [pixelfx](https://github.com/patch-gg/pixelfx), MIT License, Copyright (c) 2026 Patch and Hugo Duprez,
  including code adapted from [Sprite Fusion's pixel art VFX](https://www.spritefusion.com/pixel-art-vfx) by Hugo
  Duprez and acting adapted from [Hollow Crown](https://github.com/rehan-remade/hollow-crown) by rehan-remade (MIT).
- Everything else in this repository: game code, art, sound and music are generated in code.
