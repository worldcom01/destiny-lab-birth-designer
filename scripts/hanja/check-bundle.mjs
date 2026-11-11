// R4 audit L1: fails when research-only (license not cleared) or test-fixture content is
// found in the compiled Next.js output. Run after `next build` (npm "postbuild").
//   node scripts/hanja/check-bundle.mjs [.next]
import fs from 'node:fs';
import path from 'node:path';
import { FORBIDDEN } from './forbidden-markers.mjs';

const root = process.argv[2] ?? '.next';
if (!fs.existsSync(root)) { console.error(`no build output at ${root}`); process.exit(2); }
const files = [];
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'cache') walk(p); } else if (/\.(js|mjs|cjs|html|json|rsc|txt|body)$/.test(e.name)) files.push(p); } };
walk(root);
const hits = [];
for (const f of files) { const t = fs.readFileSync(f, 'utf8'); for (const m of FORBIDDEN) if (t.includes(m)) hits.push(`${path.relative(root, f)}: ${m}`); }
const dictionaryChunks = files.filter(f => f.includes(`${path.sep}static${path.sep}`) && fs.readFileSync(f, 'utf8').includes('device for carrying a tripod')).length;
console.log(JSON.stringify({ filesScanned: files.length, forbiddenHits: hits.length, dictionaryChunks }));
if (hits.length) { console.error('FORBIDDEN content in build output:\n' + hits.slice(0, 20).join('\n')); process.exit(1); }
