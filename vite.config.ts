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

/**
 * A unique id per build, baked into the game (`__BUILD_ID__`) and written to `/version.json`. The
 * running game checks that file now and then: a different id means a new version was deployed.
 */
const BUILD_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID }) }); },
  };
}

export default defineConfig({
  plugins: [modelVersions(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
