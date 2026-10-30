import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';

import { CONFIG } from '../game/config.js';
import { serialize, parseSave } from '../game/engine/persistence.js';
import { readJson } from '../server/http.js';
import { academy } from './helpers/academy.js';

const put = (body, type = 'application/json') => new Request('http://localhost/api/save', {
  method: 'PUT', headers: { 'Content-Type': type }, body,
});

test('save guarda números quebrados com 4 casas e continua válido', () => {
  const s = academy({ students: 40 });
  s.money = 1234.567891234;
  s.students[0].look.body = 1.0572577290702612;
  const text = serialize(s);
  assert.ok(!/\d\.\d{5,}/.test(text), 'nenhum número com mais de 4 casas');
  const back = parseSave(text);
  assert.equal(back.money, 1234.5679);
  assert.equal(back.students.length, 40);
  assert.equal(back.students[0].look.body, 1.0573);
  assert.equal(back.rng.s, s.rng.s, 'inteiros não mudam');
});

test('servidor aceita o save compactado (gzip) e descompacta', async () => {
  const s = academy({ students: 20 });
  const text = `{"rev":3,"save":${serialize(s)}}`;
  const { body, error } = await readJson(put(gzipSync(text), 'application/gzip'), 50_000, { maxInflated: 1e6 });
  assert.equal(error, undefined);
  assert.equal(body.rev, 3);
  assert.equal(body.save.students.length, 20);
});

test('limites: compactado grande demais, descompactado grande demais e lixo', async () => {
  const big = JSON.stringify({ save: { x: 'a'.repeat(50_000) } });
  // o que chega passa do limite
  assert.equal((await readJson(put(big), 1000)).error, 'Dados grandes demais.');
  // compactado é pequeno, mas abre em mais do que o permitido (bomba de compressão)
  const gz = gzipSync(big);
  assert.ok(gz.length < 1000);
  assert.equal((await readJson(put(gz, 'application/gzip'), 1000, { maxInflated: 10_000 })).error, 'Dados grandes demais.');
  assert.equal((await readJson(put(Buffer.from('não é gzip'), 'application/gzip'), 1000, { maxInflated: 10_000 })).error, 'Dados compactados inválidos.');
  // rotas sem maxInflated não aceitam gzip
  assert.equal((await readJson(put(gz, 'application/gzip'), 10_000)).error, 'JSON inválido.');
});

test('save com milhares de alunos cabe no limite do servidor depois de compactado', () => {
  const s = academy({ students: 6000 });
  const text = `{"rev":0,"save":${serialize(s)}}`;
  assert.ok(text.length > 1_500_000, `save grande de verdade (${text.length})`);
  assert.ok(text.length < CONFIG.online.maxSaveJsonBytes);
  assert.ok(gzipSync(text).length < CONFIG.online.maxSaveBytes);
});
