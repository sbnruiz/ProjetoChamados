import { CATEGORIAS, PRIORIDADES, STATUS, Chamado } from '../models/Chamado.js';
import { UNIDADES } from '../data/SeedGenerator.js';
import { formatarHoras } from '../analytics/Metrics.js';
import { escapar, formatarData, formatarNumero, opcoes, toast } from './dom.js';
import { paraCSV, baixarCSV } from '../utils/csv.js';

const POR_PAGINA = 25;

export const COLUNAS_CSV = [
  { chave: 'id', titulo: 'ID' },
  { chave: 'titulo', titulo: 'Título' },
  { chave: 'categoria', titulo: 'Categoria' },
  { chave: 'prioridade', titulo: 'Prioridade' },
  { chave: 'status', titulo: 'Status' },
  { chave: 'unidade', titulo: 'Unidade' },
  { chave: 'solicitanteEmail', titulo: 'E-mail do solicitante' },
  { chave: 'responsavel', titulo: 'Responsável' },
  { chave: 'abertoEm', titulo: 'Aberto em' },
  { chave: 'resolvidoEm', titulo: 'Resolvido em' },
  { titulo: 'Horas até resolução', valor: (c) => { const h = c.tempoResolucaoHoras(); return h === null ? '' : h.toFixed(2).replace('.', ','); } },
  { titulo: 'Dentro do SLA', valor: (c) => { const s = c.dentroDoSla(); return s === null ? '' : s ? 'Sim' : 'Não'; } },
];

function celulaTempo(c, agora) {
  if (c.resolvido) {
    const sla = c.dentroDoSla();
    if (sla === null) return '<span class="badge atencao">Dado inconsistente</span>';
    return `${formatarHoras(c.tempoResolucaoHoras())}<br><span class="badge ${sla ? 'ok' : 'fora'}">${sla ? 'No prazo' : 'Fora do prazo'}</span>`;
  }
  const idade = c.idadeHoras(agora);
  const estourado = idade !== null && c.slaHoras !== null && idade > c.slaHoras;
  return `<span class="sub">aberto há</span> ${formatarHoras(idade)}${estourado ? '<br><span class="badge fora">Prazo estourado</span>' : ''}`;
}

export class ChamadosView {
  constructor({ repositorio, aoAlterar }) {
    this.repo = repositorio;
    this.aoAlterar = aoAlterar;
    this.limite = POR_PAGINA;
    this.chamados = [];

    this.tabela = document.getElementById('tabela-chamados');
    this.resumo = document.getElementById('resumo-lista');
    this.busca = document.getElementById('busca');
    this.filtroStatus = document.getElementById('filtro-status');
    this.filtroCategoria = document.getElementById('filtro-categoria');
    this.filtroPrioridade = document.getElementById('filtro-prioridade');
    this.botaoMais = document.getElementById('mostrar-mais');
    this.cardForm = document.getElementById('card-form');
    this.form = document.getElementById('form-chamado');
    this.errosForm = document.getElementById('erros-form');

    this.filtroStatus.innerHTML = opcoes(STATUS, { vazio: 'Todos os status' });
    this.filtroCategoria.innerHTML = opcoes(CATEGORIAS, { vazio: 'Todas as categorias' });
    this.filtroPrioridade.innerHTML = opcoes(PRIORIDADES, { vazio: 'Todas as prioridades' });
    this.form.categoria.innerHTML = opcoes(CATEGORIAS, { vazio: 'Selecione' });
    this.form.prioridade.innerHTML = opcoes(PRIORIDADES);
    this.form.prioridade.value = 'Média';
    this.form.unidade.innerHTML = opcoes(UNIDADES, { vazio: 'Selecione' });

    this.ligarEventos();
  }

  ligarEventos() {
    const refiltrar = () => { this.limite = POR_PAGINA; this.renderTabela(); };
    this.busca.addEventListener('input', refiltrar);
    [this.filtroStatus, this.filtroCategoria, this.filtroPrioridade].forEach((s) => s.addEventListener('change', refiltrar));

    this.botaoMais.addEventListener('click', () => { this.limite += POR_PAGINA; this.renderTabela(); });

    document.getElementById('abrir-form').addEventListener('click', () => {
      this.cardForm.hidden = false;
      this.form.titulo.focus();
    });
    document.getElementById('cancelar-form').addEventListener('click', () => this.fecharForm());
    this.form.addEventListener('submit', (e) => { e.preventDefault(); this.criar(); });

    document.getElementById('exportar-chamados').addEventListener('click', () => {
      const filtrados = this.filtrar();
      baixarCSV(`chamados-${new Date().toISOString().slice(0, 10)}.csv`, paraCSV(filtrados, COLUNAS_CSV));
      toast(`${formatarNumero(filtrados.length)} chamados exportados.`);
    });

    // Delegação de eventos: um único listener para todas as linhas da tabela.
    this.tabela.addEventListener('change', (e) => {
      if (!e.target.matches('select.status-select')) return;
      const chamado = this.repo.atualizarStatus(e.target.dataset.id, e.target.value);
      toast(`${chamado.id} agora está "${chamado.status}".`);
      this.aoAlterar();
    });
    this.tabela.addEventListener('click', (e) => {
      const botao = e.target.closest('button[data-excluir]');
      if (!botao) return;
      const id = botao.dataset.excluir;
      if (!window.confirm(`Excluir o chamado ${id}? Esta ação não pode ser desfeita.`)) return;
      this.repo.remover(id);
      toast(`${id} excluído.`);
      this.aoAlterar();
    });
  }

  fecharForm() {
    this.form.reset();
    this.form.prioridade.value = 'Média';
    this.errosForm.hidden = true;
    this.cardForm.hidden = true;
  }

  criar() {
    const dados = Object.fromEntries(new FormData(this.form));
    const erros = new Chamado(dados).validar();
    if (erros.length) {
      this.errosForm.innerHTML = erros.map((e) => `<li>${escapar(e)}</li>`).join('');
      this.errosForm.hidden = false;
      return;
    }
    const chamado = this.repo.criar({ ...dados, abertoEm: new Date().toISOString() });
    this.fecharForm();
    toast(`Chamado ${chamado.id} aberto.`);
    this.aoAlterar();
  }

  buscarPor(texto) {
    this.busca.value = texto;
    this.filtroStatus.value = '';
    this.filtroCategoria.value = '';
    this.filtroPrioridade.value = '';
    this.limite = POR_PAGINA;
    this.renderTabela();
  }

  render(chamados) {
    // Mais recentes primeiro.
    this.chamados = [...chamados].sort((a, b) => new Date(b.abertoEm) - new Date(a.abertoEm));
    this.renderTabela();
  }

  filtrar() {
    const termo = this.busca.value.trim().toLowerCase();
    const status = this.filtroStatus.value;
    const categoria = this.filtroCategoria.value;
    const prioridade = this.filtroPrioridade.value;
    return this.chamados.filter((c) =>
      (!status || c.status === status) &&
      (!categoria || c.categoria === categoria) &&
      (!prioridade || c.prioridade === prioridade) &&
      (!termo || [c.id, c.titulo, c.unidade, c.solicitanteEmail].some((v) => String(v ?? '').toLowerCase().includes(termo))),
    );
  }

  renderTabela() {
    const agora = new Date();
    const filtrados = this.filtrar();
    const visiveis = filtrados.slice(0, this.limite);
    const backlog = this.chamados.filter((c) => !c.resolvido).length;

    this.resumo.textContent = `${formatarNumero(this.chamados.length)} chamados na base, ${formatarNumero(backlog)} não resolvidos. Mostrando ${formatarNumero(visiveis.length)} de ${formatarNumero(filtrados.length)} filtrados.`;
    this.botaoMais.hidden = visiveis.length >= filtrados.length;

    if (!filtrados.length) {
      this.tabela.innerHTML = '<tbody><tr><td class="muted" style="text-align:center; padding: 24px">Nenhum chamado encontrado com esses filtros.</td></tr></tbody>';
      return;
    }

    this.tabela.innerHTML = `
      <thead><tr>
        <th>ID</th><th>Chamado</th><th>Categoria</th><th>Prioridade</th><th>Status</th><th>Aberto em</th><th>Tempo</th><th><span class="sr-only">Ações</span></th>
      </tr></thead>
      <tbody>${visiveis.map((c) => `
        <tr>
          <td class="num sub">${escapar(c.id)}</td>
          <td>
            <div class="titulo-chamado">${escapar(c.titulo) || '<span class="muted">(sem título)</span>'}</div>
            <div class="sub">${escapar(c.unidade) || 'Unidade não informada'} · ${escapar(c.solicitanteEmail) || 'sem e-mail'}</div>
          </td>
          <td>${escapar(c.categoria)}</td>
          <td>${escapar(c.prioridade)}</td>
          <td>
            <label class="sr-only" for="st-${escapar(c.id)}">Status de ${escapar(c.id)}</label>
            <select class="status-select" id="st-${escapar(c.id)}" data-id="${escapar(c.id)}">
              ${STATUS.map((s) => `<option ${s === c.status ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </td>
          <td class="num">${formatarData(c.abertoEm)}</td>
          <td>${celulaTempo(c, agora)}</td>
          <td><button type="button" class="btn btn-sm btn-ghost btn-danger" data-excluir="${escapar(c.id)}">Excluir</button></td>
        </tr>`).join('')}
      </tbody>`;
  }
}
