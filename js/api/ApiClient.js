// Cliente HTTP centralizado: monta a URL, envia o token, aplica timeout e
// transforma qualquer falha em um ApiError com mensagem pronta para o usuário.
// Trocar a API (por exemplo, do DummyJSON para um back-end próprio) exige mudar só a baseUrl.

export class ApiError extends Error {
  constructor(mensagem, status = 0, detalhes = null) {
    super(mensagem);
    this.name = 'ApiError';
    this.status = status;
    this.detalhes = detalhes;
  }
}

const MENSAGENS = {
  0: 'Não foi possível conectar ao servidor. Verifique sua conexão.',
  400: 'Os dados enviados são inválidos.',
  401: 'Usuário ou senha inválidos, ou a sessão expirou.',
  403: 'Você não tem permissão para esta ação.',
  404: 'Recurso não encontrado.',
  408: 'O servidor demorou demais para responder. Tente novamente.',
  500: 'Erro no servidor. Tente novamente em alguns minutos.',
};

export function mensagemPorStatus(status) {
  if (MENSAGENS[status]) return MENSAGENS[status];
  return status >= 500 ? MENSAGENS[500] : 'Ocorreu um erro inesperado.';
}

export class ApiClient {
  constructor(baseUrl, { obterToken = () => null, timeoutMs = 10000, fetchImpl = (...args) => fetch(...args) } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.obterToken = obterToken;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  async request(caminho, { method = 'GET', body, autenticar = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const token = autenticar ? this.obterToken() : null;
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let resposta;
    try {
      resposta = await this.fetchImpl(`${this.baseUrl}${caminho}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (erro) {
      const status = erro.name === 'AbortError' ? 408 : 0;
      throw new ApiError(mensagemPorStatus(status), status, erro);
    } finally {
      clearTimeout(timer);
    }

    // Nem toda resposta de erro vem em JSON; não deixamos o parse quebrar o fluxo.
    let dados = null;
    const texto = await resposta.text();
    if (texto) {
      try {
        dados = JSON.parse(texto);
      } catch {
        dados = { mensagemBruta: texto };
      }
    }

    if (!resposta.ok) {
      // Para 401 usamos sempre a mensagem padrão, em português; para os demais, a da API se houver.
      const mensagem = resposta.status === 401 ? mensagemPorStatus(401) : dados?.message || mensagemPorStatus(resposta.status);
      throw new ApiError(mensagem, resposta.status, dados);
    }
    return dados;
  }

  get(caminho, opcoes) {
    return this.request(caminho, { ...opcoes, method: 'GET' });
  }

  post(caminho, body, opcoes) {
    return this.request(caminho, { ...opcoes, method: 'POST', body });
  }
}
