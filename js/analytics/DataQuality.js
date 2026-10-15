// Auditoria de qualidade dos dados.
// Cada regra é uma classe com a mesma interface (`verificar`), então adicionar uma
// verificação nova é só criar uma classe e incluí-la na lista de regras.

import { CATEGORIAS, emailValido } from '../models/Chamado.js';

export class Regra {
  constructor(id, descricao, severidade = 'média') {
    this.id = id;
    this.descricao = descricao;
    this.severidade = severidade; // 'alta' afeta indicadores; 'média' afeta comunicação ou classificação
  }

  // Recebe o chamado e um contexto pré-calculado; retorna true quando há problema.
  // eslint-disable-next-line no-unused-vars
  verificar(chamado, contexto) {
    throw new Error('Implemente verificar() na subclasse.');
  }
}

export class CampoObrigatorio extends Regra {
  constructor(campo, descricao, severidade = 'média') {
    super(`obrigatorio-${campo}`, descricao, severidade);
    this.campo = campo;
  }
  verificar(chamado) {
    const valor = chamado[this.campo];
    return valor === null || valor === undefined || String(valor).trim() === '';
  }
}

export class EmailInvalido extends Regra {
  constructor() {
    super('email-invalido', 'E-mail do solicitante em formato inválido');
  }
  verificar(chamado) {
    const email = chamado.solicitanteEmail;
    return Boolean(email && email.trim()) && !emailValido(email);
  }
}

export class CategoriaForaDoPadrao extends Regra {
  constructor() {
    super('categoria-fora-padrao', 'Categoria fora da lista padrão', 'alta');
  }
  verificar(chamado) {
    const cat = chamado.categoria;
    return Boolean(cat && cat.trim()) && !CATEGORIAS.includes(cat);
  }
}

export class ResolvidoSemData extends Regra {
  constructor() {
    super('resolvido-sem-data', 'Resolvido sem data de resolução', 'alta');
  }
  verificar(chamado) {
    return chamado.status === 'Resolvido' && !chamado.resolvidoEm;
  }
}

export class DatasInconsistentes extends Regra {
  constructor() {
    super('datas-inconsistentes', 'Resolução registrada antes da abertura', 'alta');
  }
  verificar(chamado) {
    if (!chamado.resolvidoEm || !chamado.abertoEm) return false;
    return new Date(chamado.resolvidoEm) < new Date(chamado.abertoEm);
  }
}

// Mesmo título, solicitante e unidade abertos com menos de 1 hora de diferença.
// O primeiro registro é considerado o original; os seguintes são marcados.
export class PossivelDuplicado extends Regra {
  constructor(janelaMinutos = 60) {
    super('possivel-duplicado', 'Possível chamado duplicado', 'alta');
    this.janelaMs = janelaMinutos * 60 * 1000;
  }

  preparar(chamados) {
    const grupos = new Map();
    for (const c of chamados) {
      const chave = [c.titulo, c.solicitanteEmail, c.unidade].map((v) => String(v ?? '').trim().toLowerCase()).join('|');
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(c);
    }
    const duplicados = new Set();
    for (const lista of grupos.values()) {
      if (lista.length < 2) continue;
      lista.sort((a, b) => new Date(a.abertoEm) - new Date(b.abertoEm));
      for (let i = 1; i < lista.length; i++) {
        const diferenca = new Date(lista[i].abertoEm) - new Date(lista[i - 1].abertoEm);
        if (diferenca <= this.janelaMs) duplicados.add(lista[i].id);
      }
    }
    return duplicados;
  }

  verificar(chamado, contexto) {
    return contexto.duplicados.has(chamado.id);
  }
}

export function regrasPadrao() {
  return [
    new CampoObrigatorio('titulo', 'Título não informado', 'alta'),
    new CampoObrigatorio('unidade', 'Unidade não informada'),
    new CampoObrigatorio('solicitanteEmail', 'E-mail do solicitante não informado'),
    new EmailInvalido(),
    new CategoriaForaDoPadrao(),
    new ResolvidoSemData(),
    new DatasInconsistentes(),
    new PossivelDuplicado(),
  ];
}

export class AuditoriaQualidade {
  constructor(regras = regrasPadrao()) {
    this.regras = regras;
  }

  avaliar(chamados) {
    const duplicadoRegra = this.regras.find((r) => r instanceof PossivelDuplicado);
    const contexto = { duplicados: duplicadoRegra ? duplicadoRegra.preparar(chamados) : new Set() };

    const contagem = new Map(this.regras.map((r) => [r.id, 0]));
    const registros = [];

    for (const chamado of chamados) {
      const problemas = this.regras.filter((r) => r.verificar(chamado, contexto));
      if (problemas.length) {
        problemas.forEach((r) => contagem.set(r.id, contagem.get(r.id) + 1));
        registros.push({ chamado, problemas: problemas.map((r) => ({ id: r.id, descricao: r.descricao, severidade: r.severidade })) });
      }
    }

    const total = chamados.length;
    const comProblema = registros.length;
    return {
      total,
      comProblema,
      // Percentual de registros sem nenhum problema detectado.
      score: total ? ((total - comProblema) / total) * 100 : 100,
      porRegra: this.regras
        .map((r) => ({
          id: r.id,
          descricao: r.descricao,
          severidade: r.severidade,
          quantidade: contagem.get(r.id),
          pct: total ? (contagem.get(r.id) / total) * 100 : 0,
        }))
        .sort((a, b) => b.quantidade - a.quantidade),
      registros,
    };
  }
}
