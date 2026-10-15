// Camada fina sobre o Chart.js: lê as cores do CSS (funciona no tema claro e escuro),
// aplica um estilo único a todos os gráficos e evita gráficos duplicados ao redesenhar.

const instancias = new Map();

function cssVar(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

export function tema() {
  return {
    texto: cssVar('--text-primary'),
    secundario: cssVar('--text-secondary'),
    muted: cssVar('--text-muted'),
    grid: cssVar('--grid'),
    eixo: cssVar('--axis'),
    superficie: cssVar('--surface-1'),
    serie1: cssVar('--series-1'),
    serie2: cssVar('--series-2'),
  };
}

export function chartDisponivel() {
  return typeof window.Chart === 'function';
}

export function desenhar(idCanvas, config) {
  instancias.get(idCanvas)?.destroy();
  const canvas = document.getElementById(idCanvas);
  if (!canvas) return null;
  if (!chartDisponivel()) {
    canvas.replaceWith(Object.assign(document.createElement('p'), {
      className: 'muted',
      textContent: 'Não foi possível carregar a biblioteca de gráficos. Verifique a conexão.',
    }));
    return null;
  }
  const grafico = new window.Chart(canvas, config);
  instancias.set(idCanvas, grafico);
  return grafico;
}

function tooltipBase(t) {
  return {
    backgroundColor: t.texto,
    titleColor: t.superficie,
    bodyColor: t.superficie,
    padding: 10,
    cornerRadius: 6,
    boxPadding: 4,
    usePointStyle: true,
  };
}

// Plugin: escreve o valor na ponta de cada barra (barras horizontais).
const rotuloNaPonta = {
  id: 'rotuloNaPonta',
  afterDatasetsDraw(chart, _args, opcoes) {
    if (!opcoes?.ativo) return;
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    ctx.save();
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = opcoes.cor;
    ctx.textBaseline = 'middle';
    meta.data.forEach((barra, i) => {
      const valor = chart.data.datasets[0].data[i];
      if (valor === null || valor === undefined) return;
      const texto = opcoes.formatar(valor, i);
      if (chart.options.indexAxis === 'y') {
        // Fundo da cor da superfície para o rótulo não se misturar com a linha de referência.
        const largura = ctx.measureText(texto).width;
        ctx.fillStyle = opcoes.fundo;
        ctx.fillRect(barra.x + 3, barra.y - 8, largura + 6, 16);
        ctx.fillStyle = opcoes.cor;
        ctx.textAlign = 'left';
        ctx.fillText(texto, barra.x + 6, barra.y);
      } else {
        ctx.textAlign = 'center';
        ctx.fillText(texto, barra.x, barra.y - 10);
      }
    });
    ctx.restore();
  },
};

// Plugin: linha vertical tracejada de referência (ex.: média geral).
const linhaReferencia = {
  id: 'linhaReferencia',
  afterDatasetsDraw(chart, _args, opcoes) {
    if (opcoes?.valor === null || opcoes?.valor === undefined) return;
    const { ctx, chartArea, scales } = chart;
    const x = scales.x.getPixelForValue(opcoes.valor);
    ctx.save();
    ctx.strokeStyle = opcoes.cor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = opcoes.cor;
    ctx.textAlign = 'center';
    ctx.fillText(opcoes.rotulo, x, chartArea.top - 6);
    ctx.restore();
  },
};

export function graficoLinhas(idCanvas, { rotulos, series }) {
  const t = tema();
  const cores = [t.serie1, t.serie2];
  return desenhar(idCanvas, {
    type: 'line',
    data: {
      labels: rotulos,
      datasets: series.map((s, i) => ({
        label: s.nome,
        data: s.valores,
        borderColor: cores[i],
        backgroundColor: cores[i],
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBorderColor: t.superficie,
        pointBorderWidth: 1.5,
        tension: 0,
        borderDash: s.tracejado ? [5, 4] : undefined,
      })),
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { align: 'start', labels: { color: t.secundario, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8 } },
        tooltip: tooltipBase(t),
      },
      scales: {
        x: { grid: { display: false }, border: { color: t.eixo }, ticks: { color: t.muted } },
        y: { beginAtZero: true, grid: { color: t.grid }, border: { display: false }, ticks: { color: t.muted, precision: 0 } },
      },
    },
  });
}

export function graficoBarras(idCanvas, { rotulos, valores, horizontal = false, maximo, formatar = String, referencia, nomeSerie = '' }) {
  const t = tema();
  const eixoValor = horizontal ? 'x' : 'y';
  const eixoCategoria = horizontal ? 'y' : 'x';
  return desenhar(idCanvas, {
    type: 'bar',
    data: {
      labels: rotulos,
      datasets: [{
        label: nomeSerie,
        data: valores,
        backgroundColor: t.serie1,
        hoverBackgroundColor: t.serie1,
        borderRadius: 4,
        borderSkipped: 'start',
        maxBarThickness: horizontal ? 18 : 42,
      }],
    },
    plugins: [linhaReferencia, rotuloNaPonta], // a linha é desenhada antes, o rótulo fica por cima
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      maintainAspectRatio: false,
      layout: { padding: { right: horizontal ? 44 : 0, top: referencia ? 16 : horizontal ? 0 : 18 } },
      plugins: {
        legend: { display: false },
        tooltip: { ...tooltipBase(t), callbacks: { label: (ctx) => ` ${formatar(ctx.raw, ctx.dataIndex)}` } },
        rotuloNaPonta: { ativo: true, cor: t.secundario, fundo: t.superficie, formatar },
        linhaReferencia: referencia ? { valor: referencia.valor, rotulo: referencia.rotulo, cor: t.secundario } : {},
      },
      scales: {
        [eixoValor]: {
          beginAtZero: true,
          max: maximo,
          grid: { color: t.grid },
          border: { display: false },
          ticks: { color: t.muted, precision: 0, callback: horizontal && maximo === 100 ? (v) => `${v}%` : undefined },
        },
        [eixoCategoria]: { grid: { display: false }, border: { color: t.eixo }, ticks: { color: t.secundario } },
      },
    },
  });
}

// Redesenha os gráficos quando o sistema troca entre tema claro e escuro.
export function aoTrocarTema(callback) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', callback);
}
