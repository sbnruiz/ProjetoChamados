// Autenticação com token (JWT) usando a API pública de testes DummyJSON.
// Fluxo: POST /auth/login devolve um accessToken; ele é guardado e enviado
// no header Authorization das próximas requisições (GET /auth/me).

import { ApiClient, ApiError } from '../api/ApiClient.js';

const CHAVE_TOKEN = 'central-chamados:token';
const CHAVE_USUARIO = 'central-chamados:usuario';

export class AuthService {
  constructor({ storage = globalThis.localStorage, baseUrl = 'https://dummyjson.com', fetchImpl } = {}) {
    this.storage = storage;
    this.api = new ApiClient(baseUrl, { obterToken: () => this.token, ...(fetchImpl ? { fetchImpl } : {}) });
  }

  get token() {
    return this.storage.getItem(CHAVE_TOKEN);
  }

  get usuario() {
    const bruto = this.storage.getItem(CHAVE_USUARIO);
    return bruto ? JSON.parse(bruto) : null;
  }

  estaLogado() {
    return Boolean(this.token);
  }

  async login(username, password) {
    if (!username?.trim() || !password) {
      throw new Error('Preencha usuário e senha.');
    }
    let dados;
    try {
      dados = await this.api.post('/auth/login', { username: username.trim(), password, expiresInMins: 60 }, { autenticar: false });
    } catch (erro) {
      // O DummyJSON responde 400 "Invalid credentials"; mostramos a mensagem em português.
      if (erro instanceof ApiError && (erro.status === 400 || erro.status === 401)) {
        throw new ApiError('Usuário ou senha inválidos.', erro.status, erro.detalhes);
      }
      throw erro;
    }
    const token = dados?.accessToken ?? dados?.token; // versões antigas da API usavam "token"
    if (!token) throw new Error('A API não devolveu um token de acesso.');
    this.storage.setItem(CHAVE_TOKEN, token);
    this.salvarUsuario(dados);
    return this.usuario;
  }

  // Confirma no servidor que o token ainda é válido e atualiza os dados do usuário.
  async carregarUsuario() {
    const dados = await this.api.get('/auth/me');
    this.salvarUsuario(dados);
    return this.usuario;
  }

  salvarUsuario(dados) {
    const usuario = {
      id: dados.id,
      nome: [dados.firstName, dados.lastName].filter(Boolean).join(' ') || dados.username,
      username: dados.username,
      imagem: dados.image ?? null,
    };
    this.storage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
  }

  logout() {
    this.storage.removeItem(CHAVE_TOKEN);
    this.storage.removeItem(CHAVE_USUARIO);
  }
}
