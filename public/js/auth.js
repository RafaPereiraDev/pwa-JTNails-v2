// ===== AUTH =====
let currentUser = null;

function getToken() { return localStorage.getItem('token'); }
function setToken(token) { localStorage.setItem('token', token); }
function clearToken() { localStorage.removeItem('token'); }

function setCurrentUser(user) {
  currentUser = user;
  document.getElementById('user-name-display').textContent = user.name;
  document.getElementById('user-role-display').textContent =
    user.role === 'admin' ? 'Administrador' : 'Profissional';
  document.getElementById('user-avatar').textContent = getInitials(user.name);

  // Show/hide admin-only items
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = user.role === 'admin' ? '' : 'none';
  });
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
