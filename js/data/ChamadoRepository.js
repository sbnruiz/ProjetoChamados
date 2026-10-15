// Persistência dos chamados no localStorage.
// O storage é injetável para que a classe possa ser testada no Node com um armazenamento em memória.

import { Chamado } from '../models/Chamado.js';
import { gerarChamados } from './SeedGenerator.js';

const CHAVE_PADRAO = 'central-chamados:dados';

export class ChamadoRepository {
  constructor(storage = globalThis.localStorage, chave = CHAVE_PADRAO) {
    this.storage = storage;
    this.chave = chave;
  }

  listar() {
    const bruto = this.storage.getItem(this.chave);
    if (!bruto) {
      // Primeiro acesso: carrega a base de exemplo.
      return this.restaurarExemplo();
    }
    try {
      return JSON.parse(bruto).map(Chamado.fromJSON);
    } catch {
      // Conteúdo corrompido no storage: recomeça com a base de exemplo em vez de quebrar a tela.
      return this.restaurarExemplo();
    }
  }

  buscar(id) {
    return this.listar().find((c) => c.id === id) ?? null;
  }

  salvarTodos(chamados) {
    this.storage.setItem(this.chave, JSON.stringify(chamados));
  }

  criar(dados) {
    const chamado = new Chamado({ ...dados, id: this.proximoId(), status: 'Aberto', resolvidoEm: null });
    const erros = chamado.validar();
    if (erros.length) {
      const erro = new Error(erros.join(' '));
      erro.erros = erros;
      throw erro;
    }
    const todos = this.listar();
    todos.push(chamado);
    this.salvarTodos(todos);
    return chamado;
  }

  atualizarStatus(id, novoStatus, agora = new Date()) {
    const todos = this.listar();
    const chamado = todos.find((c) => c.id === id);
    if (!chamado) throw new Error(`Chamado ${id} não encontrado.`);
    chamado.atualizarStatus(novoStatus, agora);
    this.salvarTodos(todos);
    return chamado;
  }

  remover(id) {
    const todos = this.listar();
    const restantes = todos.filter((c) => c.id !== id);
    if (restantes.length === todos.length) return false;
    this.salvarTodos(restantes);
    return true;
  }

  restaurarExemplo(opcoes = {}) {
    const chamados = gerarChamados(opcoes).map(Chamado.fromJSON);
    this.salvarTodos(chamados);
    return chamados;
  }

  proximoId() {
    const bruto = this.storage.getItem(this.chave);
    const todos = bruto ? JSON.parse(bruto) : [];
    const maior = todos.reduce((max, c) => {
      const n = Number(String(c.id).replace(/\D/g, ''));
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    return `CH-${String(maior + 1).padStart(4, '0')}`;
  }
}

// Armazenamento em memória com a mesma interface do localStorage (usado nos testes).
export class MemoriaStorage {
  constructor() {
    this.dados = new Map();
  }
  getItem(chave) {
    return this.dados.has(chave) ? this.dados.get(chave) : null;
  }
  setItem(chave, valor) {
    this.dados.set(chave, String(valor));
  }
  removeItem(chave) {
    this.dados.delete(chave);
  }
}
