import {mkdir,readFile,writeFile} from 'node:fs/promises';
await mkdir('desktop/web',{recursive:true});
for(const name of ['index.html','diagnostic.html']) {
  const original=await readFile(`dist/${name}`,'utf8');
  // Tauri injects its own bootstrapping scripts and CSP hashes at compile time.
  // Keep the standalone browser build unchanged; never use unsafe-eval/script-inline.
  const html=original.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/,'');
  if(html===original)throw new Error('Expected standalone CSP missing; do not silently weaken another document.');
  await writeFile(`desktop/web/${name}`,html);
}
