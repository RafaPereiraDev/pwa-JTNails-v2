// ===== CONSULTA / CANCELAMENTO PÚBLICO — JULIANA & TAINARA ATELIER NAILS =====
// Autenticação da cliente por WhatsApp + senha (JWT salvo no navegador).
const API = '/api/public';

// Sessão compartilhada com a página de agendamento (mesma chave de localStorage)
const CLIENT_TOKEN_KEY = 'client_token';
function getClientToken() { try { return localStorage.getItem(CLIENT_TOKEN_KEY); } catch (_) { return null; } }
function setClientSession(token, client) {
  try {
    localStorage.setItem(CLIENT_TOKEN_KEY, token);
    if (client) localStorage.setItem('client_info', JSON.stringify(client));
  } catch (_) {}
}
function clearClientSession() {
  try { localStorage.removeItem(CLIENT_TOKEN_KEY); localStorage.removeItem('client_info'); } catch (_) {}
}
function getClientInfo() {
  try { return JSON.parse(localStorage.getItem('client_info') || 'null'); } catch (_) { return null; }
}

// Agendamento pendente de cancelamento (via modal)
let pendingApptId = null;
let pendingCard = null;
// Token do link seguro (?token=), usado quando a cliente não está logada
let pendingLinkToken = null;

// ---------- Utilitários ----------
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function currency(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}
function formatDateBR(str) {
  if (!str) return '';
  const [y, m, d] = String(str).split('-');
  return `${d}/${m}/${y}`;
}
function shortTime(t) { return String(t || '').slice(0, 5); }
function maskPhone(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2)  return d ? `(${d}` : '';
  if (d.length <= 6)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

const STATUS_LABEL = {
  scheduled:   { txt: 'Agendado',    cls: 'ok'   },
  confirmed:   { txt: 'Confirmado',  cls: 'ok'   },
  in_progress: { txt: 'Em atendimento', cls: 'warn' },
  completed:   { txt: 'Concluído',   cls: 'gray' },
  cancelled:   { txt: 'Cancelado',   cls: 'gray' },
  no_show:     { txt: 'Não compareceu', cls: 'gray' },
};

function authHeaders() {
  const t = getClientToken();
  return t ? { 'Authorization': 'Bearer ' + t } : {};
}
async function apiGet(path) {
  const r = await fetch(API + path, { headers: { ...authHeaders() } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) { handleSessionExpired(); throw new Error(j.error || 'Sessão expirada'); }
  if (!r.ok) throw new Error(j.error || 'Erro ao carregar');
  return j;
}
async function apiPost(path, data) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
      signal: controller.signal
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Erro na requisição');
    return j;
  } catch (e) {
    if (e.name === 'AbortError')
      throw new Error('A conexão demorou demais. Verifique sua internet e tente novamente.');
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

function handleSessionExpired() {
  clearClientSession();
  showLoggedOut();
  const err = document.getElementById('login-error');
  if (err) { err.textContent = 'Sua sessão expirou. Entre novamente.'; err.hidden = false; }
}

// ---------- Alternância login / sessão ----------
function showLoggedIn() {
  document.getElementById('login-form').hidden = true;
  const bar = document.getElementById('session-bar');
  const info = getClientInfo();
  document.getElementById('session-name').textContent =
    info && info.name ? info.name : 'Você';
  bar.hidden = false;
}
function showLoggedOut() {
  document.getElementById('login-form').hidden = false;
  document.getElementById('session-bar').hidden = true;
  const area = document.getElementById('result-area');
  area.hidden = true; area.innerHTML = '';
}

// ---------- Card de agendamento ----------
function apptCard(a) {
  const st = STATUS_LABEL[a.status] || { txt: a.status, cls: 'gray' };
  const cancelBtn = a.is_active
    ? `<button class="pub-btn pub-btn-outline pub-btn-block" style="border-color:#dc2626;color:#dc2626"
         onclick="askCancel(${a.id}, this)">
         <i class="fa fa-times"></i> Cancelar este agendamento
       </button>`
    : '';
  return `
    <div class="pub-appt-card ${a.is_active ? 'active' : ''}">
      <div class="pub-appt-head">
        <span class="pub-appt-service">${esc(a.service_name)}</span>
        <span class="pub-appt-badge ${st.cls}">${st.txt}</span>
      </div>
      <div class="pub-appt-meta">
        <div><i class="fa fa-calendar"></i> ${formatDateBR(a.date)} às ${shortTime(a.start_time)}</div>
        <div><i class="fa fa-user"></i> ${esc(a.professional_name)}</div>
        <div><i class="fa fa-tag"></i> ${currency(a.price)}</div>
      </div>
      ${cancelBtn}
    </div>`;
}

// ---------- Lista agendamentos da cliente logada ----------
async function loadAppointments() {
  const area = document.getElementById('result-area');
  area.hidden = false;
  area.innerHTML = `<div class="pub-loading"><i class="fa fa-spinner fa-spin"></i> Carregando...</div>`;

  try {
    const data = await apiGet('/my-appointments');
    const appts = data.appointments || [];

    if (!appts.length) {
      area.innerHTML = `<div class="pub-slots-empty">Você ainda não tem agendamentos. 🌸</div>`;
      return;
    }

    const active  = appts.filter(a => a.is_active);
    const history = appts.filter(a => !a.is_active);

    let html = '';
    if (active.length) {
      html += `<div class="pub-section-label">Agendamentos ativos</div>`;
      html += active.map(apptCard).join('');
    } else {
      html += `<div class="pub-slots-empty">Você não tem agendamentos ativos no momento.</div>`;
    }
    if (history.length) {
      html += `<div class="pub-section-label">Histórico</div>`;
      html += history.map(apptCard).join('');
    }
    area.innerHTML = html;
  } catch (e) {
    if (!getClientToken()) return; // sessão expirada já tratada
    area.innerHTML = `<div class="pub-error">${esc(e.message)}</div>`;
  }
}

// ---------- Modal de confirmação ----------
function askCancel(apptId, cardEl) {
  pendingApptId = apptId;
  pendingCard = cardEl ? cardEl.closest('.pub-appt-card') : null;
  document.getElementById('confirm-modal-error').hidden = true;
  const btn = document.getElementById('confirm-cancel-btn');
  btn.disabled = false;
  btn.innerHTML = '<i class="fa fa-check"></i> Sim, cancelar';
  document.getElementById('confirm-modal').hidden = false;
}

function closeModal() {
  document.getElementById('confirm-modal').hidden = true;
  pendingApptId = null;
  pendingCard = null;
  pendingLinkToken = null;
}

async function doCancel() {
  if (!pendingApptId && !pendingLinkToken) return;
  const btn = document.getElementById('confirm-cancel-btn');
  const err = document.getElementById('confirm-modal-error');
  err.hidden = true;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Cancelando...';

  try {
    const body = pendingLinkToken ? { token: pendingLinkToken } : { appointment_id: pendingApptId };
    const res = await apiPost('/cancel-appointment', body);
    document.getElementById('confirm-modal').hidden = true;

    if (pendingCard) {
      pendingCard.classList.remove('active');
      const badge = pendingCard.querySelector('.pub-appt-badge');
      if (badge) { badge.textContent = 'Cancelado'; badge.className = 'pub-appt-badge gray'; }
      const cBtn = pendingCard.querySelector('.pub-btn');
      if (cBtn) cBtn.remove();
    }

    const area = document.getElementById('result-area');
    area.hidden = false;
    const ok = document.createElement('div');
    ok.className = 'pub-appt-card';
    ok.style.borderLeftColor = '#16a34a';
    ok.innerHTML = `
      <div class="pub-appt-head"><span class="pub-appt-service" style="color:#15803d">
        <i class="fa fa-circle-check"></i> Agendamento cancelado</span></div>
      <div class="pub-appt-meta">${esc(res.service_name || '')} — ${formatDateBR(res.date)} às ${shortTime(res.start_time)} foi cancelado. O horário já está livre.</div>`;
    area.prepend(ok);

    pendingApptId = null;
    pendingCard = null;
    pendingLinkToken = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-check"></i> Sim, cancelar';
  }
}

// ---------- Init ----------
document.getElementById('login-phone').addEventListener('input', (e) => {
  e.target.value = maskPhone(e.target.value);
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('login-error');
  err.hidden = true;
  const digits = document.getElementById('login-phone').value.replace(/\D/g, '');
  const password = document.getElementById('login-password').value;
  if (digits.length < 10 || digits.length > 11) {
    err.textContent = 'Informe um WhatsApp/telefone válido com DDD.'; err.hidden = false; return;
  }
  if (!password) { err.textContent = 'Informe sua senha.'; err.hidden = false; return; }

  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Entrando...';
  try {
    const res = await apiPost('/client/login', { phone: digits, password });
    setClientSession(res.token, res.client);
    showLoggedIn();
    loadAppointments();
  } catch (e2) {
    err.textContent = e2.message; err.hidden = false;
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa fa-right-to-bracket"></i> Entrar';
  }
});

document.getElementById('logout-link').addEventListener('click', (e) => {
  e.preventDefault();
  clearClientSession();
  showLoggedOut();
  document.getElementById('login-phone').value = '';
  document.getElementById('login-password').value = '';
});

document.getElementById('confirm-cancel-btn').addEventListener('click', doCancel);
document.getElementById('confirm-close-btn').addEventListener('click', closeModal);
document.getElementById('confirm-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('confirm-modal')) closeModal();
});

// Se já houver sessão salva, entra direto e lista os agendamentos
(function initSession() {
  if (getClientToken()) {
    showLoggedIn();
    loadAppointments();
  } else {
    showLoggedOut();
  }

  // Link seguro de cancelamento (?token=) — funciona mesmo sem login
  const token = new URLSearchParams(window.location.search).get('token');
  if (token) {
    pendingLinkToken = token;
    document.getElementById('confirm-text').textContent =
      'Tem certeza que deseja cancelar este agendamento? Esta ação não pode ser desfeita.';
    document.getElementById('confirm-modal-error').hidden = true;
    const btn = document.getElementById('confirm-cancel-btn');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-check"></i> Sim, cancelar';
    document.getElementById('confirm-modal').hidden = false;
  }
})();

// ===== "Esqueci minha senha" =====
// Nao ha canal de auto-reset (SMS/e-mail) configurado; a redefinicao e feita pela
// profissional (que tem o botao "Redefinir senha e enviar por WhatsApp" no painel).
// O link informa a cliente como proceder, de forma clara.
(function () {
  const link = document.getElementById('forgot-password-link');
  if (!link) return;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    alert(
      'Redefinição de senha\n\n' +
      'Por segurança, a sua senha é redefinida pela profissional do salão.\n\n' +
      'Chame o salão pelo WhatsApp pedindo a redefinição. Você receberá uma nova senha ' +
      'em uma mensagem e poderá acessar normalmente.'
    );
  });
})();
