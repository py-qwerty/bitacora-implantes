import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Genera un PDF por tema digital abriendo #/tema/N/pdf en Chrome sin interfaz.
// Uso: node scripts/build-pdfs.mjs [--only N] [--dist carpeta]
// Escribe dist/materials/<asignatura>/tema-NN-<titulo>.pdf y content/materials.json
// (que `npm run bank` incorpora al banco como topic.material).
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const dist = path.resolve(arg('--dist') ?? path.join(root, 'dist'));
const only = arg('--only') ? Number(arg('--only')) : null;
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json' };

const bank = JSON.parse(await readFile(path.join(dist, 'bank.json'), 'utf8'));
const index = JSON.parse(await readFile(path.join(dist, 'temas/index.json'), 'utf8'));
const withTema = new Set(index.temas.map(t => t.topic));
const slug = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const server = createServer(async (req, res) => {
  try {
    const file = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/$/, '/index.html'));
    if (!file.startsWith(dist)) throw Error('fuera de dist');
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const matPath = path.join(root, 'content/materials.json');
const materials = JSON.parse(await readFile(matPath, 'utf8').catch(() => '{}'));
for (const topic of bank.topics) {
  if (!withTema.has(topic.id) || (only && topic.number !== only)) continue;
  const nn = String(topic.number).padStart(2, '0');
  const rel = `materials/${topic.course}/tema-${nn}-${slug(topic.title)}.pdf`;
  const out = path.join(dist, rel);
  await mkdir(path.dirname(out), { recursive: true });
  const profile = path.join(tmpdir(), `bitacora-pdf-${process.pid}-${topic.id}`);
  await new Promise((ok, fail) => {
    const p = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', `--user-data-dir=${profile}`, '--no-pdf-header-footer',
      '--run-all-compositor-stages-before-draw', '--virtual-time-budget=20000', `--print-to-pdf=${out}`, `${base}/#/tema/${topic.id}/pdf`], { stdio: 'ignore' });
    p.on('exit', code => (code === 0 ? ok() : fail(Error(`Chrome terminó con código ${code}`))));
  });
  const bytes = (await stat(out)).size;
  const pages = (Buffer.from(await readFile(out)).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  materials[topic.id] = { url: rel, format: 'pdf', pages, bytes, title: `Tema ${topic.number}. ${topic.title}` };
  console.log(`Tema ${topic.number}: ${rel} · ${pages} páginas · ${(bytes / 1e6).toFixed(1)} MB`);
}
server.close();
await writeFile(matPath, JSON.stringify(materials, null, 1) + '\n');
