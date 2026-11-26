import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * `virtual:model-versions`: a short content hash per file in public/models. Model URLs get
 * `?v=<hash>`, so browsers always load a changed model (and keep unchanged ones cached).
 */
function modelVersions(): Plugin {
  const id = 'virtual:model-versions', resolved = '\0' + id;
  const scan = () => {
    const root = 'public', out: Record<string, string> = {};
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else out['/' + relative(root, p).split('\\').join('/')] = createHash('md5').update(readFileSync(p)).digest('hex').slice(0, 8);
      }
    };
    walk(join(root, 'models'));
    return out;
  };
  return {
    name: 'model-versions',
    resolveId: (s) => (s === id ? resolved : null),
    load: (s) => (s === resolved ? `export default ${JSON.stringify(scan())};` : null),
  };
}

export default defineConfig({
  plugins: [modelVersions()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
