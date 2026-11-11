// Loads TypeScript modules of this app from Node scripts through the already
// installed vite (no extra dependency). Used by the Hanja dictionary workflow.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../..', import.meta.url));

/** Loads each module path (e.g. '/src/data/hanjaDB.ts'); closes the loader afterwards. */
export async function loadTs(paths) {
  const server = await createServer({
    root, configFile: false, logLevel: 'error', appType: 'custom',
    resolve: { alias: { '@': `${root}src` } },
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const out = [];
    for (const p of paths) out.push(await server.ssrLoadModule(p));
    return out;
  } finally {
    await server.close();
  }
}
