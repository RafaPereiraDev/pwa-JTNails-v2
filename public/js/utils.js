// ===== UTILITIES =====

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
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
    in_progress: 'fa-scissors',
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
  el.innerHTML = `<i class="fa ${icons[type] || icons.info}"></i> ${message}`;
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
  const d = new Date(date);
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
