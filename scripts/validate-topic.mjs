import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateBank, validateTema } from '../dist/core.js';

// Valida en memoria, sin escribir nada, el tema N: node scripts/validate-topic.mjs 3
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const n = Number(process.argv[2]);
const nn = String(n).padStart(2, '0');
const curso = JSON.parse(await readFile(path.join(root, 'content/curso.json'), 'utf8'));
const topic = curso.topics.find(t => t.number === n);
if (!topic) throw Error(`El tema ${n} no existe en content/curso.json`);
const list = JSON.parse(await readFile(path.join(root, `content/preguntas/${topic.course}/tema-${nn}.json`), 'utf8'));
const tema = JSON.parse(await readFile(path.join(root, `content/temas/${topic.course}/tema-${nn}.json`), 'utf8'));
if (list.length !== 30) throw Error(`Hay ${list.length} preguntas; deben ser 30`);
const questions = list.map((q, i) => {
  if (!Array.isArray(q.options) || q.options.length !== 4) throw Error(`#${i + 1}: deben ser cuatro opciones`);
  if (!['a', 'b', 'c', 'd'].includes(q.correct)) throw Error(`#${i + 1}: correct debe ser a, b, c o d`);
  if (!q.explanation || q.explanation.length < 35) throw Error(`#${i + 1}: explicación demasiado corta`);
  return { id: `${topic.course}-t${nn}-${String(i + 1).padStart(2, '0')}`, course: topic.course, topic: topic.id, test: `Tema ${n}`, order: i + 1,
    text: q.text, options: q.options.map((text, k) => ({ key: 'abcd'[k], text })), correct: q.correct, explanation: q.explanation, difficulty: q.difficulty ?? 'media', source: q.source };
});
const texts = questions.map(q => q.text.toLowerCase());
if (new Set(texts).size !== 30) throw Error('Hay enunciados repetidos');
const dist = ['a', 'b', 'c', 'd'].map(k => questions.filter(q => q.correct === k).length);
validateBank({ ...curso, questions });
validateTema(tema, { ...curso, questions });
const bad = questions.filter(q => new Set(q.options.map(o => o.text.toLowerCase())).size !== 4).map(q => q.id);
if (bad.length) throw Error(`Opciones repetidas en ${bad.join(', ')}`);
if (Math.max(...dist) > 12) throw Error(`Respuestas correctas muy desequilibradas (a,b,c,d = ${dist}); reparte mejor`);
console.log(`Tema ${n} OK: ${tema.sections.length} apartados, 30 preguntas, correctas a/b/c/d = ${dist.join('/')}`);
