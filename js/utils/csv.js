// Leitura e escrita de CSV no padrão do Excel em português (separador ";").

export function escaparCampo(valor, separador = ';') {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  const precisaAspas = texto.includes(separador) || texto.includes('"') || texto.includes('\n') || texto.includes('\r');
  return precisaAspas ? `"${texto.replace(/"/g, '""')}"` : texto;
}

// colunas: [{ chave: 'id', titulo: 'ID' }, ...] ou [{ titulo, valor: (linha) => ... }]
export function paraCSV(linhas, colunas, separador = ';') {
  const cabecalho = colunas.map((c) => escaparCampo(c.titulo, separador)).join(separador);
  const corpo = linhas.map((linha) =>
    colunas
      .map((c) => escaparCampo(typeof c.valor === 'function' ? c.valor(linha) : linha[c.chave], separador))
      .join(separador),
  );
  return [cabecalho, ...corpo].join('\r\n');
}

// Parser que respeita campos entre aspas (com separador, aspas duplas e quebra de linha dentro).
export function lerCSV(texto, separador = ';') {
  const linhas = [];
  let linha = [];
  let campo = '';
  let entreAspas = false;
  const conteudo = texto.replace(/^﻿/, ''); // remove BOM

  for (let i = 0; i < conteudo.length; i++) {
    const ch = conteudo[i];
    if (entreAspas) {
      if (ch === '"') {
        if (conteudo[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreAspas = false;
        }
      } else {
        campo += ch;
      }
    } else if (ch === '"') {
      entreAspas = true;
    } else if (ch === separador) {
      linha.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && conteudo[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else {
      campo += ch;
    }
  }
  if (campo !== '' || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

// Dispara o download no navegador. O BOM faz o Excel abrir os acentos corretamente.
export function baixarCSV(nomeArquivo, conteudo) {
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
