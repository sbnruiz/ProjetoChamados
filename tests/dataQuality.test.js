import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chamado } from '../js/models/Chamado.js';
import { AuditoriaQualidade } from '../js/analytics/DataQuality.js';

const base = {
  titulo: 'Erro ao salvar cadastro',
  categoria: 'Cadastro',
  prioridade: 'Média',
  unidade: 'Contagem',
  solicitanteEmail: 'maria.souza@rede-exemplo.com.br',
  abertoEm: '2026-10-01T10:00:00Z',
};
const c = (id, extra = {}) => new Chamado({ id, ...base, ...extra });

function problemasDe(resultado, id) {
  return resultado.registros.find((r) => r.chamado.id === id)?.problemas.map((p) => p.id) ?? [];
}

test('registro correto não gera problema', () => {
  const r = new AuditoriaQualidade().avaliar([c('1')]);
  assert.equal(r.comProblema, 0);
  assert.equal(r.score, 100);
});

test('detecta campos vazios, e-mail inválido e categoria fora do padrão', () => {
  const r = new AuditoriaQualidade().avaliar([
    c('1', { solicitanteEmail: '' }),
    c('2', { solicitanteEmail: 'maria.souza.rede-exemplo.com.br', titulo: 'Outro título' }),
    c('3', { categoria: 'Finaceiro', titulo: 'Mais um' }),
    c('4', { unidade: '  ', titulo: 'Último' }),
  ]);
  assert.deepEqual(problemasDe(r, '1'), ['obrigatorio-solicitanteEmail']);
  assert.deepEqual(problemasDe(r, '2'), ['email-invalido']);
  assert.deepEqual(problemasDe(r, '3'), ['categoria-fora-padrao']);
  assert.deepEqual(problemasDe(r, '4'), ['obrigatorio-unidade']);
  assert.equal(r.score, 0);
});

test('detecta incoerência entre status e datas', () => {
  const r = new AuditoriaQualidade().avaliar([
    c('1', { status: 'Resolvido', resolvidoEm: null }),
    c('2', { status: 'Resolvido', resolvidoEm: '2026-09-30T10:00:00Z', titulo: 'Outro' }),
  ]);
  assert.deepEqual(problemasDe(r, '1'), ['resolvido-sem-data']);
  assert.deepEqual(problemasDe(r, '2'), ['datas-inconsistentes']);
});

test('marca como duplicado apenas a segunda abertura dentro da janela de 1 hora', () => {
  const r = new AuditoriaQualidade().avaliar([
    c('1'),
    c('2', { abertoEm: '2026-10-01T10:05:00Z' }), // 5 min depois: duplicado
    c('3', { abertoEm: '2026-10-03T10:00:00Z' }), // 2 dias depois: novo chamado legítimo
  ]);
  assert.deepEqual(problemasDe(r, '1'), []);
  assert.deepEqual(problemasDe(r, '2'), ['possivel-duplicado']);
  assert.deepEqual(problemasDe(r, '3'), []);
});
