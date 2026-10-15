// Modelo de domínio de um chamado de suporte.
// As datas são guardadas como strings ISO 8601 para facilitar a serialização no localStorage e no CSV.

export const CATEGORIAS = ['Acesso e login', 'Cadastro', 'Financeiro', 'Estoque', 'Relatórios', 'Outros'];
export const PRIORIDADES = ['Baixa', 'Média', 'Alta', 'Crítica'];
export const STATUS = ['Aberto', 'Em andamento', 'Resolvido'];

// Prazo máximo de resolução (SLA), em horas corridas, por prioridade.
export const SLA_HORAS = { 'Crítica': 4, 'Alta': 8, 'Média': 24, 'Baixa': 72 };

const HORA_MS = 60 * 60 * 1000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailValido(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email.trim());
}

function dataValida(iso) {
  return Boolean(iso) && !Number.isNaN(new Date(iso).getTime());
}

export class Chamado {
  constructor({
    id,
    titulo = '',
    descricao = '',
    categoria = '',
    prioridade = 'Média',
    status = 'Aberto',
    unidade = '',
    solicitanteEmail = '',
    responsavel = '',
    abertoEm = new Date().toISOString(),
    resolvidoEm = null,
  }) {
    this.id = id;
    this.titulo = titulo;
    this.descricao = descricao;
    this.categoria = categoria;
    this.prioridade = prioridade;
    this.status = status;
    this.unidade = unidade;
    this.solicitanteEmail = solicitanteEmail;
    this.responsavel = responsavel;
    this.abertoEm = abertoEm;
    this.resolvidoEm = resolvidoEm;
  }

  static fromJSON(obj) {
    return new Chamado(obj);
  }

  toJSON() {
    return { ...this };
  }

  get resolvido() {
    return this.status === 'Resolvido';
  }

  get slaHoras() {
    return SLA_HORAS[this.prioridade] ?? null;
  }

  // Horas entre abertura e resolução. Retorna null quando o dado não é confiável
  // (chamado não resolvido, data ausente ou resolução anterior à abertura).
  tempoResolucaoHoras() {
    if (!this.resolvido || !dataValida(this.abertoEm) || !dataValida(this.resolvidoEm)) return null;
    const horas = (new Date(this.resolvidoEm) - new Date(this.abertoEm)) / HORA_MS;
    return horas >= 0 ? horas : null;
  }

  // true/false se resolvido com dados válidos; null quando não dá para afirmar.
  dentroDoSla() {
    const horas = this.tempoResolucaoHoras();
    if (horas === null || this.slaHoras === null) return null;
    return horas <= this.slaHoras;
  }

  // Há quanto tempo um chamado não resolvido está aberto.
  idadeHoras(agora = new Date()) {
    if (!dataValida(this.abertoEm)) return null;
    return Math.max(0, (agora - new Date(this.abertoEm)) / HORA_MS);
  }

  // Validação usada no formulário de abertura. Retorna a lista de erros (vazia = válido).
  validar() {
    const erros = [];
    if (!this.titulo || this.titulo.trim().length < 5) erros.push('O título precisa ter pelo menos 5 caracteres.');
    if (!CATEGORIAS.includes(this.categoria)) erros.push('Selecione uma categoria válida.');
    if (!PRIORIDADES.includes(this.prioridade)) erros.push('Selecione uma prioridade válida.');
    if (!this.unidade || !this.unidade.trim()) erros.push('Informe a unidade solicitante.');
    if (!emailValido(this.solicitanteEmail)) erros.push('Informe um e-mail válido para o solicitante.');
    return erros;
  }

  // Mantém a coerência entre status e data de resolução.
  atualizarStatus(novoStatus, agora = new Date()) {
    if (!STATUS.includes(novoStatus)) throw new Error(`Status inválido: ${novoStatus}`);
    this.status = novoStatus;
    if (novoStatus === 'Resolvido') {
      this.resolvidoEm = this.resolvidoEm ?? agora.toISOString();
    } else {
      this.resolvidoEm = null;
    }
    return this;
  }
}
