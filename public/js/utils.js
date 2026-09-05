// ===== UTILITIES =====

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = String(dateStr).split('-');
  return `${d}/${m}/${y}`;
}

// Garante exibição HH:MM — remove segundos que o PostgreSQL inclui no cast ::text de TIME
function formatTime(t) {
  if (!t) return '';
  return String(t).slice(0, 5);
}

function formatDateTime(dateStr, timeStr) {
  return `${formatDate(dateStr)} ${timeStr || ''}`.trim();
}

function formatPhone(phone) {
  if (!phone) return '-';
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return phone;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

// Helpers de papel (role). currentUser é global (definido em auth.js)
function isMaster()     { return typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'master'; }
function isAdminLevel() { return typeof currentUser !== 'undefined' && currentUser && (currentUser.role === 'admin' || currentUser.role === 'master'); }

// Redimensiona uma imagem (File) para um quadrado max x max e retorna um data URL JPEG.
// Reduz o tamanho antes de enviar ao servidor (foto de perfil não precisa ser grande).
function resizeImageToDataURL(file, max = 400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('O arquivo selecionado não é uma imagem'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Recorte central em quadrado
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = max;
        canvas.height = max;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, side, side, 0, 0, max, max);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Não foi possível ler a imagem'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    reader.readAsDataURL(file);
  });
}

// Escapa HTML para prevenir XSS ao inserir dados do usuário via innerHTML.
// Use SEMPRE que interpolar texto vindo do banco/usuário em template de HTML.
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getStatusLabel(status) {
  const map = {
    scheduled: 'Agendado',
    confirmed: 'Confirmado',
    in_progress: 'Em atendimento',
    completed: 'Concluído',
    cancelled: 'Cancelado',
    no_show: 'Não compareceu'
  };
  return map[status] || status;
}

function getStatusIcon(status) {
  const map = {
    scheduled: 'fa-clock',
    confirmed: 'fa-check',
    in_progress: 'fa-paintbrush',
    completed: 'fa-check-circle',
    cancelled: 'fa-times-circle',
    no_show: 'fa-user-times'
  };
  return map[status] || 'fa-circle';
}

function getPaymentLabel(method) {
  const map = {
    pix: 'Pix',
    cash: 'Dinheiro',
    credit: 'Cartão de Crédito',
    debit: 'Cartão de Débito',
    other: 'Outro'
  };
  return map[method] || method || '-';
}

function statusBadge(status) {
  return `<span class="badge badge-${status}"><i class="fa ${getStatusIcon(status)}"></i> ${getStatusLabel(status)}</span>`;
}

function toast(message, type = 'success', duration = 3000) {
  const icons = {
    success: 'fa-check-circle',
    error: 'fa-times-circle',
    warning: 'fa-exclamation-circle',
    info: 'fa-info-circle'
  };
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  // Escapa a mensagem para evitar XSS; permite apenas o ícone controlado internamente
  el.innerHTML = `<i class="fa ${icons[type] || icons.info}"></i> <span></span>`;
  el.querySelector('span').textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

function loading(container, message = 'Carregando...') {
  if (typeof container === 'string') container = document.getElementById(container);
  if (container) {
    container.innerHTML = `<div class="loading"><i class="fa fa-spinner"></i><span style="margin-left:10px">${message}</span></div>`;
  }
}

function emptyState(message, icon = 'fa-inbox') {
  return `<div class="table-empty"><i class="fa ${icon}"></i><p>${message}</p></div>`;
}

function formatDateToInput(dateStr) {
  if (!dateStr) return '';
  return dateStr.split('T')[0];
}

function getTodayStr() {
  return new Date().toLocaleDateString('en-CA');
}

function getMonthStr(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return d.toISOString().slice(0, 7);
}

function getWeekRange(date) {
  // 'T12:00:00' evita que o fuso horário (UTC-3) empurre a data para o dia anterior
  const d = new Date(date + 'T12:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toLocaleDateString('en-CA'),
    end: sunday.toLocaleDateString('en-CA')
  };
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
}

function dayName(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { weekday: 'short' });
}

function monthName(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function longDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function generateTimeSlots(start = '07:00', end = '20:00', step = 30) {
  const slots = [];
  let [h, m] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  while (h < eh || (h === eh && m < em)) {
    slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    m += step;
    if (m >= 60) { h++; m -= 60; }
  }
  return slots;
}

function confirmDialog(message) {
  return new Promise(resolve => {
    openModal('Confirmar', `
      <p style="margin-bottom:20px">${message}</p>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="closeModal();resolve_confirm(false)">Cancelar</button>
        <button class="btn btn-danger" onclick="closeModal();resolve_confirm(true)">Confirmar</button>
      </div>
    `, 'modal-sm');
    window.resolve_confirm = resolve;
  });
}

function whatsappLink(phone, message) {
  const num = phone.replace(/\D/g, '');
  const br = num.startsWith('55') ? num : '55' + num;
  return `https://wa.me/${br}?text=${encodeURIComponent(message)}`;
}

// ===== RELIABILITY BADGE =====
const RELIABILITY_CONFIG = {
  good:       { label: 'Comparece sempre',       icon: 'fa-star',             color: '#16a34a', bg: '#dcfce7' },
  irregular:  { label: 'Às vezes falta',          icon: 'fa-exclamation',      color: '#d97706', bg: '#fef3c7' },
  unreliable: { label: 'Falta com frequência',    icon: 'fa-exclamation-triangle', color: '#dc2626', bg: '#fee2e2' },
  new:        { label: 'Cliente nova',             icon: 'fa-sparkles',         color: '#7c3aed', bg: '#ede9fe' },
};

function reliabilityBadge(reliability, showLabel = true) {
  const cfg = RELIABILITY_CONFIG[reliability] || RELIABILITY_CONFIG.new;
  const label = showLabel ? `<span style="margin-left:4px">${cfg.label}</span>` : '';
  return `<span class="reliability-badge" style="background:${cfg.bg};color:${cfg.color}" title="${cfg.label}">
    <i class="fa ${cfg.icon}"></i>${label}
  </span>`;
}

// ===== MÁSCARAS DE ENTRADA (padrão brasileiro) =====

/** Aplica máscara de telefone (XX) XXXXX-XXXX enquanto o usuário digita */
function maskPhone(value) {
  const d = (value || '').replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2)  return `(${d}`;
  if (d.length <= 6)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

/** Aplica máscara de CPF XXX.XXX.XXX-XX enquanto o usuário digita */
function maskCPF(value) {
  const d = (value || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3)  return d;
  if (d.length <= 6)  return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9)  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

/**
 * Liga a máscara de telefone a um input pelo id.
 * Formata o valor inicial e a cada digitação.
 */
function attachPhoneMask(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.value = maskPhone(el.value);
  el.addEventListener('input', () => {
    const pos = el.selectionStart;
    el.value = maskPhone(el.value);
    // mantém o cursor no fim quando digitando no final
    if (pos >= el.value.length - 1) el.setSelectionRange(el.value.length, el.value.length);
  });
}

/** Liga a máscara de CPF a um input pelo id. */
function attachCPFMask(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.value = maskCPF(el.value);
  el.addEventListener('input', () => { el.value = maskCPF(el.value); });
}
