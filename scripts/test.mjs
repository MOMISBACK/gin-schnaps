import { build } from 'esbuild';
import { sourceDependencies } from './source-dependencies.mjs';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('.test-build', { recursive: true });
await build({ entryPoints: ['tests/all-tests.ts'], bundle: true, platform: 'node', plugins: [sourceDependencies], format: 'cjs', outfile: '.test-build/domain.test.cjs' });
const result = spawnSync(process.execPath, ['--test', '.test-build/domain.test.cjs'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
