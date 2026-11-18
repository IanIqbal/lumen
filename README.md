# LUMEN

The world has gone dark. You are the last spark.

LUMEN is a short flight game that runs in the browser. You fly over a sleeping landscape and gather scattered light, and the world wakes up chapter by chapter: colour returns, glowing plants bloom, whales made of light join you, and a ringed planet rises. All the music and sound is synthesized live as you play. A full run takes about five to six minutes, and you can keep flying in an endless mode after the ending.

Best with headphones, in the dark.

## Controls

| Action | Input |
| --- | --- |
| Steer | Mouse, WASD or arrow keys, or drag on touch screens |
| Surge (fly faster) | Hold click or Space, or the surge button on touch screens |
| Pause | Esc |
| Mute | M |
| Fullscreen | F |

Fly through motes to gather light, fly low over land or water to skim for bonus light, pass through rings to surge, and avoid the red void-shards.

## Running it

Open `index.html` in a modern browser (Chrome, Edge, Firefox or Safari). It needs an internet connection to load three.js and the fonts from their CDNs.

## Editing

The game is written in `src/` and bundled into the standalone `index.html`:

```bash
node build.mjs
```

- `src/template.html` holds the page, styles and HUD
- `src/core.js` has helpers, the terrain function, chapters and colour palettes
- `src/shaders.js` has all GLSL (terrain, sky, aurora, eclipse, whales, post-processing)
- `src/audio.js` is the generative music and sound engine (Web Audio)
- `src/world.js` sets up the renderer, bloom, sky dome, terrain and dust
- `src/entities.js` has the spark, trail, particles, motes, shards, gates and flora
- `src/setpieces.js` has the light whales, the ringed planet and meteors
- `src/main.js` has input, game flow, chapters, the finale and the HUD

Built with [three.js](https://threejs.org/).
