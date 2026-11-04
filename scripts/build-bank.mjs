import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateBank } from '../dist/core.js';

// Une content/curso.json (asignaturas y temas) con las preguntas de
// content/preguntas/<asignatura>/tema-NN.json y escribe dist/bank.json.
// Cada archivo de preguntas es una lista de 30 objetos:
//   { text, options: [a, b, c, d] (cuatro textos), correct: 'a'|'b'|'c'|'d',
//     explanation, difficulty: 'baja'|'media'|'alta', source: { kind: 'clase'|'practice', title } }
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const curso = JSON.parse(await readFile(path.join(root, 'content/curso.json'), 'utf8'));
const bankPath = path.join(root, 'dist/bank.json');
const previous = JSON.parse(await readFile(bankPath, 'utf8').catch(() => 'null'));

const materials = JSON.parse(await readFile(path.join(root, 'content/materials.json'), 'utf8').catch(() => '{}'));
const audio = JSON.parse(await readFile(path.join(root, 'content/audio.json'), 'utf8').catch(() => '{}'));
const topics = curso.topics.map(t => ({ ...t, ...(materials[t.id] ? { material: materials[t.id] } : {}), ...(audio[t.id]?.length ? { audio: audio[t.id] } : {}) }));
const questions = [];
for (const topic of topics) {
  const nn = String(topic.number).padStart(2, '0');
  const file = path.join(root, 'content/preguntas', topic.course, `tema-${nn}.json`);
  const list = JSON.parse(await readFile(file, 'utf8').catch(() => 'null'));
  if (!list) continue;
  list.forEach((q, i) => {
    if (!Array.isArray(q.options) || q.options.length !== 4) throw Error(`${topic.course}/tema-${nn} #${i + 1}: deben ser cuatro opciones`);
    questions.push({
      id: `${topic.course}-t${nn}-${String(i + 1).padStart(2, '0')}`,
      course: topic.course,
      topic: topic.id,
      test: `Tema ${topic.number}`,
      order: i + 1,
      text: q.text,
      options: q.options.map((text, k) => ({ key: 'abcd'[k], text })),
      correct: q.correct,
      explanation: q.explanation,
      difficulty: q.difficulty ?? 'media',
      source: q.source,
    });
  });
}

const body = { title: curso.title, context: curso.context, courses: curso.courses, topics, questions };
// La versión solo cambia si cambia el contenido, para que las pruebas no ensucien el repositorio.
const { version: oldVersion, ...oldBody } = previous ?? {};
let version = oldVersion;
if (JSON.stringify(oldBody) !== JSON.stringify(body)) {
  const today = new Date().toISOString().slice(0, 10);
  const [prevDay, prevN] = (oldVersion ?? '').split('.');
  version = `${today}.${prevDay === today ? Number(prevN) + 1 : 1}`;
}
const bank = { version, ...body };
validateBank(bank);
await writeFile(bankPath, JSON.stringify(bank) + '\n');
const ready = new Set(questions.map(q => q.topic)).size;
console.log(`bank.json ${version}: ${topics.length} temas (${ready} con preguntas), ${questions.length} preguntas`);
