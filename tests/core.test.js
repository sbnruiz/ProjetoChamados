import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chamado } from '../js/models/Chamado.js';
import { ChamadoRepository, MemoriaStorage } from '../js/data/ChamadoRepository.js';
import { gerarChamados } from '../js/data/SeedGenerator.js';
import { paraCSV, lerCSV } from '../js/utils/csv.js';
import { ApiClient, ApiError } from '../js/api/ApiClient.js';
import { AuthService } from '../js/auth/AuthService.js';

// ---------- modelo ----------
test('Chamado valida campos do formulário', () => {
  const erros = new Chamado({ titulo: 'Oi', categoria: 'X', unidade: '', solicitanteEmail: 'sem-arroba' }).validar();
  assert.equal(erros.length, 4);
});

test('atualizarStatus mantém status e data de resolução coerentes', () => {
  const agora = new Date('2026-10-15T12:00:00Z');
  const c = new Chamado({ id: '1', abertoEm: '2026-10-15T10:00:00Z' });
  c.atualizarStatus('Resolvido', agora);
  assert.equal(c.resolvidoEm, agora.toISOString());
  assert.equal(c.tempoResolucaoHoras(), 2);
  c.atualizarStatus('Aberto');
  assert.equal(c.resolvidoEm, null);
  assert.throws(() => c.atualizarStatus('Cancelado'));
});

// ---------- gerador ----------
test('gerador é determinístico para a mesma semente', () => {
  const agora = new Date('2026-10-15T12:00:00Z');
  const a = gerarChamados({ semente: 7, agora });
  const b = gerarChamados({ semente: 7, agora });
  assert.deepEqual(a, b);
  assert.ok(a.length > 300);
});

// ---------- repositório ----------
test('repositório cria, atualiza e remove chamados', () => {
  const repo = new ChamadoRepository(new MemoriaStorage());
  repo.salvarTodos([]);
  const novo = repo.criar({ titulo: 'Erro no relatório', categoria: 'Relatórios', prioridade: 'Alta', unidade: 'Uberaba', solicitanteEmail: 'x@y.com' });
  assert.equal(novo.id, 'CH-0001');
  assert.equal(repo.atualizarStatus(novo.id, 'Resolvido').status, 'Resolvido');
  assert.equal(repo.remover(novo.id), true);
  assert.equal(repo.listar().length, 0);
});

test('repositório recusa chamado inválido', () => {
  const repo = new ChamadoRepository(new MemoriaStorage());
  repo.salvarTodos([]);
  assert.throws(() => repo.criar({ titulo: '' }), /título/);
});

test('repositório carrega a base de exemplo no primeiro acesso', () => {
  const repo = new ChamadoRepository(new MemoriaStorage());
  assert.ok(repo.listar().length > 0);
});

// ---------- CSV ----------
test('CSV faz ida e volta com acentos, aspas e separador no texto', () => {
  const linhas = [{ a: 'Relatório "mensal"', b: 'x;y' }, { a: 'linha\nquebrada', b: '' }];
  const csv = paraCSV(linhas, [{ chave: 'a', titulo: 'A' }, { chave: 'b', titulo: 'B' }]);
  assert.deepEqual(lerCSV(csv), [['A', 'B'], ['Relatório "mensal"', 'x;y'], ['linha\nquebrada', '']]);
});

// ---------- API e autenticação (fetch simulado, sem rede) ----------
function respostaFalsa(status, corpo) {
  return async () => ({ ok: status >= 200 && status < 300, status, text: async () => (corpo === undefined ? '' : JSON.stringify(corpo)) });
}

test('ApiClient envia o token e converte erros HTTP em ApiError', async () => {
  let headersEnviados;
  const api = new ApiClient('https://api.teste', {
    obterToken: () => 'abc',
    fetchImpl: async (_url, opts) => { headersEnviados = opts.headers; return respostaFalsa(200, { ok: 1 })(); },
  });
  assert.deepEqual(await api.get('/x'), { ok: 1 });
  assert.equal(headersEnviados.Authorization, 'Bearer abc');

  const api404 = new ApiClient('https://api.teste', { fetchImpl: respostaFalsa(404, { message: 'Not found' }) });
  await assert.rejects(api404.get('/x'), (e) => e instanceof ApiError && e.status === 404);
});

test('ApiClient trata falha de rede e resposta que não é JSON', async () => {
  const semRede = new ApiClient('https://api.teste', { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(semRede.get('/x'), (e) => e.status === 0 && /conectar/.test(e.message));

  const html = new ApiClient('https://api.teste', { fetchImpl: async () => ({ ok: false, status: 502, text: async () => '<html>Bad Gateway</html>' }) });
  await assert.rejects(html.get('/x'), (e) => e.status === 502 && /servidor/.test(e.message));
});

test('AuthService guarda o token no login e limpa no logout', async () => {
  const storage = new MemoriaStorage();
  const auth = new AuthService({
    storage,
    fetchImpl: respostaFalsa(200, { id: 1, username: 'emilys', firstName: 'Emily', lastName: 'Johnson', accessToken: 'tok123' }),
  });
  const usuario = await auth.login('emilys', 'emilyspass');
  assert.equal(auth.token, 'tok123');
  assert.equal(usuario.nome, 'Emily Johnson');
  auth.logout();
  assert.equal(auth.estaLogado(), false);
});

test('AuthService devolve mensagem em português para credenciais inválidas', async () => {
  const auth = new AuthService({ storage: new MemoriaStorage(), fetchImpl: respostaFalsa(400, { message: 'Invalid credentials' }) });
  await assert.rejects(auth.login('x', 'y'), /Usuário ou senha inválidos/);
});
