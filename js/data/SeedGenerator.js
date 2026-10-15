// Gera uma base sintética de chamados para demonstração.
// Usa um gerador pseudoaleatório com semente fixa: a mesma semente sempre produz a mesma base,
// o que deixa os testes e as capturas de tela reproduzíveis.
// Cerca de 3% dos registros recebem problemas propositais (e-mail inválido, datas incoerentes,
// duplicidades etc.) para alimentar o módulo de qualidade de dados.

import { CATEGORIAS, PRIORIDADES } from '../models/Chamado.js';

export function criarRandom(semente = 42) {
  // mulberry32
  let a = semente >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const UNIDADES = [
  'Belo Horizonte', 'Contagem', 'Uberlândia', 'Juiz de Fora', 'Montes Claros', 'Ipatinga',
  'Divinópolis', 'Governador Valadares', 'Uberaba', 'Sete Lagoas', 'Poços de Caldas', 'Varginha',
];

const RESPONSAVEIS = ['Ana Lima', 'Bruno Rocha', 'Carla Mendes', 'Diego Alves', 'Elisa Prado'];

const NOMES = ['joao', 'maria', 'pedro', 'juliana', 'lucas', 'fernanda', 'rafael', 'camila', 'thiago', 'patricia', 'marcos', 'aline'];
const SOBRENOMES = ['silva', 'souza', 'oliveira', 'santos', 'pereira', 'costa', 'ferreira', 'almeida', 'ribeiro', 'gomes'];

const TITULOS = {
  'Acesso e login': ['Não consigo acessar o sistema', 'Senha expirada', 'Usuário bloqueado após tentativas', 'Solicitação de novo acesso', 'Erro de permissão no módulo'],
  'Cadastro': ['Associado duplicado na base', 'Erro ao salvar cadastro', 'Atualizar e-mail de contato', 'CNPJ não encontrado', 'Corrigir endereço da unidade'],
  'Financeiro': ['Boleto não gerado', 'Divergência no relatório de pagamentos', 'Baixa de pagamento não registrada', 'Erro ao emitir nota', 'Valor de mensalidade incorreto'],
  'Estoque': ['Saldo de estoque divergente', 'Produto sem código', 'Erro na entrada de mercadoria', 'Transferência entre unidades travada'],
  'Relatórios': ['Relatório mensal não carrega', 'Exportação para Excel com erro', 'Filtro de período não funciona', 'Indicador com valor zerado'],
  'Outros': ['Dúvida sobre funcionalidade', 'Sugestão de melhoria', 'Treinamento para nova equipe'],
};

// Pesos de distribuição (não precisam somar 100).
const PESO_CATEGORIA = { 'Acesso e login': 22, 'Cadastro': 25, 'Financeiro': 20, 'Estoque': 13, 'Relatórios': 12, 'Outros': 8 };
const PESO_PRIORIDADE = { 'Baixa': 30, 'Média': 40, 'Alta': 22, 'Crítica': 8 };

// Tempo base de resolução (horas) por prioridade e multiplicador por categoria.
// Financeiro é propositalmente mais lento: é o "achado" que o painel deve revelar.
const BASE_HORAS = { 'Crítica': 2.6, 'Alta': 5.5, 'Média': 15, 'Baixa': 38 };
const FATOR_CATEGORIA = { 'Acesso e login': 0.7, 'Cadastro': 1.0, 'Financeiro': 1.9, 'Estoque': 1.1, 'Relatórios': 1.2, 'Outros': 0.9 };

function escolherPonderado(random, pesos) {
  const total = Object.values(pesos).reduce((s, p) => s + p, 0);
  let r = random() * total;
  for (const [chave, peso] of Object.entries(pesos)) {
    r -= peso;
    if (r <= 0) return chave;
  }
  return Object.keys(pesos).at(-1);
}

function escolher(random, lista) {
  return lista[Math.floor(random() * lista.length)];
}

// Normal padrão via Box-Muller.
function normal(random) {
  const u = 1 - random();
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function dataDeAbertura(random, agora, dias) {
  // Mais chamados nas semanas recentes (tendência leve de alta) e em dias úteis, horário comercial.
  for (;;) {
    const diasAtras = Math.floor(dias * Math.pow(random(), 1.15));
    const d = new Date(agora);
    d.setDate(d.getDate() - diasAtras);
    const diaSemana = d.getDay();
    if ((diaSemana === 0 || diaSemana === 6) && random() > 0.15) continue;
    d.setHours(8 + Math.floor(random() * 10), Math.floor(random() * 60), 0, 0);
    if (d <= agora) return d;
  }
}

export function gerarChamados({ quantidade = 640, semente = 42, agora = new Date(), dias = 180 } = {}) {
  const random = criarRandom(semente);
  const chamados = [];

  for (let i = 0; i < quantidade; i++) {
    const categoria = escolherPonderado(random, PESO_CATEGORIA);
    const prioridade = escolherPonderado(random, PESO_PRIORIDADE);
    const abertura = dataDeAbertura(random, agora, dias);
    const horas = BASE_HORAS[prioridade] * FATOR_CATEGORIA[categoria] * Math.exp(normal(random) * 0.75);
    const previsaoResolucao = new Date(abertura.getTime() + horas * 3600 * 1000);

    let status;
    let resolvidoEm = null;
    if (previsaoResolucao <= agora) {
      status = 'Resolvido';
      resolvidoEm = previsaoResolucao.toISOString();
    } else {
      status = random() < 0.5 ? 'Aberto' : 'Em andamento';
    }

    const nome = escolher(random, NOMES);
    const sobrenome = escolher(random, SOBRENOMES);

    chamados.push({
      titulo: escolher(random, TITULOS[categoria]),
      descricao: '',
      categoria,
      prioridade,
      status,
      unidade: escolher(random, UNIDADES),
      solicitanteEmail: `${nome}.${sobrenome}@rede-exemplo.com.br`,
      responsavel: escolher(random, RESPONSAVEIS),
      abertoEm: abertura.toISOString(),
      resolvidoEm,
    });
  }

  // Ordena do mais antigo para o mais recente antes de numerar.
  chamados.sort((a, b) => new Date(a.abertoEm) - new Date(b.abertoEm));

  travarChamados(chamados, random, agora);
  injetarProblemas(chamados, random);

  return chamados.map((c, i) => ({ id: `CH-${String(i + 1).padStart(4, '0')}`, ...c }));
}

// Em toda operação real alguns chamados ficam parados esperando retorno de terceiros.
// Reabre alguns chamados de 8 a 40 dias atrás para que o backlog tenha "cauda".
function travarChamados(chamados, random, agora) {
  const candidatos = chamados.filter((c) => {
    const dias = (agora - new Date(c.abertoEm)) / (24 * 3600 * 1000);
    return dias >= 8 && dias <= 40 && c.prioridade !== 'Crítica';
  });
  for (let i = 0; i < 7 && candidatos.length; i++) {
    const [c] = candidatos.splice(Math.floor(random() * candidatos.length), 1);
    c.status = random() < 0.6 ? 'Em andamento' : 'Aberto';
    c.resolvidoEm = null;
  }
}

// Insere problemas típicos de bases reais, de forma controlada.
function injetarProblemas(chamados, random) {
  const n = chamados.length;
  const alvo = () => chamados[Math.floor(random() * n)];
  const resolvidoAleatorio = () => {
    for (let t = 0; t < 50; t++) {
      const c = alvo();
      if (c.status === 'Resolvido') return c;
    }
    return alvo();
  };

  // E-mails inválidos e vazios
  for (let i = 0; i < 5; i++) alvo().solicitanteEmail = escolher(random, ['joao.silva@', 'maria.souza.rede-exemplo.com.br', 'contato@rede', 'pedro costa@rede-exemplo.com.br']);
  for (let i = 0; i < 3; i++) alvo().solicitanteEmail = '';

  // Unidade não informada
  for (let i = 0; i < 2; i++) alvo().unidade = '';

  // Categoria digitada fora do padrão
  for (let i = 0; i < 3; i++) alvo().categoria = escolher(random, ['financeiro ', 'Finaceiro', 'cadastros', 'Acesso']);

  // Resolvido sem data de resolução
  for (let i = 0; i < 2; i++) resolvidoAleatorio().resolvidoEm = null;

  // Resolução registrada antes da abertura
  for (let i = 0; i < 2; i++) {
    const c = resolvidoAleatorio();
    if (c.resolvidoEm) {
      const abertura = new Date(c.abertoEm);
      c.resolvidoEm = new Date(abertura.getTime() - (1 + random() * 20) * 3600 * 1000).toISOString();
    }
  }

  // Possíveis duplicados: mesmo chamado aberto duas vezes poucos minutos depois
  for (let i = 0; i < 3; i++) {
    const original = alvo();
    const copia = { ...original, abertoEm: new Date(new Date(original.abertoEm).getTime() + 4 * 60 * 1000).toISOString() };
    chamados.push(copia);
  }
  chamados.sort((a, b) => new Date(a.abertoEm) - new Date(b.abertoEm));
}

export { UNIDADES, CATEGORIAS, PRIORIDADES };
