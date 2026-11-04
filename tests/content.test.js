import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const bank = JSON.parse(readFileSync(new URL('../dist/bank.json', import.meta.url), 'utf8'));

test('every topic is either in preparation or has thirty distinct, explained questions', () => {
  for (const topic of bank.topics) {
    const qs = bank.questions.filter(q => q.topic === topic.id);
    assert.ok(qs.length === 0 || qs.length === 30, `Tema ${topic.number}: ${qs.length} preguntas`);
    const signatures = qs.map(q => JSON.stringify([q.text.toLocaleLowerCase('es'), q.options.map(o => o.text.toLocaleLowerCase('es'))]));
    assert.equal(new Set(signatures).size, qs.length, `Duplicada en el tema ${topic.number}`);
    for (const q of qs) {
      assert.equal(new Set(q.options.map(o => o.text.toLowerCase())).size, 4, q.id);
      assert.ok(q.explanation.length >= 35, `Explicación corta: ${q.id}`);
      assert.ok(['clase', 'practice'].includes(q.source.kind), q.id);
    }
  }
});

test('distributed data contains no host paths, credentials or audio references', () => {
  const text = JSON.stringify(bank);
  assert.doesNotMatch(text, /\/Users\//);
  assert.doesNotMatch(text, /sk-or-|access_token|refresh_token|OPENROUTER/i);
});

test('every topic audio is a bundled relative .m4a that exists and is small enough for GitHub', () => {
  for (const topic of bank.topics) for (const part of topic.audio ?? []) {
    assert.match(part.url, /^audio\/[a-z0-9][a-z0-9/_-]*\.m4a$/i, part.url);
    assert.ok(part.title && part.seconds > 600, `${part.url}: título o duración`);
    const size = statSync(new URL('../dist/' + part.url, import.meta.url)).size;
    assert.equal(size, part.bytes, `${part.url}: tamaño distinto del declarado`);
    assert.ok(size < 90e6, `${part.url} supera el límite de GitHub`);
  }
});
