// ===== AUTH =====
let currentUser = null;

function getToken() { return localStorage.getItem('token'); }
function setToken(token) { localStorage.setItem('token', token); }
function clearToken() { localStorage.removeItem('token'); }

function setCurrentUser(user) {
  currentUser = user;
  document.getElementById('user-name-display').textContent = user.name;
  const roleLabels = { master: 'Administrador Mestre', admin: 'Administradora', professional: 'Profissional' };
  document.getElementById('user-role-display').textContent = roleLabels[user.role] || 'Usuário';
  applySidebarAvatar();

  const isAdminLevel = user.role === 'admin' || user.role === 'master';

  // Itens admin+master (gestão): visíveis para admin e master
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdminLevel ? '' : 'none';
  });

  // Itens exclusivos do master
  document.querySelectorAll('.master-only').forEach(el => {
    el.style.display = user.role === 'master' ? '' : 'none';
  });
}

// Mostra a foto de perfil no avatar da sidebar, ou as iniciais se não houver foto.
function applySidebarAvatar() {
  const el = document.getElementById('user-avatar');
  if (!el || !currentUser) return;
  const photo = currentUser.professional_photo;
  if (photo) {
    el.textContent = '';
    el.style.backgroundImage = `url("${photo}")`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
  } else {
    el.style.backgroundImage = '';
    el.textContent = getInitials(currentUser.name);
  }
}

function togglePassword() {
  const input = document.getElementById('login-password');
  const icon = document.getElementById('eye-icon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fa fa-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'fa fa-eye';
  }
}

async function initAuth() {
  const token = getToken();
  if (!token) {
    showLoginPage();
    return;
  }
  try {
    const user = await api.me();
    setCurrentUser(user);
    showApp();
  } catch (e) {
    clearToken();
    showLoginPage();
  }
}

function showLoginPage() {
  document.getElementById('login-page').style.display = '';
  document.getElementById('app').style.display = 'none';

  // Reseta o formulário de login ao estado inicial (evita botão travado em "Entrando...")
  const btn = document.getElementById('login-btn');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<span>Entrar</span>';
  }
  const errEl = document.getElementById('login-error');
  if (errEl) errEl.style.display = 'none';
  const pwInput = document.getElementById('login-password');
  if (pwInput) pwInput.value = '';
}

function showApp() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app').style.display = '';
}

function logout() {
  clearToken();
  currentUser = null;
  showLoginPage();
  toast('Até logo!', 'info');
}

// Login form
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Entrando...';

  try {
    const { token, user } = await api.login(
      document.getElementById('login-email').value,
      document.getElementById('login-password').value
    );
    setToken(token);
    setCurrentUser(user);
    showApp();
    navigateTo('dashboard');
    toast(`Bem-vinda, ${user.name}!`, 'success');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = '';
    btn.disabled = false;
    btn.innerHTML = '<span>Entrar</span>';
  }
});
