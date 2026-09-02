// ===== AGENDAMENTO PÚBLICO — TAINARA NAILS =====
const API = '/api/public';

// Estado do fluxo
const state = {
  step: 1,
  professional: null,
  service: null,
  date: null,       // YYYY-MM-DD
  time: null,       // HH:MM
  client: { name: '', phone: '', notes: '' },
};

let allProfessionals = [];
let calView = new Date(); // mês exibido no calendário

// ---------- Utilitários ----------
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function initials(name) {
  if (!name) return '?';
  const p = name.trim().split(' ');
  return (p.length >= 2 ? p[0][0] + p[1][0] : p[0].slice(0,2)).toUpperCase();
}
function currency(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}
function formatDuration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h${String(m).padStart(2,'0')}`;
  if (h) return `${h}h`;
  return `${m}min`;
}
function formatDateBR(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}
function maskPhone(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2)  return d ? `(${d}` : '';
  if (d.length <= 6)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}
function toDateStr(dateObj) { return dateObj.toLocaleDateString('en-CA'); }

async function apiGet(path) {
  const r = await fetch(API + path);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Erro ao carregar');
  return j;
}
async function apiPost(path, data) {
  // Timeout de 15s: se o servidor não responder, aborta em vez de travar para sempre
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

// ---------- Navegação entre passos ----------
function goStep(n) {
  state.step = n;
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById('step-' + i);
    if (el) el.hidden = (i !== n);
  }
  document.getElementById('step-done').hidden = true;

  // Atualiza os indicadores de progresso
  document.querySelectorAll('.pub-step-dot').forEach(dot => {
    const s = Number(dot.dataset.step);
    dot.classList.toggle('active', s === n);
    dot.classList.toggle('done', s < n);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- PASSO 1: Profissionais ----------
async function loadProfessionals() {
  const list = document.getElementById('professionals-list');
  try {
    allProfessionals = await apiGet('/professionals');
    if (!allProfessionals.length) {
      list.innerHTML = `<div class="pub-slots-empty">Nenhuma profissional disponível no momento.</div>`;
      return;
    }
    list.innerHTML = allProfessionals.map(p => `
      <div class="pub-card">
        <div class="pub-card-avatar" style="background:${esc(p.color) || '#e91e8c'}">
          ${p.photo ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}" />` : initials(p.name)}
        </div>
        <div class="pub-card-info">
          <div class="pub-card-name">${esc(p.name)}</div>
          <div class="pub-card-actions">
            ${p.bio ? `<button class="pub-btn pub-btn-ghost" onclick="openBio(${p.id})"><i class="fa fa-circle-info"></i> Ver Bio</button>` : ''}
            <button class="pub-btn pub-btn-primary" onclick="selectProfessional(${p.id})">Selecionar</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = `<div class="pub-error">${esc(e.message)}</div>`;
  }
}

function selectProfessional(id) {
  state.professional = allProfessionals.find(p => p.id === id);
  state.service = null; state.date = null; state.time = null;
  document.getElementById('step2-subtitle').textContent = `Atendimento com ${state.professional.name}`;
  goStep(2);
  loadServices();
}

// ---------- Modal de biografia ----------
function openBio(id) {
  const p = allProfessionals.find(x => x.id === id);
  if (!p) return;
  const av = document.getElementById('bio-avatar');
  if (p.photo) {
    av.classList.add('has-photo');
    av.style.background = '';
    av.innerHTML = `<img src="${esc(p.photo)}" alt="${esc(p.name)}" />`;
  } else {
    av.classList.remove('has-photo');
    av.style.background = p.color || '#e91e8c';
    av.innerHTML = initials(p.name);
  }
  document.getElementById('bio-name').textContent = p.name;
  document.getElementById('bio-text').textContent = p.bio || 'Sem biografia cadastrada.';
  document.getElementById('bio-select-btn').onclick = () => { closeBio(); selectProfessional(id); };
  document.getElementById('bio-modal').hidden = false;
}
function closeBio(ev) {
  if (ev && ev.target !== document.getElementById('bio-modal')) return;
  document.getElementById('bio-modal').hidden = true;
}

// ---------- PASSO 2: Serviços ----------
async function loadServices() {
  const list = document.getElementById('services-list');
  list.innerHTML = `<div class="pub-loading"><i class="fa fa-spinner fa-spin"></i> Carregando...</div>`;
  try {
    const services = await apiGet('/services?professional_id=' + state.professional.id);
    if (!services.length) {
      list.innerHTML = `<div class="pub-slots-empty">Nenhum serviço disponível.</div>`;
      return;
    }
    list.innerHTML = services.map(s => `
      <button class="pub-service" onclick='selectService(${JSON.stringify(s).replace(/'/g, "&#39;")})'>
        <div>
          <div class="pub-service-name">${esc(s.name)}</div>
          ${s.description ? `<div class="pub-service-desc">${esc(s.description)}</div>` : ''}
        </div>
        <div class="pub-service-meta">
          <div class="pub-service-price">${currency(s.price)}</div>
          <div class="pub-service-dur"><i class="fa fa-clock"></i> ${formatDuration(s.duration)}</div>
        </div>
      </button>
    `).join('');
  } catch (e) {
    list.innerHTML = `<div class="pub-error">${esc(e.message)}</div>`;
  }
}

function selectService(s) {
  state.service = s;
  state.date = null; state.time = null;
  document.getElementById('step3-subtitle').textContent = `${s.name} · ${formatDuration(s.duration)} · ${currency(s.price)}`;
  goStep(3);
  calView = new Date();
  renderCalendar();
  document.getElementById('slots-area').hidden = true;
}

// ---------- PASSO 3: Calendário + horários ----------
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function renderCalendar() {
  const year = calView.getFullYear();
  const month = calView.getMonth();
  document.getElementById('cal-month').textContent = `${MONTHS[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay(); // 0=Dom
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = toDateStr(new Date());

  const grid = document.getElementById('cal-grid');
  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += `<div class="pub-cal-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const dateStr = toDateStr(dateObj);
    const isPast = dateStr < todayStr;
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === state.date;
    const cls = ['pub-cal-day'];
    if (isPast) cls.push('disabled');
    else cls.push('selectable');
    if (isToday) cls.push('today');
    if (isSelected) cls.push('selected');
    const onclick = isPast ? '' : `onclick="selectDate('${dateStr}')"`;
    cells += `<div class="${cls.join(' ')}" ${onclick}>${d}</div>`;
  }
  grid.innerHTML = cells;

  // Limita navegação: não deixa voltar para meses totalmente no passado
  const now = new Date();
  const prevBtn = document.getElementById('cal-prev');
  const atCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  prevBtn.disabled = atCurrentMonth;
  prevBtn.style.opacity = atCurrentMonth ? '0.35' : '1';
}

function calNav(dir) {
  const now = new Date();
  const candidate = new Date(calView.getFullYear(), calView.getMonth() + dir, 1);
  // Não navega para antes do mês atual
  if (candidate.getFullYear() < now.getFullYear() ||
     (candidate.getFullYear() === now.getFullYear() && candidate.getMonth() < now.getMonth())) return;
  calView = candidate;
  renderCalendar();
}

async function selectDate(dateStr) {
  state.date = dateStr;
  state.time = null;
  renderCalendar();

  const area = document.getElementById('slots-area');
  const list = document.getElementById('slots-list');
  area.hidden = false;
  document.getElementById('slots-title').textContent = `Horários para ${formatDateBR(dateStr)}`;
  list.innerHTML = `<div class="pub-loading" style="grid-column:1/-1"><i class="fa fa-spinner fa-spin"></i> Buscando horários...</div>`;

  try {
    const q = `?date=${dateStr}&professional_id=${state.professional.id}&service_id=${state.service.id}`;
    const data = await apiGet('/available-slots' + q);
    if (!data.slots.length) {
      const hoje = toDateStr(new Date());
      const msg = dateStr === hoje
        ? 'Os horários de hoje já se encerraram para este serviço. Por favor, escolha uma próxima data. 🌸'
        : 'Não há horários livres neste dia. Que tal tentar outra data?';
      list.innerHTML = `<div class="pub-slots-empty">${msg}</div>`;
      return;
    }
    list.innerHTML = data.slots.map(t =>
      `<button class="pub-slot" onclick="selectTime('${t}', this)">${t}</button>`
    ).join('');
  } catch (e) {
    list.innerHTML = `<div class="pub-error" style="grid-column:1/-1">${esc(e.message)}</div>`;
  }
}

function selectTime(t, el) {
  state.time = t;
  document.querySelectorAll('.pub-slot').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  // Pequeno delay para o usuário ver a seleção antes de avançar
  setTimeout(() => goStep(4), 250);
}

// ---------- PASSO 4: Dados do cliente ----------
document.getElementById('cli-phone').addEventListener('input', (e) => {
  e.target.value = maskPhone(e.target.value);
});

document.getElementById('client-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const err = document.getElementById('form-error');
  err.hidden = true;
  const name = document.getElementById('cli-name').value.trim();
  const phone = document.getElementById('cli-phone').value.trim();
  const notes = document.getElementById('cli-notes').value.trim();
  const digits = phone.replace(/\D/g, '');

  if (name.length < 2) { err.textContent = 'Por favor, informe seu nome completo.'; err.hidden = false; return; }
  if (digits.length < 10 || digits.length > 11) { err.textContent = 'Informe um WhatsApp/telefone válido com DDD.'; err.hidden = false; return; }

  state.client = { name, phone: digits, notes };
  renderSummary();
  goStep(5);
});

// ---------- PASSO 5: Resumo e confirmação ----------
function renderSummary() {
  const s = state;
  document.getElementById('summary').innerHTML = `
    <div class="pub-sum-row">
      <span class="pub-sum-label"><i class="fa fa-user"></i> Profissional</span>
      <span class="pub-sum-value">${esc(s.professional.name)}</span>
    </div>
    <div class="pub-sum-row">
      <span class="pub-sum-label"><i class="fa fa-paintbrush"></i> Serviço</span>
      <span class="pub-sum-value">${esc(s.service.name)}</span>
    </div>
    <div class="pub-sum-row">
      <span class="pub-sum-label"><i class="fa fa-calendar"></i> Data</span>
      <span class="pub-sum-value">${formatDateBR(s.date)}</span>
    </div>
    <div class="pub-sum-row">
      <span class="pub-sum-label"><i class="fa fa-clock"></i> Horário</span>
      <span class="pub-sum-value">${esc(s.time)} (${formatDuration(s.service.duration)})</span>
    </div>
    <div class="pub-sum-row">
      <span class="pub-sum-label"><i class="fa fa-id-card"></i> Nome</span>
      <span class="pub-sum-value">${esc(s.client.name)}</span>
    </div>
    <div class="pub-sum-row">
      <span class="pub-sum-label"><i class="fab fa-whatsapp"></i> Contato</span>
      <span class="pub-sum-value">${esc(maskPhone(s.client.phone))}</span>
    </div>
    <div class="pub-sum-row pub-sum-total">
      <span class="pub-sum-label">Valor</span>
      <span class="pub-sum-value">${currency(s.service.price)}</span>
    </div>
  `;
}

async function submitBooking() {
  const btn = document.getElementById('confirm-btn');
  const err = document.getElementById('confirm-error');
  err.hidden = true;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Confirmando...';

  try {
    const res = await apiPost('/appointments', {
      professional_id: state.professional.id,
      service_id: state.service.id,
      date: state.date,
      start_time: state.time,
      client_name: state.client.name,
      client_phone: state.client.phone,
      notes: state.client.notes || null
    });
    renderDone(res);
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
    // Se o horário foi ocupado, volta para o passo 3 para reescolher
    if (/ocupado|conflito|horário/i.test(e.message)) {
      setTimeout(() => { goStep(3); if (state.date) selectDate(state.date); }, 1800);
    }
  } finally {
    // Sempre reseta o botão — evita que ele fique preso em "Confirmando..." após sucesso ou erro
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-check"></i> Confirmar agendamento';
  }
}

function renderDone(res) {
  const s = state;
  document.getElementById('done-summary').innerHTML = `
    <div class="pub-sum-row">
      <span class="pub-sum-label"><i class="fa fa-user"></i> Profissional</span>
      <span class="pub-sum-value">${esc(s.professional.name)}</span>
    </div>
    <div class="pub-sum-row">
      <span class="pub-sum-label"><i class="fa fa-paintbrush"></i> Serviço</span>
      <span class="pub-sum-value">${esc(s.service.name)}</span>
    </div>
    <div class="pub-sum-row">
      <span class="pub-sum-label"><i class="fa fa-calendar"></i> Data e hora</span>
      <span class="pub-sum-value">${formatDateBR(s.date)} às ${esc(s.time)}</span>
    </div>
  `;
  for (let i = 1; i <= 5; i++) document.getElementById('step-' + i).hidden = true;
  document.getElementById('step-done').hidden = false;
  document.querySelectorAll('.pub-step-dot').forEach(d => { d.classList.add('done'); d.classList.remove('active'); });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function restart() {
  state.professional = null; state.service = null;
  state.date = null; state.time = null;
  state.client = { name: '', phone: '', notes: '' };
  document.getElementById('client-form').reset();
  // Reseta o botão de confirmar ao estado inicial (evita ficar preso em "Confirmando...")
  const btn = document.getElementById('confirm-btn');
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-check"></i> Confirmar agendamento'; }
  const cErr = document.getElementById('confirm-error');
  if (cErr) cErr.hidden = true;
  goStep(1);
}

// ---------- Init ----------
document.getElementById('cal-prev').addEventListener('click', () => calNav(-1));
document.getElementById('cal-next').addEventListener('click', () => calNav(1));
loadProfessionals();
