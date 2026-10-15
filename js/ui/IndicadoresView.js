import * as M from '../analytics/Metrics.js';
import { escapar, formatarNumero } from './dom.js';
import { graficoLinhas, graficoBarras } from './charts.js';

const pct = (v) => M.formatarPct(v);
const ICONES = { volume: 'i', alerta: '!', positivo: '✓', dados: '?' };

function delta(valor, { inverter = false, sufixo = '%', casas = 0 } = {}) {
  if (valor === null || Number.isNaN(valor)) return '<span class="muted">sem base de comparação</span>';
  const arredondado = Number(valor.toFixed(casas));
  if (arredondado === 0) return '<span class="delta">estável</span> vs. período anterior';
  const melhorou = inverter ? arredondado < 0 : arredondado > 0;
  const seta = arredondado > 0 ? '▲' : '▼';
  const texto = `${seta} ${formatarNumero(Math.abs(arredondado), casas)}${sufixo}`;
  return `<span class="delta ${melhorou ? 'bom' : 'ruim'}">${texto}</span> vs. período anterior`;
}

function tile(rotulo, valor, detalhe) {
  return `<article class="card kpi"><p class="rotulo">${rotulo}</p><p class="valor">${valor}</p><p class="detalhe">${detalhe}</p></article>`;
}

export class IndicadoresView {
  constructor() {
    this.kpis = document.getElementById('kpis');
    this.insights = document.getElementById('insights');
    this.tabelaCategorias = document.getElementById('tabela-categorias');
    this.tabelaUnidades = document.getElementById('tabela-unidades');
    this.periodo = document.getElementById('periodo-descricao');
  }

  render(todos, dias, agora = new Date()) {
    const chamados = M.filtrarPeriodo(todos, dias, agora);
    const { atual, variacao } = M.kpisComComparacao(todos, dias, agora);

    this.periodo.textContent = `Chamados abertos nos últimos ${dias} dias (${formatarNumero(chamados.length)} registros). Comparação com os ${dias} dias anteriores.`;

    // Para o volume, subir não é "bom" nem "ruim"; mostramos em cor neutra.
    const deltaVolume = variacao.total === null
      ? '<span class="muted">sem base de comparação</span>'
      : `<span class="delta">${variacao.total > 0 ? '▲' : '▼'} ${formatarNumero(Math.abs(variacao.total))}%</span> vs. período anterior`;

    // Backlog é um retrato de agora: considera todos os não resolvidos, não só os abertos no período.
    const idade = M.backlogPorIdade(todos, agora);
    const backlogAtual = idade.reduce((s, f) => s + f.quantidade, 0);
    const antigos = idade.at(-1).quantidade;

    this.kpis.innerHTML = [
      tile('Chamados abertos no período', formatarNumero(atual.total), deltaVolume),
      tile('Backlog atual', formatarNumero(backlogAtual), antigos ? `<span class="delta ruim">${formatarNumero(antigos)}</span> esperando há mais de 7 dias` : 'nenhum esperando há mais de 7 dias'),
      tile('Mediana de resolução', M.formatarHoras(atual.tempoMedianoHoras), `90% resolvidos em até ${M.formatarHoras(atual.tempoP90Horas)}`),
      tile('Resolvidos dentro do SLA', pct(atual.pctNoSla), delta(variacao.pctNoSla, { sufixo: ' p.p.', casas: 1 })),
    ].join('');

    const insights = M.gerarInsights(chamados, agora, { todos });
    this.insights.innerHTML = insights.length
      ? insights.map((i) => `<li class="${i.tipo}"><span class="icone" aria-hidden="true">${ICONES[i.tipo]}</span><p>${escapar(i.texto)}</p></li>`).join('')
      : '<li><span class="icone">i</span><p class="muted">Sem dados suficientes no período.</p></li>';

    this.renderGraficos(chamados, todos, dias, agora, atual);
    this.renderTabelas(chamados);
  }

  renderGraficos(chamados, todos, dias, agora, atual) {
    // Semanal: usa a base completa para não cortar a primeira semana do período no meio.
    const semanas = M.volumeSemanal(todos, Math.ceil(dias / 7), agora);
    const rotulos = semanas.map((s, i) => {
      const r = s.inicio.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      return i === semanas.length - 1 ? `${r}*` : r;
    });
    graficoLinhas('grafico-semanal', {
      rotulos,
      series: [
        { nome: 'Abertos', valores: semanas.map((s) => s.abertos) },
        { nome: 'Resolvidos', valores: semanas.map((s) => s.resolvidos) },
      ],
    });

    const referencia = atual.pctNoSla !== null ? { valor: atual.pctNoSla, rotulo: `Geral ${pct(atual.pctNoSla)}` } : null;

    const cats = M.porCategoria(chamados)
      .filter((c) => c.pctNoSla !== null)
      .sort((a, b) => a.pctNoSla - b.pctNoSla);
    graficoBarras('grafico-sla-categoria', {
      rotulos: cats.map((c) => c.categoria),
      valores: cats.map((c) => Number(c.pctNoSla.toFixed(1))),
      horizontal: true,
      maximo: 100,
      formatar: (v) => pct(v),
      referencia,
      nomeSerie: '% no SLA',
    });

    const prios = M.slaPorPrioridade(chamados);
    graficoBarras('grafico-sla-prioridade', {
      rotulos: prios.map((p) => `${p.prioridade} (${p.slaHoras} h)`),
      valores: prios.map((p) => (p.pctNoSla === null ? null : Number(p.pctNoSla.toFixed(1)))),
      horizontal: true,
      maximo: 100,
      formatar: (v) => pct(v),
      referencia,
      nomeSerie: '% no SLA',
    });

    const idade = M.backlogPorIdade(todos, agora);
    graficoBarras('grafico-backlog', {
      rotulos: idade.map((f) => f.faixa),
      valores: idade.map((f) => f.quantidade),
      formatar: (v) => formatarNumero(v),
      nomeSerie: 'Chamados',
    });
  }

  renderTabelas(chamados) {
    const cats = M.porCategoria(chamados);
    this.tabelaCategorias.innerHTML = `
      <thead><tr><th>Categoria</th><th class="num">Chamados</th><th class="num">Participação</th><th class="num">Mediana</th><th class="num">No SLA</th></tr></thead>
      <tbody>${cats.map((c) => `
        <tr>
          <td>${escapar(c.categoria)}</td>
          <td class="num">${formatarNumero(c.total)}</td>
          <td class="num">${pct(c.participacao)}</td>
          <td class="num">${M.formatarHoras(c.tempoMedianoHoras)}</td>
          <td class="num">${pct(c.pctNoSla)}</td>
        </tr>`).join('')}
      </tbody>`;

    const unidades = M.porUnidade(chamados);
    const maior = Math.max(...unidades.map((u) => u.total), 1);
    this.tabelaUnidades.innerHTML = `
      <thead><tr><th>Unidade</th><th>Chamados</th><th class="num">Backlog</th><th class="num">Mediana</th><th class="num">No SLA</th></tr></thead>
      <tbody>${unidades.map((u) => `
        <tr>
          <td>${escapar(u.unidade)}</td>
          <td><div class="barra-inline"><span class="num" style="min-width: 28px">${formatarNumero(u.total)}</span><div class="trilho"><div class="preenchimento" style="width: ${(u.total / maior) * 100}%"></div></div></div></td>
          <td class="num">${formatarNumero(u.backlog)}</td>
          <td class="num">${M.formatarHoras(u.tempoMedianoHoras)}</td>
          <td class="num">${pct(u.pctNoSla)}</td>
        </tr>`).join('')}
      </tbody>`;
  }
}
