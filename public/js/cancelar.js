// ===== CONSULTA / CANCELAMENTO PÚBLICO — JULIANA & TAINARA ATELIER NAILS =====
const API = '/api/public';

// Token atualmente em processo de cancelamento (via modal)
let pendingToken = null;
let pendingCard = null;

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

async function apiGet(path) {
  const r = await fetch(API + path);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Erro ao carregar');
  return j;
}
async function apiPost(path, data) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

// ---------- Card de agendamento ----------
function apptCard(a) {
  const st = STATUS_LABEL[a.status] || { txt: a.status, cls: 'gray' };
  // Se o backend mandou cancel_token, é um agendamento ativo cancelável
  const cancelBtn = (a.is_active && a.cancel_token)
    ? `<button class="pub-btn pub-btn-outline pub-btn-block" style="border-color:#dc2626;color:#dc2626"
         onclick="askCancel('${esc(a.cancel_token)}', this)">
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

// ---------- Consulta por telefone ----------
async function lookup(phoneDigits) {
  const area = document.getElementById('result-area');
  area.hidden = false;
  area.innerHTML = `<div class="pub-loading"><i class="fa fa-spinner fa-spin"></i> Buscando...</div>`;

  try {
    const data = await apiGet('/my-appointments?phone=' + encodeURIComponent(phoneDigits));
    const appts = data.appointments || [];

    if (!appts.length) {
      area.innerHTML = `<div class="pub-slots-empty">Nenhum agendamento encontrado para este telefone. 🌸</div>`;
      return;
    }

    const active  = appts.filter(a => a.is_active);
    const history = appts.filter(a => !a.is_active);

    let html = '';
    if (data.client_name) html += `<p class="pub-subtitle">Olá, <strong>${esc(data.client_name)}</strong>!</p>`;

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
    area.innerHTML = `<div class="pub-error">${esc(e.message)}</div>`;
  }
}

// ---------- Modal de confirmação ----------
function askCancel(token, cardEl) {
  pendingToken = token;
  pendingCard = cardEl ? cardEl.closest('.pub-appt-card') : null;
  document.getElementById('confirm-modal-error').hidden = true;
  const btn = document.getElementById('confirm-cancel-btn');
  btn.disabled = false;
  btn.innerHTML = '<i class="fa fa-check"></i> Sim, cancelar';
  document.getElementById('confirm-modal').hidden = false;
}

function closeModal() {
  document.getElementById('confirm-modal').hidden = true;
  pendingToken = null;
  pendingCard = null;
}

async function doCancel() {
  if (!pendingToken) return;
  const btn = document.getElementById('confirm-cancel-btn');
  const err = document.getElementById('confirm-modal-error');
  err.hidden = true;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Cancelando...';

  try {
    const res = await apiPost('/cancel-appointment', { token: pendingToken });
    document.getElementById('confirm-modal').hidden = true;

    // Atualiza o card correspondente (se veio da lista)
    if (pendingCard) {
      pendingCard.classList.remove('active');
      const badge = pendingCard.querySelector('.pub-appt-badge');
      if (badge) { badge.textContent = 'Cancelado'; badge.className = 'pub-appt-badge gray'; }
      const cBtn = pendingCard.querySelector('.pub-btn');
      if (cBtn) cBtn.remove();
    }

    // Mensagem de sucesso no topo do resultado
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

    pendingToken = null;
    pendingCard = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-check"></i> Sim, cancelar';
  }
}

// ---------- Init ----------
document.getElementById('lookup-phone').addEventListener('input', (e) => {
  e.target.value = maskPhone(e.target.value);
});

document.getElementById('lookup-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const err = document.getElementById('lookup-error');
  err.hidden = true;
  const digits = document.getElementById('lookup-phone').value.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 11) {
    err.textContent = 'Informe um telefone válido com DDD.';
    err.hidden = false;
    return;
  }
  lookup(digits);
});

document.getElementById('confirm-cancel-btn').addEventListener('click', doCancel);
document.getElementById('confirm-close-btn').addEventListener('click', closeModal);
document.getElementById('confirm-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('confirm-modal')) closeModal();
});

// Se veio com ?token= na URL, abre direto o modal de confirmação
(function initFromToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    document.getElementById('confirm-text').textContent =
      'Tem certeza que deseja cancelar este agendamento? Esta ação não pode ser desfeita.';
    askCancel(token, null);
  }
})();
