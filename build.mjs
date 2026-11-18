// Bundles src/ into a single, standalone index.html (double-click to play).
// Usage: node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const parts = ['core.js', 'shaders.js', 'audio.js', 'world.js', 'entities.js', 'setpieces.js', 'main.js'];

const tpl = readFileSync(join(root, 'src', 'template.html'), 'utf8');
const js = parts
  .map((p) => `// ───────── ${p} ─────────\n` + readFileSync(join(root, 'src', p), 'utf8'))
  .join('\n');

writeFileSync(join(root, 'index.html'), tpl.replace('/*__GAME__*/', () => js));
console.log(`built index.html (${(js.length / 1024).toFixed(1)} KB of game code)`);
