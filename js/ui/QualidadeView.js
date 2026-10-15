import { AuditoriaQualidade } from '../analytics/DataQuality.js';
import { formatarPct } from '../analytics/Metrics.js';
import { escapar, formatarData, formatarNumero, toast } from './dom.js';
import { paraCSV, baixarCSV } from '../utils/csv.js';

const LIMITE_REGISTROS = 50;

export class QualidadeView {
  constructor({ aoVerChamado, aoRestaurar }) {
    this.auditoria = new AuditoriaQualidade();
    this.resultado = null;
    this.kpis = document.getElementById('kpis-qualidade');
    this.tabelaRegras = document.getElementById('tabela-regras');
    this.tabelaRegistros = document.getElementById('tabela-registros');
    this.resumoRegistros = document.getElementById('resumo-registros');

    this.tabelaRegistros.addEventListener('click', (e) => {
      const botao = e.target.closest('button[data-ver]');
      if (botao) aoVerChamado(botao.dataset.ver);
    });

    document.getElementById('exportar-inconsistencias').addEventListener('click', () => {
      if (!this.resultado) return;
      const csv = paraCSV(this.resultado.registros, [
        { titulo: 'ID', valor: (r) => r.chamado.id },
        { titulo: 'Título', valor: (r) => r.chamado.titulo },
        { titulo: 'Unidade', valor: (r) => r.chamado.unidade },
        { titulo: 'E-mail do solicitante', valor: (r) => r.chamado.solicitanteEmail },
        { titulo: 'Categoria', valor: (r) => r.chamado.categoria },
        { titulo: 'Status', valor: (r) => r.chamado.status },
        { titulo: 'Aberto em', valor: (r) => r.chamado.abertoEm },
        { titulo: 'Resolvido em', valor: (r) => r.chamado.resolvidoEm },
        { titulo: 'Problemas', valor: (r) => r.problemas.map((p) => p.descricao).join(' | ') },
      ]);
      baixarCSV(`inconsistencias-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toast(`${formatarNumero(this.resultado.registros.length)} registros exportados para correção.`);
    });

    document.getElementById('restaurar-base').addEventListener('click', () => {
      if (!window.confirm('Substituir todos os chamados pela base de exemplo? As alterações feitas serão perdidas.')) return;
      aoRestaurar();
      toast('Base de exemplo restaurada.');
    });
  }

  render(chamados) {
    const r = this.auditoria.avaliar(chamados);
    this.resultado = r;
    const regrasAtivas = r.porRegra.filter((p) => p.quantidade > 0);
    const altaSeveridade = r.registros.filter((reg) => reg.problemas.some((p) => p.severidade === 'alta')).length;

    this.kpis.innerHTML = `
      <article class="card kpi"><p class="rotulo">Registros sem problema</p><p class="valor">${formatarPct(r.score, 1)}</p><p class="detalhe">${formatarNumero(r.total - r.comProblema)} de ${formatarNumero(r.total)} registros</p></article>
      <article class="card kpi"><p class="rotulo">Registros com problema</p><p class="valor">${formatarNumero(r.comProblema)}</p><p class="detalhe">${formatarNumero(regrasAtivas.length)} de ${r.porRegra.length} regras com ocorrências</p></article>
      <article class="card kpi"><p class="rotulo">Afetam os indicadores</p><p class="valor">${formatarNumero(altaSeveridade)}</p><p class="detalhe">registros com problema de severidade alta</p></article>
      <article class="card kpi"><p class="rotulo">Regras verificadas</p><p class="valor">${r.porRegra.length}</p><p class="detalhe">campos obrigatórios, formato, padronização, coerência e duplicidade</p></article>`;

    const maior = Math.max(...r.porRegra.map((p) => p.quantidade), 1);
    this.tabelaRegras.innerHTML = `
      <thead><tr><th>Regra</th><th>Severidade</th><th>Ocorrências</th><th class="num">% da base</th></tr></thead>
      <tbody>${r.porRegra.map((p) => `
        <tr>
          <td>${escapar(p.descricao)}</td>
          <td><span class="badge ${p.severidade === 'alta' ? 'fora' : 'atencao'}">${p.severidade === 'alta' ? 'Alta' : 'Média'}</span></td>
          <td><div class="barra-inline"><span class="num" style="min-width: 22px">${formatarNumero(p.quantidade)}</span><div class="trilho"><div class="preenchimento" style="width: ${(p.quantidade / maior) * 100}%"></div></div></div></td>
          <td class="num">${formatarPct(p.pct, 1)}</td>
        </tr>`).join('')}
      </tbody>`;

    const lista = r.registros.slice(0, LIMITE_REGISTROS);
    this.resumoRegistros.textContent = r.registros.length > LIMITE_REGISTROS
      ? `Mostrando ${LIMITE_REGISTROS} de ${r.registros.length}. Exporte o CSV para ver todos.`
      : `${formatarNumero(r.registros.length)} registros`;

    this.tabelaRegistros.innerHTML = lista.length
      ? `<thead><tr><th>ID</th><th>Chamado</th><th>Problemas encontrados</th><th>Aberto em</th><th>Resolvido em</th><th><span class="sr-only">Ações</span></th></tr></thead>
        <tbody>${lista.map(({ chamado: c, problemas }) => `
          <tr>
            <td class="num sub">${escapar(c.id)}</td>
            <td><div class="titulo-chamado">${escapar(c.titulo)}</div><div class="sub">${escapar(c.unidade) || '<em>sem unidade</em>'} · ${escapar(c.solicitanteEmail) || '<em>sem e-mail</em>'} · ${escapar(c.categoria)}</div></td>
            <td>${problemas.map((p) => `<span class="badge ${p.severidade === 'alta' ? 'fora' : 'atencao'}" style="margin: 2px 2px 2px 0">${escapar(p.descricao)}</span>`).join('')}</td>
            <td class="num">${formatarData(c.abertoEm)}</td>
            <td class="num">${formatarData(c.resolvidoEm)}</td>
            <td><button type="button" class="btn btn-sm" data-ver="${escapar(c.id)}">Ver</button></td>
          </tr>`).join('')}
        </tbody>`
      : '<tbody><tr><td class="muted" style="text-align:center; padding: 24px">Nenhum problema encontrado. Base 100% consistente.</td></tr></tbody>';

    return r;
  }
}
