import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const notices = ['# Third-party dependency notices\n\nGenerated from the exact installed dependency tree. Individual components retain their licenses. Fonts and proprietary .dna resources are not distributed.\n'];
const seen = new Set();
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const location = path.join(directory, entry.name);
    if (entry.name.startsWith('@')) { await walk(location); continue; }
    let manifest;
    try { manifest = JSON.parse(await readFile(path.join(location, 'package.json'), 'utf8')); } catch { continue; }
    const key = `${manifest.name}@${manifest.version}`;
    if (!seen.has(key)) {
      seen.add(key);
      const licenses = (await readdir(location)).filter(n => /^(license|licence|copying|notice)(\.|$)/i.test(n));
      notices.push(`\n## ${key}\n\nDeclared license: ${typeof manifest.license === 'string' ? manifest.license : JSON.stringify(manifest.license ?? manifest.licenses ?? 'see upstream')}\n`);
      for (const name of licenses) {
        try { notices.push(`\n### ${name}\n\n\`\`\`text\n${await readFile(path.join(location, name), 'utf8')}\n\`\`\`\n`); } catch { /* A same-named directory is not a text notice. */ }
      }
    }
    try { await walk(path.join(location, 'node_modules')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}
await walk('node_modules');
await writeFile('THIRD_PARTY_NOTICES.md', notices.join('\n'));
