// Cálculo dos indicadores do painel.
// Todas as funções são puras: recebem a lista de chamados e devolvem números,
// sem tocar no DOM nem no storage. Isso permite testá-las isoladamente.

import { CATEGORIAS, PRIORIDADES, SLA_HORAS } from '../models/Chamado.js';

const DIA_MS = 24 * 60 * 60 * 1000;

// ---------- estatística básica ----------

export function media(valores) {
  if (!valores.length) return null;
  return valores.reduce((s, v) => s + v, 0) / valores.length;
}

// Quantil com interpolação linear (mesmo método do Excel PERCENTIL.INC).
export function quantil(valores, q) {
  if (!valores.length) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const pos = (ordenados.length - 1) * q;
  const base = Math.floor(pos);
  const resto = pos - base;
  const proximo = ordenados[base + 1];
  return proximo !== undefined ? ordenados[base] + resto * (proximo - ordenados[base]) : ordenados[base];
}

export const mediana = (valores) => quantil(valores, 0.5);

function percentual(parte, total) {
  return total ? (parte / total) * 100 : null;
}

// ---------- normalização ----------

// Categorias digitadas fora do padrão ("financeiro ", "Finaceiro") não são corrigidas
// silenciosamente: vão para "Não classificada" e aparecem no módulo de qualidade.
export function normalizarCategoria(categoria) {
  const limpa = String(categoria ?? '').trim().toLowerCase();
  return CATEGORIAS.find((c) => c.toLowerCase() === limpa) ?? 'Não classificada';
}

// ---------- recortes ----------

export function filtrarPeriodo(chamados, dias, agora = new Date()) {
  const inicio = agora.getTime() - dias * DIA_MS;
  return chamados.filter((c) => {
    const t = new Date(c.abertoEm).getTime();
    return t > inicio && t <= agora.getTime();
  });
}

function filtrarPeriodoAnterior(chamados, dias, agora) {
  const fim = agora.getTime() - dias * DIA_MS;
  const inicio = fim - dias * DIA_MS;
  return chamados.filter((c) => {
    const t = new Date(c.abertoEm).getTime();
    return t > inicio && t <= fim;
  });
}

// ---------- indicadores principais ----------

export function calcularKpis(chamados) {
  const resolvidos = chamados.filter((c) => c.resolvido);
  const tempos = resolvidos.map((c) => c.tempoResolucaoHoras()).filter((h) => h !== null);
  const avaliadosSla = resolvidos.map((c) => c.dentroDoSla()).filter((v) => v !== null);

  return {
    total: chamados.length,
    resolvidos: resolvidos.length,
    backlog: chamados.length - resolvidos.length,
    tempoMedioHoras: media(tempos),
    tempoMedianoHoras: mediana(tempos),
    tempoP90Horas: quantil(tempos, 0.9),
    pctNoSla: percentual(avaliadosSla.filter(Boolean).length, avaliadosSla.length),
    // Resolvidos com datas ausentes ou incoerentes ficam fora das contas de tempo e SLA.
    excluidosDosTempos: resolvidos.length - tempos.length,
  };
}

// Indicadores do período atual comparados com o período imediatamente anterior, de mesmo tamanho.
export function kpisComComparacao(chamados, dias, agora = new Date()) {
  const atual = calcularKpis(filtrarPeriodo(chamados, dias, agora));
  const anterior = calcularKpis(filtrarPeriodoAnterior(chamados, dias, agora));
  const variacao = (a, b) => (a === null || b === null || b === 0 ? null : ((a - b) / b) * 100);
  return {
    atual,
    anterior,
    variacao: {
      total: variacao(atual.total, anterior.total),
      tempoMedianoHoras: variacao(atual.tempoMedianoHoras, anterior.tempoMedianoHoras),
      pctNoSla: atual.pctNoSla !== null && anterior.pctNoSla !== null ? atual.pctNoSla - anterior.pctNoSla : null, // pontos percentuais
    },
  };
}

// ---------- séries para os gráficos ----------

function inicioDaSemana(data) {
  const d = new Date(data);
  const diaSemana = (d.getDay() + 6) % 7; // segunda = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diaSemana);
  return d;
}

// Chamados abertos x resolvidos por semana (segunda a domingo).
export function volumeSemanal(chamados, semanas, agora = new Date()) {
  const ultima = inicioDaSemana(agora);
  const baldes = [];
  for (let i = semanas - 1; i >= 0; i--) {
    const inicio = new Date(ultima);
    inicio.setDate(inicio.getDate() - i * 7);
    baldes.push({ inicio, abertos: 0, resolvidos: 0 });
  }
  const indice = (iso) => {
    if (!iso) return -1;
    const t = inicioDaSemana(new Date(iso)).getTime();
    return baldes.findIndex((b) => b.inicio.getTime() === t);
  };
  for (const c of chamados) {
    const ia = indice(c.abertoEm);
    if (ia >= 0) baldes[ia].abertos++;
    if (c.resolvido && c.tempoResolucaoHoras() !== null) {
      const ir = indice(c.resolvidoEm);
      if (ir >= 0) baldes[ir].resolvidos++;
    }
  }
  return baldes;
}

export function porCategoria(chamados) {
  const grupos = new Map();
  for (const c of chamados) {
    const cat = normalizarCategoria(c.categoria);
    if (!grupos.has(cat)) grupos.set(cat, []);
    grupos.get(cat).push(c);
  }
  return [...grupos.entries()]
    .map(([categoria, lista]) => {
      const k = calcularKpis(lista);
      return {
        categoria,
        total: lista.length,
        participacao: percentual(lista.length, chamados.length),
        pctNoSla: k.pctNoSla,
        tempoMedianoHoras: k.tempoMedianoHoras,
        resolvidosValidos: k.resolvidos - k.excluidosDosTempos,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function slaPorPrioridade(chamados) {
  return [...PRIORIDADES].reverse().map((prioridade) => {
    const lista = chamados.filter((c) => c.prioridade === prioridade);
    const k = calcularKpis(lista);
    return {
      prioridade,
      slaHoras: SLA_HORAS[prioridade],
      total: lista.length,
      pctNoSla: k.pctNoSla,
      tempoMedianoHoras: k.tempoMedianoHoras,
    };
  });
}

export const FAIXAS_IDADE = [
  { rotulo: 'Até 1 dia', ate: 24 },
  { rotulo: '1 a 3 dias', ate: 72 },
  { rotulo: '3 a 7 dias', ate: 168 },
  { rotulo: 'Mais de 7 dias', ate: Infinity },
];

// Quanto tempo os chamados ainda não resolvidos estão esperando.
export function backlogPorIdade(chamados, agora = new Date()) {
  const contagem = FAIXAS_IDADE.map((f) => ({ faixa: f.rotulo, quantidade: 0 }));
  for (const c of chamados) {
    if (c.resolvido) continue;
    const idade = c.idadeHoras(agora);
    if (idade === null) continue;
    const i = FAIXAS_IDADE.findIndex((f) => idade < f.ate);
    contagem[i].quantidade++;
  }
  return contagem;
}

export function porUnidade(chamados) {
  const grupos = new Map();
  for (const c of chamados) {
    const unidade = c.unidade?.trim() || 'Não informada';
    if (!grupos.has(unidade)) grupos.set(unidade, []);
    grupos.get(unidade).push(c);
  }
  return [...grupos.entries()]
    .map(([unidade, lista]) => {
      const k = calcularKpis(lista);
      return { unidade, total: lista.length, backlog: k.backlog, pctNoSla: k.pctNoSla, tempoMedianoHoras: k.tempoMedianoHoras };
    })
    .sort((a, b) => b.total - a.total);
}

// ---------- leitura dos números ----------

// Transforma os números em frases curtas que respondem "e daí?".
// Só gera uma frase quando há volume suficiente para a conclusão não ser ruído.
// `todos` (opcional) é a base completa, usada na comparação de tendência, que precisa olhar
// para semanas fora do período filtrado.
export function gerarInsights(chamados, agora = new Date(), { minimoAmostra = 10, todos = chamados } = {}) {
  const insights = [];
  if (!chamados.length) return insights;

  const cats = porCategoria(chamados).filter((c) => c.categoria !== 'Não classificada');
  const geral = calcularKpis(chamados);

  // 1. Onde está o volume
  if (cats.length) {
    const maior = cats[0];
    insights.push({
      tipo: 'volume',
      texto: `${maior.categoria} concentra ${formatarPct(maior.participacao)} dos chamados do período. É a categoria com mais demanda.`,
    });
  }

  // 2. Pior cumprimento de SLA entre categorias com amostra suficiente
  const comAmostra = cats.filter((c) => c.resolvidosValidos >= minimoAmostra && c.pctNoSla !== null);
  if (comAmostra.length && geral.pctNoSla !== null) {
    const pior = comAmostra.reduce((p, c) => (c.pctNoSla < p.pctNoSla ? c : p));
    if (geral.pctNoSla - pior.pctNoSla >= 5) {
      insights.push({
        tipo: 'alerta',
        texto: `${pior.categoria} cumpre o SLA em apenas ${formatarPct(pior.pctNoSla)} dos casos, contra ${formatarPct(geral.pctNoSla)} no geral. Mediana de resolução: ${formatarHoras(pior.tempoMedianoHoras)}. É o primeiro lugar para investigar a causa.`,
      });
    }
  }

  // 3. Backlog envelhecido
  const idade = backlogPorIdade(todos, agora); // backlog é um retrato de agora, independe do período
  const antigos = idade.at(-1).quantidade;
  if (antigos > 0) {
    insights.push({
      tipo: 'alerta',
      texto: `${antigos} chamado${antigos > 1 ? 's estão' : ' está'} aberto${antigos > 1 ? 's' : ''} há mais de 7 dias. Vale revisar se ainda são válidos ou se estão travados em alguma etapa.`,
    });
  }

  // 4. Tendência: últimos 28 dias x 28 dias anteriores (janelas completas, sem semana pela metade)
  const recentes = filtrarPeriodo(todos, 28, agora).length;
  const anteriores = filtrarPeriodoAnterior(todos, 28, agora).length;
  if (anteriores >= minimoAmostra) {
    const variacao = ((recentes - anteriores) / anteriores) * 100;
    if (Math.abs(variacao) >= 10) {
      insights.push({
        tipo: variacao > 0 ? 'alerta' : 'positivo',
        texto: `A abertura de chamados ${variacao > 0 ? 'subiu' : 'caiu'} ${formatarPct(Math.abs(variacao))} nos últimos 28 dias em relação aos 28 anteriores (${anteriores} → ${recentes}).`,
      });
    }
  }

  // 5. Transparência sobre os dados
  if (geral.excluidosDosTempos > 0) {
    insights.push({
      tipo: 'dados',
      texto: `${geral.excluidosDosTempos} chamado${geral.excluidosDosTempos > 1 ? 's resolvidos foram excluídos' : ' resolvido foi excluído'} dos cálculos de tempo e SLA por ter data de resolução ausente ou anterior à abertura. Veja a aba Qualidade dos dados.`,
    });
  }

  return insights;
}

// ---------- formatação compartilhada ----------

export function formatarPct(valor, casas = 0) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '–';
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas })}%`;
}

export function formatarHoras(horas) {
  if (horas === null || horas === undefined) return '–';
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 48) return `${horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
  return `${(horas / 24).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
}
