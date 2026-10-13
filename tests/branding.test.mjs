import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
const pkg=JSON.parse(readFileSync('package.json','utf8'));
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  if(e.isDirectory()&&['target','web','gen','__pycache__'].includes(e.name))return [];
  const p=path.join(dir,e.name);return e.isDirectory()?files(p):[p];
});}
test('one public product identity and synchronized release metadata',()=>{
  assert.equal(pkg.name,'gin-schnaps');
  assert.ok(readFileSync('src/App.tsx','utf8').includes(`className="version">${pkg.version}</span>`));
  assert.ok(readFileSync('src/formats/genbank-export.ts','utf8').includes(`Gin Schnaps ${pkg.version}. Current edited sequence`));
  const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
  assert.equal(lock.name,pkg.name);assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].name,pkg.name);assert.equal(lock.packages[''].version,pkg.version);
  const tauri=JSON.parse(readFileSync('desktop/tauri.conf.json','utf8'));
  assert.equal(tauri.productName,'Gin Schnaps');assert.equal(tauri.identifier,'org.ginschnaps.desktop');assert.equal(tauri.version,pkg.version);
  assert.ok(readFileSync('desktop/Cargo.lock','utf8').includes(`name = "gin-schnaps"\nversion = "${pkg.version}"`));
  assert.ok(readFileSync('desktop/src/main.rs','utf8').includes(`"version":"${pkg.version}"`));
  assert.ok(readFileSync('desktop/Cargo.toml','utf8').includes(`name = "gin-schnaps"\nversion = "${pkg.version}"`));
});
test('no superseded product branding in first-party runtime or public docs',()=>{
  // Construct the former tokens so this guard itself does not preserve old branding.
  const legacy=new RegExp(['Schnaps'+' Gene','schnaps'+'-gene','org.'+'schnapsgene','Snap'+'Gene'].join('|'),'i');
  for(const p of [...files('src'),...files('scripts'),...files('docs'),...files('desktop'),'README.md','SECURITY.md','CONTRIBUTING.md','CHANGELOG.md']){
    if(!/\.(?:ts|tsx|mjs|py|md|json|rs|toml|lock)$/.test(p))continue;
    // Persisted schema tags are retained for backward compatibility, never as labels.
    const content=readFileSync(p,'utf8').replaceAll("'"+'snap'+'gene'+"'","'binary-format-tag'");
    assert.ok(!legacy.test(content),`Old identity in ${p}`);
  }
});
test('public documentation local links point to existing files',()=>{
  for(const p of ['README.md','SECURITY.md','CONTRIBUTING.md',...files('docs').filter(p=>p.endsWith('.md'))]){
    for(const m of readFileSync(p,'utf8').matchAll(/\]\(([^\s)]+)\)/g)){
      const dest=m[1].split('#')[0];if(!dest||/^[a-z]+:/i.test(dest))continue;
      assert.ok(existsSync(path.resolve(path.dirname(p),decodeURIComponent(dest))),`${p}: missing ${dest}`);
    }
  }
});
