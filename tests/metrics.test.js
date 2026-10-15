import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chamado } from '../js/models/Chamado.js';
import * as M from '../js/analytics/Metrics.js';

const AGORA = new Date('2026-10-15T12:00:00Z');
const horasAtras = (h) => new Date(AGORA.getTime() - h * 3600 * 1000).toISOString();

function chamado(dados) {
  return new Chamado({ id: 'CH-X', titulo: 'Teste de chamado', categoria: 'Cadastro', prioridade: 'Média', unidade: 'BH', solicitanteEmail: 'a@b.com', ...dados });
}

test('quantil e mediana usam interpolação linear', () => {
  assert.equal(M.mediana([1, 2, 3, 4]), 2.5);
  assert.equal(M.quantil([10, 20, 30, 40, 50], 0.9), 46);
  assert.equal(M.mediana([]), null);
});

test('calcularKpis ignora resolvidos com datas inconsistentes nas contas de tempo', () => {
  const lista = [
    chamado({ status: 'Resolvido', abertoEm: horasAtras(30), resolvidoEm: horasAtras(20) }), // 10 h, Média (24 h) => no prazo
    chamado({ status: 'Resolvido', abertoEm: horasAtras(60), resolvidoEm: horasAtras(20) }), // 40 h => fora do prazo
    chamado({ status: 'Resolvido', abertoEm: horasAtras(10), resolvidoEm: horasAtras(15) }), // resolução antes da abertura
    chamado({ status: 'Aberto', abertoEm: horasAtras(5) }),
  ];
  const k = M.calcularKpis(lista);
  assert.equal(k.total, 4);
  assert.equal(k.backlog, 1);
  assert.equal(k.excluidosDosTempos, 1);
  assert.equal(k.tempoMedianoHoras, 25);
  assert.equal(k.pctNoSla, 50);
});

test('normalizarCategoria não corrige erros de digitação silenciosamente', () => {
  assert.equal(M.normalizarCategoria(' financeiro '), 'Financeiro');
  assert.equal(M.normalizarCategoria('Finaceiro'), 'Não classificada');
  assert.equal(M.normalizarCategoria(''), 'Não classificada');
});

test('backlogPorIdade distribui só os não resolvidos nas faixas', () => {
  const lista = [
    chamado({ status: 'Aberto', abertoEm: horasAtras(5) }),
    chamado({ status: 'Em andamento', abertoEm: horasAtras(50) }),
    chamado({ status: 'Aberto', abertoEm: horasAtras(24 * 10) }),
    chamado({ status: 'Resolvido', abertoEm: horasAtras(24 * 10), resolvidoEm: horasAtras(24 * 9) }),
  ];
  const faixas = M.backlogPorIdade(lista, AGORA).map((f) => f.quantidade);
  assert.deepEqual(faixas, [1, 1, 0, 1]);
});

test('kpisComComparacao compara com o período anterior de mesmo tamanho', () => {
  const lista = [
    chamado({ abertoEm: horasAtras(24 * 5) }),
    chamado({ abertoEm: horasAtras(24 * 6) }),
    chamado({ abertoEm: horasAtras(24 * 40) }),
  ];
  const r = M.kpisComComparacao(lista, 30, AGORA);
  assert.equal(r.atual.total, 2);
  assert.equal(r.anterior.total, 1);
  assert.equal(r.variacao.total, 100);
});

test('volumeSemanal conta abertos pela abertura e resolvidos pela resolução', () => {
  const lista = [
    chamado({ status: 'Resolvido', abertoEm: horasAtras(24 * 8), resolvidoEm: horasAtras(2) }),
    chamado({ abertoEm: horasAtras(3) }),
  ];
  const semanas = M.volumeSemanal(lista, 3, AGORA);
  assert.equal(semanas.length, 3);
  assert.equal(semanas.reduce((s, b) => s + b.abertos, 0), 2);
  assert.equal(semanas.at(-1).resolvidos, 1);
});

test('formatadores', () => {
  assert.equal(M.formatarHoras(0.5), '30 min');
  assert.equal(M.formatarHoras(12.34), '12,3 h');
  assert.equal(M.formatarHoras(72), '3 dias');
  assert.equal(M.formatarPct(33.333), '33%');
  assert.equal(M.formatarPct(null), '–');
});
