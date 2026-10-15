import { AuthService } from '../auth/AuthService.js';
import { ApiError } from '../api/ApiClient.js';
import { ChamadoRepository } from '../data/ChamadoRepository.js';
import { IndicadoresView } from '../ui/IndicadoresView.js';
import { ChamadosView } from '../ui/ChamadosView.js';
import { QualidadeView } from '../ui/QualidadeView.js';
import { aoTrocarTema } from '../ui/charts.js';
import { formatarNumero } from '../ui/dom.js';

// ---------- proteção de rota ----------
const auth = new AuthService();
if (!auth.estaLogado()) {
  window.location.replace('index.html');
  throw new Error('Não autenticado.'); // interrompe o carregamento do módulo
}

const repo = new ChamadoRepository();
const estado = { dias: 90, aba: 'indicadores', chamados: [] };

// ---------- cabeçalho / usuário ----------
function mostrarUsuario(usuario) {
  if (!usuario) return;
  document.getElementById('nome-usuario').textContent = usuario.nome;
  document.getElementById('avatar').textContent = usuario.nome
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

mostrarUsuario(auth.usuario);

// Valida o token no servidor sem travar a tela.
auth.carregarUsuario()
  .then(mostrarUsuario)
  .catch((erro) => {
    if (erro instanceof ApiError && erro.status === 401) {
      auth.logout();
      window.location.replace('index.html?expirou=1');
      return;
    }
    const aviso = document.getElementById('aviso-conexao');
    aviso.textContent = `Não foi possível validar a sessão agora (${erro.message}) Os dados locais continuam disponíveis.`;
    aviso.hidden = false;
  });

document.getElementById('sair').addEventListener('click', () => {
  auth.logout();
  window.location.replace('index.html');
});

// ---------- views ----------
const indicadores = new IndicadoresView();
const qualidade = new QualidadeView({
  aoVerChamado: (id) => {
    trocarAba('chamados');
    chamadosView.buscarPor(id);
  },
  aoRestaurar: () => {
    repo.restaurarExemplo();
    recarregar();
  },
});
const chamadosView = new ChamadosView({ repositorio: repo, aoAlterar: () => recarregar() });

function renderAbaAtual() {
  if (estado.aba === 'indicadores') indicadores.render(estado.chamados, estado.dias);
}

function recarregar() {
  estado.chamados = repo.listar();
  const resultadoQualidade = qualidade.render(estado.chamados);
  chamadosView.render(estado.chamados);
  renderAbaAtual();

  const backlog = estado.chamados.filter((c) => !c.resolvido).length;
  document.getElementById('contador-backlog').textContent = formatarNumero(backlog);
  document.getElementById('contador-qualidade').textContent = formatarNumero(resultadoQualidade.comProblema);
}

// ---------- abas (com #hash na URL, para links diretos) ----------
const ABAS = ['indicadores', 'chamados', 'qualidade'];

function trocarAba(aba) {
  estado.aba = ABAS.includes(aba) ? aba : 'indicadores';
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.aba === estado.aba)));
  ABAS.forEach((a) => (document.getElementById(`aba-${a}`).hidden = a !== estado.aba));
  if (window.location.hash !== `#${estado.aba}`) history.replaceState(null, '', `#${estado.aba}`);
  // Gráficos só são desenhados com a aba visível (o Chart.js precisa do tamanho real do canvas).
  renderAbaAtual();
}

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => trocarAba(t.dataset.aba)));
window.addEventListener('hashchange', () => trocarAba(window.location.hash.slice(1)));

// ---------- filtro de período ----------
document.querySelectorAll('[data-dias]').forEach((botao) => {
  botao.addEventListener('click', () => {
    estado.dias = Number(botao.dataset.dias);
    document.querySelectorAll('[data-dias]').forEach((b) => b.setAttribute('aria-pressed', String(b === botao)));
    renderAbaAtual();
  });
});

aoTrocarTema(renderAbaAtual);

// ---------- início ----------
recarregar();
trocarAba(window.location.hash.slice(1) || 'indicadores');
