import { readFile, writeFile, mkdir, stat, readdir, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import path from 'node:path';

// Comprime las grabaciones de clase (mono, 32 kbps, AAC con faststart para poder saltar
// a cualquier minuto sin bajarlo todo) a dist/audio/<asignatura>/ y escribe content/audio.json,
// que `npm run bank` incorpora a cada tema como topic.audio.
// Los originales se leen de AUDIO_DIR (por defecto ~/Documents/mamen) y no se guardan en el repo.
const run = promisify(execFile);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = process.env.AUDIO_DIR ?? path.join(homedir(), 'Documents/mamen');
const curso = JSON.parse(await readFile(path.join(root, 'content/curso.json'), 'utf8'));
const fuentes = JSON.parse(await readFile(path.join(root, 'content/audio-fuentes.json'), 'utf8'));
const previous = JSON.parse(await readFile(path.join(root, 'content/audio.json'), 'utf8').catch(() => '{}'));
const out = {};
const keep = new Set();
for (const [id, parts] of Object.entries(fuentes)) {
  const topic = curso.topics.find(t => t.id === Number(id));
  if (!topic) throw Error(`audio-fuentes.json: el tema ${id} no existe`);
  const nn = String(topic.number).padStart(2, '0');
  out[id] = [];
  for (const [i, part] of parts.entries()) {
    const rel = `audio/${topic.course}/tema-${nn}${parts.length > 1 ? `-parte-${i + 1}` : ''}.m4a`;
    const dest = path.join(root, 'dist', rel);
    await mkdir(path.dirname(dest), { recursive: true });
    keep.add(dest);
    const have = await stat(dest).catch(() => null);
    // Se recomprime si falta o si ese tema pasó a usar otra grabación de origen.
    if (!have || previous[id]?.[i]?.source !== part.file) {
      await run('ffmpeg', ['-v', 'error', '-y', '-i', path.join(srcDir, part.file), '-vn', '-ac', '1', '-ar', '24000',
        '-c:a', 'aac', '-b:a', '32k', '-movflags', '+faststart', dest]);
    }
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dest]);
    const bytes = (await stat(dest)).size;
    out[id].push({ url: rel, source: part.file, title: part.title, seconds: Math.round(Number(stdout)), bytes });
    console.log(`Tema ${topic.number}: ${rel} · ${Math.round(Number(stdout) / 60)} min · ${(bytes / 1e6).toFixed(1)} MB`);
  }
}
// Borra los audios que ya no corresponden a ningún tema (por ejemplo tras renumerar).
for (const course of new Set(curso.topics.map(t => t.course))) {
  const dir = path.join(root, 'dist/audio', course);
  for (const f of await readdir(dir).catch(() => [])) if (!keep.has(path.join(dir, f))) await unlink(path.join(dir, f));
}
await writeFile(path.join(root, 'content/audio.json'), JSON.stringify(out, null, 1) + '\n');
