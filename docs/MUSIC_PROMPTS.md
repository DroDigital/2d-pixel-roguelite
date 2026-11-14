# Suno prompts for Emberspire's music

Emberspire plays twelve pieces of music. Today each is a small synth loop generated in `src/engine/audio.js`. The
prompts below describe the same pieces as full tracks for [Suno](https://suno.com), so they can replace the synth
loops. Each one keeps the loop's tempo, key and mode, so it fits the same scene.

## How to use them

- Use **Custom** mode. Turn **Instrumental** on.
- Paste **Style** into *Style of Music* and **Exclude** into *Exclude styles*. With older models that have no exclude
  field, add the exclude list to the end of the style as "no …".
- Paste **Structure** into the *Lyrics* box. The bracketed tags steer the arrangement without adding vocals.
- In-game tracks must loop, so ask for steady sections with no fade-out. Then trim the result to a whole number of
  bars. Each track lists how long its loop lasts at its tempo, so the cut points are easy to find.
- Generate a few takes and keep the one whose first and last bars match best.

Some words recur because they shape the result: "pixel", "chiptune-inspired", "lo-fi warmth", "loopable",
"instrumental". Keep them in.

---

## 1. Title: "Emberspire" (title screen)

72 BPM · D Dorian · about 2:30 · loop of 16 bars (≈ 53 s)
Mood: a lone ember under a night sky; awe and quiet resolve before the climb.

**Style**
```
dark fantasy title theme, slow 72 bpm, D dorian, instrumental, loopable, warm analog sawtooth pad swelling under a
sparse plucked arpeggio, low choir "ah" pad, distant tolling bell, soft sub bass on the downbeat only, crackling
fire foley, chiptune-inspired lead melody on square wave doubled by a felt piano, lo-fi warmth, wide reverb,
nostalgic 16-bit RPG overture, hopeful but solemn, slow build then plateau, no ending, seamless loop
```
**Exclude**
```
vocals, lyrics, rap, EDM drop, trap hi-hats, dubstep wobble, heavy metal guitars, orchestral hit, jazz, fade out,
spoken word, comedy, upbeat pop
```
**Structure**
```
[Instrumental]
[Intro: fire crackle, pad swell]
[Main Theme: square lead and piano]
[Variation: choir enters]
[Loop point]
```

---

## 2. The Last Camp (the hub between climbs)

80 BPM · G major · about 2:30 · loop of 16 bars (48 s)
Mood: safety, a crackling campfire, friends gearing up.

**Style**
```
cozy campfire hub music, 80 bpm, G major, instrumental, loopable, gentle triangle-wave arpeggio, nylon guitar and
soft kalimba, warm round bass, brushed shaker, no heavy drums, fireplace crackle and crickets, chiptune-inspired
melody on a soft triangle lead, lo-fi warmth, tape saturation, 16-bit village theme, relaxed and hopeful, safe haven
between adventures, seamless loop
```
**Exclude**
```
vocals, lyrics, aggressive drums, distorted guitar, minor key, horror, EDM, trap, orchestral bombast, fade out,
siren, alarms
```
**Structure**
```
[Instrumental]
[Intro: campfire ambience]
[Theme A: guitar and kalimba arpeggio]
[Theme B: triangle lead melody]
[Loop point]
```

---

## 3. The Sunken Crypt (realm 1)

104 BPM · A minor · about 2:30 · loop of 16 bars (≈ 37 s)
Mood: dusty catacombs, rattling skeletons, candlelight; the first real fight.

**Style**
```
dark dungeon battle music, 104 bpm, A minor, instrumental, loopable, driving 16th-note sawtooth arpeggio, pipe organ
stabs, pizzicato strings, punchy four-on-the-floor kick with tight snare and ticking hi-hat, gritty pulse bass, bone
rattle percussion, chiptune-inspired lead on pulse wave, gothic castlevania-like energy, lo-fi warmth, crypt reverb,
tense but fun, roguelite combat loop, seamless loop
```
**Exclude**
```
vocals, lyrics, choir words, happy major key, EDM drop, dubstep, trap, jazz, ballad, fade out, cinematic trailer
build, orchestral swell
```
**Structure**
```
[Instrumental]
[Intro: organ stab and kick]
[Fight A: arpeggio drive]
[Fight B: pulse-wave lead]
[Breakdown: organ and bass]
[Loop point]
```

---

## 4. The Drowned Grotto (realm 2)

92 BPM · B Dorian · about 2:30 · loop of 16 bars (≈ 42 s)
Mood: flooded caves, glowing water, an oracle's tides; eerie and beautiful.

**Style**
```
underwater cave battle music, 92 bpm, B dorian, instrumental, loopable, liquid triangle-wave arpeggio, glassy
marimba, deep filtered pad that swells like tides, half-time kick with soft hats, round sub bass, water drips and
bubbles foley, chorus-drenched electric piano, chiptune-inspired lead on a soft triangle wave, lo-fi warmth, cavern
reverb, mysterious and flowing, 16-bit water level, seamless loop
```
**Exclude**
```
vocals, lyrics, distorted guitar, aggressive metal drums, EDM drop, trap, bright pop, brass fanfare, fade out,
ocean waves crashing loudly
```
**Structure**
```
[Instrumental]
[Intro: drips and pad swell]
[Theme: marimba and arpeggio]
[Tide: filtered pad rises, lead enters]
[Loop point]
```

---

## 5. The Rime Peak (realm 3)

96 BPM · E Lydian · about 2:30 · loop of 16 bars (40 s)
Mood: thin air and falling snow, ice that rings like glass; cold wonder with danger underneath.

**Style**
```
frozen mountain battle music, 96 bpm, E lydian, instrumental, loopable, sparkling sine-bell arpeggio, celesta and
glockenspiel, airy sine pad, crisp half-time kick and sparse hat, wind howl and ice crackle foley, plucked harp,
chiptune-inspired lead on a clear triangle wave, lo-fi warmth, huge icy reverb, wondrous and cold, raised fourth
gives a magical lift, 16-bit snow level, seamless loop
```
**Exclude**
```
vocals, lyrics, christmas sleigh bells, jingle, distorted guitar, trap, EDM drop, heavy bass drop, fade out, cheesy
holiday
```
**Structure**
```
[Instrumental]
[Intro: wind and celesta]
[Theme: bell arpeggio and harp]
[Lift: lead melody over lydian chords]
[Loop point]
```

---

## 6. The Storm Foundry (realm 4)

124 BPM · G Phrygian · about 2:30 · loop of 16 bars (≈ 31 s)
Mood: furnaces, lightning, hammering machines; industrial and relentless.

**Style**
```
industrial forge battle music, 124 bpm, G phrygian, instrumental, loopable, pounding four-on-the-floor kick, metallic
snare, constant 16th hi-hats, chugging distorted sawtooth bass ostinato, anvil hits and steam hiss percussion,
electric crackle, aggressive sawtooth arpeggio, chiptune-inspired lead on pulse wave, dark synthwave meets 16-bit
factory stage, lo-fi grit, mechanical and relentless, flat second for menace, seamless loop
```
**Exclude**
```
vocals, lyrics, screaming, happy major key, acoustic guitar, ballad, jazz, orchestral strings swell, fade out, lo-fi
hip hop, chill
```
**Structure**
```
[Instrumental]
[Intro: machine rhythm and steam]
[Drive A: bass ostinato]
[Drive B: pulse-wave lead]
[Break: anvil percussion only]
[Loop point]
```

---

## 7. The Last Sanctum (realm 5)

88 BPM · F major · about 2:30 · loop of 16 bars (≈ 44 s)
Mood: a radiant temple at the top of the world; holy, bittersweet and vast.

**Style**
```
celestial temple battle music, 88 bpm, F major, instrumental, loopable, shimmering triangle-wave arpeggio climbing
through major sevenths, wordless choir pad, harp and church organ, gentle half-time kick and soft hats, warm bass,
distant bells, chiptune-inspired lead on a bright triangle wave, lo-fi warmth, cathedral reverb, radiant,
bittersweet and vast, final dungeon of a 16-bit RPG, seamless loop
```
**Exclude**
```
vocals with words, lyrics, distorted guitar, trap, EDM drop, horror, dissonant noise, fade out, gospel singing
```
**Structure**
```
[Instrumental]
[Intro: bells and choir pad]
[Theme: harp arpeggio]
[Ascent: organ and lead melody]
[Loop point]
```

---

## 8. Warden battle (bosses of realms 1-4)

140 BPM · A Phrygian · about 2:30 · loop of 16 bars (≈ 27 s)
Mood: a towering guardian; urgent, heroic and dangerous.

**Style**
```
epic boss battle music, 140 bpm, A phrygian, instrumental, loopable, syncopated driving kick pattern, snare backbeat,
busy 16th hats, aggressive sawtooth bass riff, stabbing brass synth, fast sawtooth arpeggio, taiko hits on phrase
ends, chiptune-inspired heroic lead on pulse wave, 16-bit boss theme energy, lo-fi grit, menacing flat second,
urgent and heroic, no intro fade, seamless loop
```
**Exclude**
```
vocals, lyrics, slow tempo, chill, lo-fi hip hop, acoustic, jazz, ballad, fade out, cinematic trailer silence,
spoken word
```
**Structure**
```
[Instrumental]
[Intro: taiko and brass stab]
[Battle A: bass riff and arpeggio]
[Battle B: heroic pulse lead]
[Bridge: half-time, brass swells]
[Loop point]
```

---

## 9. The Last Seraph (final boss)

150 BPM · D minor · about 3:00 · loop of 16 bars (≈ 26 s)
Mood: the keeper of the first flame; holy fury, the hardest fight, everything on the line.

**Style**
```
final boss battle music, 150 bpm, D minor, instrumental, loopable, relentless four-on-the-floor kick, snare rolls,
constant 16th hats, galloping sawtooth bass, huge wordless choir, pipe organ, soaring sawtooth arpeggio, chiptune-
inspired lead on pulse wave trading with distorted synth lead, angelic bells over darkness, epic and desperate,
16-bit final boss theme, lo-fi grit, seamless loop
```
**Exclude**
```
vocals with words, lyrics, rap, slow tempo, chill, acoustic guitar, jazz, happy pop, fade out, comedic
```
**Structure**
```
[Instrumental]
[Intro: organ and choir hit]
[Phase 1: galloping bass, arpeggio]
[Phase 2: choir and pulse lead]
[Phase 3: everything, double-time hats]
[Loop point]
```

---

## 10. Ascension (victory screen)

96 BPM · G major · about 1:30 · loop of 8 bars (20 s), or a one-shot that can loop
Mood: you reached the top; triumph, relief, the ember is yours.

**Style**
```
triumphant victory theme, 96 bpm, G major, instrumental, bright triangle-wave arpeggio, warm brass synth fanfare,
glockenspiel sparkle, half-time kick and soft hats, uplifting bass, chiptune-inspired lead on triangle wave, 16-bit
RPG ending credits feel, lo-fi warmth, hall reverb, joyful and relieved, loopable
```
**Exclude**
```
vocals, lyrics, minor key, sad, horror, aggressive drums, EDM drop, trap, fade out
```
**Structure**
```
[Instrumental]
[Fanfare]
[Victory Theme: arpeggio and lead]
[Loop point]
```

---

## 11. The ember fades (game over)

60 BPM · A minor · about 1:30 · loop of 8 bars (32 s)
Mood: the fire goes out; quiet loss and the promise of another climb.

**Style**
```
somber game over theme, 60 bpm, A minor, instrumental, loopable, slow sine pad, sparse music-box melody, soft
felt piano, low sub bass on bar starts only, gentle wind, fading ember crackle, chiptune-inspired lead on a quiet
sine wave, lo-fi warmth, tape hiss, melancholic but not hopeless, 16-bit continue screen, seamless loop
```
**Exclude**
```
vocals, lyrics, drums, upbeat, major key happiness, EDM, metal, orchestral bombast, fade out
```
**Structure**
```
[Instrumental]
[Theme: music box and piano]
[Loop point]
```

---

## 12. Optional extras

The game reuses the realm music for its merchant, campfire, shrine, treasure and mystery rooms. If you want those
rooms to sound different, these are short loops in the same palette.

**Merchant (shop)**: 100 BPM, D major
```
quirky merchant shop music, 100 bpm, D major, instrumental, loopable, plucky pizzicato and accordion, bouncy
triangle bass, light woodblock and shaker, coin jingle accents, chiptune-inspired lead, 16-bit shop theme, playful
```
Exclude: `vocals, lyrics, aggressive drums, minor key, horror, EDM, fade out`

**Campfire rest**: 70 BPM, C major
```
peaceful rest stop music, 70 bpm, C major, instrumental, loopable, solo nylon guitar, soft triangle arpeggio,
crackling fire foley, warm pad, no drums, 16-bit inn theme, lo-fi warmth, calm
```
Exclude: `vocals, lyrics, drums, distortion, minor key, EDM, fade out`

---

## Licensing note

Check Suno's current terms before shipping generated music in a released game. Commercial rights have depended on
the plan you were on when you generated the track.
