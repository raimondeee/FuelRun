import { defineConfig, Plugin } from 'vite';
import fs from 'node:fs';
import crypto from 'node:crypto';
// Writes sw.js with a cache name derived from the hash of all built files.
const sw = (): Plugin => ({
  name: 'fuelrun-sw', apply: 'build',
  generateBundle(_, bundle) {
    const files = Object.keys(bundle);
    const h = crypto.createHash('sha256');
    for (const f of files.sort()) { const b: any = bundle[f]; h.update(f); h.update(b.code ?? b.source ?? ''); }
    h.update(fs.readFileSync('public/stations.json'));
    const tpl = fs.readFileSync('src/sw-template.js', 'utf8')
      .replace('__CACHE__', 'fuelrun-' + h.digest('hex').slice(0, 12))
      .replace('__ASSETS__', JSON.stringify(['./', 'stations.json', 'manifest.webmanifest', 'icon.svg', ...files.filter(f => f !== 'index.html')]));
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: tpl });
  },
});
export default defineConfig({ base: process.env.VITE_BASE || '/', plugins: [sw()] });
