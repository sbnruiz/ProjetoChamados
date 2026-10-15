// Utilidades de interface.

// Todo texto vindo do usuário ou da base passa por aqui antes de ir para o HTML (evita XSS).
export function escapar(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatarData(iso, { comHora = true } = {}) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleString('pt-BR', comHora
    ? { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatarNumero(n, casas = 0) {
  if (n === null || n === undefined) return '–';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas });
}

export function opcoes(lista, { vazio } = {}) {
  const itens = lista.map((v) => `<option value="${escapar(v)}">${escapar(v)}</option>`).join('');
  return vazio ? `<option value="">${escapar(vazio)}</option>${itens}` : itens;
}

let timerToast;
export function toast(mensagem) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = mensagem;
  el.hidden = false;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => (el.hidden = true), 3000);
}
