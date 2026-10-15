import { AuthService } from '../auth/AuthService.js';

const auth = new AuthService();

if (auth.estaLogado()) {
  window.location.replace('app.html');
}

const form = document.getElementById('form-login');
const aviso = document.getElementById('aviso-login');
const botao = form.querySelector('button[type="submit"]');

function mostrarAviso(texto, tipo = 'erro') {
  aviso.textContent = texto;
  aviso.className = `aviso ${tipo}`;
  aviso.hidden = false;
}

// Redirecionado pelo painel quando o token expirou.
if (new URLSearchParams(window.location.search).get('expirou')) {
  mostrarAviso('Sua sessão expirou. Entre novamente.', 'info');
}

document.getElementById('preencher-teste').addEventListener('click', () => {
  form.username.value = 'emilys';
  form.password.value = 'emilyspass';
  form.username.focus();
});

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  aviso.hidden = true;
  botao.disabled = true;
  botao.textContent = 'Entrando...';
  try {
    await auth.login(form.username.value, form.password.value);
    window.location.replace('app.html');
  } catch (erro) {
    mostrarAviso(erro.message);
    botao.disabled = false;
    botao.textContent = 'Entrar';
  }
});
