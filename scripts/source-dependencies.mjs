import path from 'node:path';
import { existsSync } from 'node:fs';
/** Never consume TeselaGen prebundles: all runtime dependency code is linked
 * from the sources of the packages pinned by package-lock.json. */
export const sourceDependencies = {
  name: 'teselagen-source-only',
  setup(build) {
    // The published interval-tree CJS default is wrapped twice when imported
    // from an ESM package. Compile its shipped TypeScript source instead.
    build.onResolve({ filter: /^node-interval-tree$/ }, () => ({ path: path.resolve('node_modules/node-interval-tree/index.ts') }));
    build.onResolve({ filter: /^@teselagen\/(ove|ui|bio-parsers|range-utils|sequence-utils|file-utils)$/ }, args => {
      const root = path.resolve('node_modules', args.path, 'src');
      const file = args.path === '@teselagen/ove' ? 'gin-schnaps-entry.js' : 'index.js';
      if (file === 'gin-schnaps-entry.js') return { path: 'ove-entry', namespace: 'gin-schnaps-source' };
      if (!existsSync(path.join(root, file))) throw new Error(`Source absent: ${args.path}`);
      return { path: path.join(root, file) };
    });
    build.onLoad({ filter: /^ove-entry$/, namespace: 'gin-schnaps-source' }, () => ({
      contents: `export {default as SimpleCircularOrLinearView} from './SimpleCircularOrLinearView.js'; import './style.css';`,
      resolveDir: path.resolve('node_modules/@teselagen/ove/src'), loader: 'js'
    }));
  }
};
