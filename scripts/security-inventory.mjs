/** Inventory what was actually emitted, not only the installed dependency graph. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const metas = await Promise.all(['build','diagnostic'].map(async name => ({name, meta:JSON.parse(await readFile(`dist/${name}-metafile.json`, 'utf8'))})));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const targets = ['ove','ui','bio-parsers','range-utils','sequence-utils','file-utils'];
const sourceFiles = new Map(), packages = new Map(), generatedStubs = new Set();
for (const {name, meta} of metas) for (const output of Object.values(meta.outputs)) {
  for (const [input, info] of Object.entries(output.inputs)) {
    if (!info.bytesInOutput || input.startsWith('gin-schnaps-source:')) continue;
    const normalized = input.replaceAll('\\', '/');
    if (targets.some(name => new RegExp(`(?:^|/)node_modules/@teselagen/${name}/index(?:\\.|/)`).test(normalized)))
      throw new Error(`Precompiled TeselaGen entry in emitted code: ${input}`);
    if (normalized.startsWith('(disabled):')) { generatedStubs.add(normalized); continue; }
    const absolute = path.resolve(input);
    const bytes = await readFile(absolute);
    sourceFiles.set(normalized, { path: normalized, sha256: sha(bytes), emittedBytes: (sourceFiles.get(normalized)?.emittedBytes ?? 0) + info.bytesInOutput });
    let directory = path.dirname(absolute), manifest = null;
    while (directory !== path.dirname(directory)) {
      try { manifest = JSON.parse(await readFile(path.join(directory,'package.json'),'utf8')); break; }
      catch (e) { if (e.code !== 'ENOENT') throw e; directory = path.dirname(directory); }
    }
    if (!manifest) throw new Error(`No package manifest for ${input}`);
    const location = path.relative(process.cwd(),directory).replaceAll('\\','/');
    const key = `${manifest.name}@${manifest.version}:${location}`;
    const pkg = packages.get(key) ?? { name: manifest.name, version: manifest.version, location,
      license: manifest.license ?? null, integrity: lock.packages[location]?.integrity ?? null, emittedBytes: 0 };
    pkg.emittedBytes += info.bytesInOutput; packages.set(key,pkg);
  }
}
const minimums = { lodash:'4.18.1','lodash-es':'4.18.1',jsondiffpatch:'0.7.6','fast-xml-parser':'5.7.0',nanoid:'5.1.16' };
for (const pkg of packages.values()) if (pkg.name in minimums && pkg.version !== minimums[pkg.name])
  throw new Error(`Unexpected audited dependency ${pkg.name}@${pkg.version}`);
if ([...packages.values()].some(p=>p.name==='shortid')) throw new Error('Upstream shortid must not be shipped.');
for (const name of ['ove','ui','bio-parsers']) if (![...sourceFiles.keys()].some(p=>p.includes(`node_modules/@teselagen/${name}/src/`)))
  throw new Error(`Source provenance missing for ${name}`);
await mkdir('test-results',{recursive:true});
const inventory={ version:1, applicationVersion:JSON.parse(await readFile('package.json','utf8')).version,
  htmlSha256:sha(await readFile('dist/index.html')), diagnosticSha256:sha(await readFile('dist/diagnostic.html')),
  buildScope:['standalone application','synthetic diagnostic'], lockSha256:sha(await readFile('package-lock.json')),
  teselagenPrebundlesUsed:false, generatedStubs:[...generatedStubs].sort(), packages:[...packages.values()].sort((a,b)=>a.location.localeCompare(b.location)),
  sourceFiles:[...sourceFiles.values()].sort((a,b)=>a.path.localeCompare(b.path)),
  securityCertification:false,
  limitation:'Build provenance and known-advisory remediation, not an independent security audit. Zero npm advisories is not proof of absence of vulnerabilities. Native Rust dependencies require separate review.' };
await writeFile('test-results/security-inventory.json',JSON.stringify(inventory,null,2)+'\n');
console.log(`${inventory.packages.length} emitted package instances inventoried; no TeselaGen prebundle used.`);
