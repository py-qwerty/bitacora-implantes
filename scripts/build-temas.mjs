import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateTema } from '../dist/core.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bank = JSON.parse(await readFile(path.join(root, 'dist/bank.json'), 'utf8'));
const out = path.join(root, 'dist/temas');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const index = [];
for (const course of bank.courses) {
  const dir = path.join(root, 'content/temas', course.id);
  const files = (await readdir(dir).catch(() => [])).filter(f => /^tema-\d{2}\.json$/.test(f)).sort();
  for (const file of files) {
    const tema = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
    if (tema.course !== course.id || `tema-${String(tema.number).padStart(2, '0')}.json` !== file) throw Error(`${course.id}/${file}: asignatura o número no coinciden con el nombre`);
    const topic = validateTema(tema, bank);
    await writeFile(path.join(out, `${topic.id}.json`), JSON.stringify({ ...tema, topic: topic.id }) + '\n');
    index.push({ topic: topic.id, sections: tema.sections.length, minutes: tema.minutes ?? null, doubts: Object.values(tema.questions).filter(q => q.doubt).length });
  }
}
await writeFile(path.join(out, 'index.json'), JSON.stringify({ version: bank.version, temas: index }, null, 2) + '\n');
console.log(`${index.length} temas digitales publicados`, index.map(t => t.topic).join(', '));
