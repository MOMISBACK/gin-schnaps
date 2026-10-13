import { build } from 'esbuild';
import { sourceDependencies } from './source-dependencies.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
await mkdir('dist', { recursive: true });
const worker = await build({ entryPoints: ['src/workers/analysis.worker.ts'], bundle: true, minify: true, write: false, format: 'iife', platform: 'browser', target: ['firefox115', 'safari14', 'chrome109'] });
const workerSource = worker.outputFiles[0].text;
for (const [entryPoint, basename] of [['src/main.tsx','index'],['src/diagnostics.tsx','diagnostic']]) {
const result = await build({
  entryPoints: [entryPoint], bundle: true, minify: true, write: false, outfile: `dist/${basename}.js`,
  format: 'iife', platform: 'browser', target: ['firefox115', 'safari14', 'chrome109'],
  define: { __GIN_SCHNAPS_WORKER_SOURCE__: JSON.stringify(workerSource), 'process.env.NODE_ENV': '"production"', global: 'globalThis', 'window.localStorage': 'ginSchnapsEphemeralStorage', localStorage: 'ginSchnapsEphemeralStorage' },
  legalComments: 'eof', metafile: true, plugins: [sourceDependencies],
  inject: ['src/adapters/ephemeral-storage.ts'],
  loader: { '.js': 'jsx', '.woff': 'empty', '.woff2': 'empty', '.ttf': 'empty', '.eot': 'empty', '.png': 'dataurl', '.svg': 'dataurl' }
});
let javascript = '', css = '';
for (const output of result.outputFiles) {
  if (output.path.endsWith('.js')) javascript = output.text;
  if (output.path.endsWith('.css')) css = output.text;
}
// A self-contained build can be opened locally, without a CDN or a localhost server.
// The CSP permits only this script's exact content, never imported document content.
javascript = javascript.replace(/<\/script/gi, '<\\/script');
// Use system fonts and original SVG icons, not bundled font binaries.
css = css.replace(/@font-face\s*\{[^}]*\}/gi, '').replace(/<\/style/gi, '<\\/style');
const digest = createHash('sha256').update(javascript).digest('base64');
const csp = `default-src 'none'; script-src 'sha256-${digest}'; style-src 'unsafe-inline'; img-src data: blob:; font-src 'none'; worker-src blob:; child-src blob:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Gin Schnaps · local sequence workbench</title><style>${css}</style></head><body><div id="root"></div><noscript>JavaScript is required for the local application.</noscript><script>${javascript}</script></body></html>`;
await writeFile(`dist/${basename}.html`, html);
await writeFile(`dist/${basename === 'index' ? 'BUILD-METRICS' : 'DIAGNOSTIC-METRICS'}.json`, JSON.stringify({ workerBytes: Buffer.byteLength(workerSource), javascriptBytes: Buffer.byteLength(javascript), cssBytes: Buffer.byteLength(css), htmlBytes: Buffer.byteLength(html), htmlGzipBytes: gzipSync(html).length }, null, 2));
await writeFile(`dist/${basename === 'index' ? 'build' : 'diagnostic'}-metafile.json`, JSON.stringify(result.metafile));
console.log(await readFile(`dist/${basename === 'index' ? 'BUILD-METRICS' : 'DIAGNOSTIC-METRICS'}.json`, 'utf8'));

}
