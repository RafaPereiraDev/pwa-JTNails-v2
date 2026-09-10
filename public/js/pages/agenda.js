// ===== AGENDA PAGE =====
let agendaView = 'week'; // day | week | month
let agendaDate = getTodayStr();
let agendaProfFilter = 'all';
let agendaProfessionals = [];
let agendaFilterInitialized = false; // define o filtro padrão só na primeira abertura

function getActiveAgendaProfId() {
  if (typeof agendaProfFilter !== 'undefined' && agendaProfFilter && agendaProfFilter !== 'all') {
    const id = parseInt(agendaProfFilter, 10);
    return isNaN(id) ? null : id;
  }
  return null;
}

async function loadAgenda() {
  const container = document.getElementById('page-agenda');

  try {
    agendaProfessionals = await api.getProfessionals(true);
  } catch (e) {
    agendaProfessionals = [];
  }

  // Na primeira abertura, se o usuário é uma profissional, já mostra a própria agenda.
  // O mestre (sem professional_id) continua vendo "Todas".
  if (!agendaFilterInitialized) {
    if (currentUser && currentUser.professional_id) {
      agendaProfFilter = String(currentUser.professional_id);
    }
    agendaFilterInitialized = true;
  }

  renderAgendaShell(container);
  await loadAgendaView();
}

function renderAgendaShell(container) {
  const profBtns = `
    <button class="prof-btn ${agendaProfFilter === 'all' ? 'active' : ''}" onclick="setAgendaProf('all')">
      Todas
    </button>
    ${agendaProfessionals.map(p => `
      <button class="prof-btn ${agendaProfFilter === String(p.id) ? 'active' : ''}"
        onclick="setAgendaProf('${p.id}')"
        style="${agendaProfFilter === String(p.id) ? `border-color:${p.color};color:${p.color}` : ''}">
        <span class="prof-dot" style="background:${p.color}"></span>
        ${esc(p.name)}
      </button>
    `).join('')}
  `;

  container.innerHTML = `
    <div class="page-header">
      <h2>Agenda</h2>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="openBlockTimeModal()">
          <i class="fa fa-ban"></i> Bloquear Horário
        </button>
        <button class="btn btn-primary" onclick="openNewAppointment(null, getActiveAgendaProfId())">
          <i class="fa fa-plus"></i> Novo Agendamento
        </button>
      </div>
    </div>

    <div class="agenda-toolbar">
      <div class="view-tabs">
        <button class="view-tab ${agendaView === 'day' ? 'active' : ''}" onclick="setAgendaView('day')">Dia</button>
        <button class="view-tab ${agendaView === 'week' ? 'active' : ''}" onclick="setAgendaView('week')">Semana</button>
        <button class="view-tab ${agendaView === 'month' ? 'active' : ''}" onclick="setAgendaView('month')">Mês</button>
      </div>
      <div class="agenda-nav">
        <button class="btn btn-secondary btn-sm btn-icon" onclick="agendaNavigate(-1)"><i class="fa fa-chevron-left"></i></button>
        <button class="btn btn-secondary btn-sm" onclick="agendaGoToday()">Hoje</button>
        <button class="btn btn-secondary btn-sm btn-icon" onclick="agendaNavigate(1)"><i class="fa fa-chevron-right"></i></button>
      </div>
      <div class="agenda-date-display" id="agenda-date-label"></div>
    </div>

    <div class="prof-filter mb-4">${profBtns}</div>

    <div id="agenda-view-container"></div>
  `;
}

function setAgendaView(view) {
  agendaView = view;
  loadAgenda();
}

function setAgendaProf(profId) {
  agendaProfFilter = profId;
  loadAgenda();
}

function agendaNavigate(dir) {
  if (agendaView === 'day') agendaDate = addDays(agendaDate, dir);
  else if (agendaView === 'week') agendaDate = addDays(agendaDate, dir * 7);
  else if (agendaView === 'month') {
    const d = new Date(agendaDate + 'T12:00:00');
    d.setMonth(d.getMonth() + dir);
    agendaDate = d.toLocaleDateString('en-CA');
  }
  loadAgendaView();
}

function agendaGoToday() {
  agendaDate = getTodayStr();
  loadAgendaView();
}

async function loadAgendaView() {
  const container = document.getElementById('agenda-view-container');
  if (!container) return;
  loading(container);

  const label = document.getElementById('agenda-date-label');

  try {
    let params = {};
    if (agendaProfFilter !== 'all') params.professional_id = agendaProfFilter;

    if (agendaView === 'day') {
      if (label) label.textContent = longDate(agendaDate);
      params.date = agendaDate;
      const [appointments, blocked] = await Promise.all([
        api.getAppointments(params),
        api.getBlockedTimes({ ...params, date: agendaDate })
      ]);
      renderDayView(container, agendaDate, appointments, blocked);

    } else if (agendaView === 'week') {
      // "Próximos 7 dias": a primeira coluna é sempre o dia exibido (agendaDate),
      // seguido dos 6 dias seguintes. Não usa semana fixa seg–dom.
      const range = { start: agendaDate, end: addDays(agendaDate, 6) };
      if (label) label.textContent = `${formatDate(range.start)} - ${formatDate(range.end)}`;
      params.start_date = range.start;
      params.end_date = range.end;
      const [appointments, blocked] = await Promise.all([
        api.getAppointments(params),
        api.getBlockedTimes({ ...params, start_date: range.start, end_date: range.end })
      ]);
      renderWeekView(container, range, appointments, blocked);

    } else {
      const d = new Date(agendaDate + 'T12:00:00');
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      // Último dia real do mês (evita datas inválidas como 31/09 no PostgreSQL)
      const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
      if (label) label.textContent = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      params.start_date = `${y}-${m}-01`;
      params.end_date = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
      const appointments = await api.getAppointments(params);
      renderMonthView(container, d.getFullYear(), d.getMonth(), appointments);
    }
  } catch (e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

const TIME_START = 7;
const TIME_END = 23;
const SLOT_HEIGHT = 52; // px per hour

// Minuto atual do dia (0..1439) no relógio local. Usado para desabilitar
// horários que já passaram no dia de HOJE.
function nowMinutesLocal() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

// Um horário (date 'YYYY-MM-DD' + 'HH:MM') já passou?
// - Data anterior a hoje: sempre passou.
// - Hoje: passou se o slot (arredondado p/ baixo em 30min) for <= agora.
// - Data futura: nunca passou.
function isSlotPast(date, hhmm) {
  const today = getTodayStr();
  if (date < today) return true;
  if (date > today) return false;
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h * 60 + m) <= nowMinutesLocal();
}

// Altura (px) da faixa "passada" do dia de hoje dentro da grade, para o overlay
// cinza. Retorna 0 se a data não for hoje. Limita ao intervalo visível da grade.
function pastOverlayHeight(date) {
  if (date !== getTodayStr()) return 0;
  const nowMin = nowMinutesLocal();
  const startMin = TIME_START * 60;
  const endMin = TIME_END * 60;
  const clamped = Math.max(startMin, Math.min(endMin, nowMin));
  return ((clamped - startMin) / 60) * SLOT_HEIGHT;
}



// Calcula o posicionamento lado a lado para agendamentos que se sobrepõem no tempo.
// Retorna um Map: id do appt -> { col, cols } (coluna ocupada e total de colunas do grupo).
function computeOverlapLayout(appts) {
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const items = appts.map(a => ({
    a,
    start: toMin(a.start_time),
    end: toMin(a.end_time)
  })).sort((x, y) => x.start - y.start || x.end - y.end);

  const layout = new Map();
  let i = 0;
  while (i < items.length) {
    let clusterEnd = items[i].end;
    const cluster = [items[i]];
    let j = i + 1;
    while (j < items.length && items[j].start < clusterEnd) {
      cluster.push(items[j]);
      clusterEnd = Math.max(clusterEnd, items[j].end);
      j++;
    }
    const colEnds = [];
    cluster.forEach(item => {
      let placed = false;
      for (let c = 0; c < colEnds.length; c++) {
        if (item.start >= colEnds[c]) { item.col = c; colEnds[c] = item.end; placed = true; break; }
      }
      if (!placed) { item.col = colEnds.length; colEnds.push(item.end); }
    });
    const totalCols = colEnds.length;
    cluster.forEach(item => layout.set(item.a.id, { col: item.col, cols: totalCols }));
    i = j;
  }
  return layout;
}

// Gera o CSS de posição horizontal (left/width) de um bloco dado seu layout de sobreposição.
function overlapStyle(layout, id) {
  const info = (layout && layout.get(id)) || { col: 0, cols: 1 };
  if (info.cols <= 1) return 'left:2px;right:2px;';
  const gap = 2;
  const widthPct = 100 / info.cols;
  const leftPct = widthPct * info.col;
  return `left:calc(${leftPct}% + ${gap}px);width:calc(${widthPct}% - ${gap * 2}px);`;
}

function renderDayView(container, date, appointments, blocked) {
  const today = getTodayStr();
  const hours = [];
  for (let h = TIME_START; h < TIME_END; h++) hours.push(h);

  // Group events by slot
  function getTop(time) {
    const [h, m] = time.split(':').map(Number);
    return ((h - TIME_START) + m / 60) * SLOT_HEIGHT;
  }
  function getHeight(start, end) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    return Math.max(24, (mins / 60) * SLOT_HEIGHT);
  }

  const totalHeight = hours.length * SLOT_HEIGHT;
  const dayLayout = computeOverlapLayout(appointments);

  const apptBlocks = appointments.map(a => {
    const top = getTop(a.start_time);
    const height = getHeight(a.start_time, a.end_time);
    const color = a.professional_color || '#3B5848';
    return `
      <div class="appt-block" style="background:${color};position:absolute;top:${top}px;height:${height}px;${overlapStyle(dayLayout, a.id)}z-index:5"
        onclick="event.stopPropagation();openEditAppointment(${a.id})">
        ${canCompleteAppt(a) ? `<button class="appt-done-btn" onclick="completeAppointmentFromCalendar(${a.id}, event)" title="Marcar como concluído">
          <i class="fa fa-check"></i>
        </button>` : ''}
        ${canModifyAppt(a) ? `<button class="appt-delete-btn" onclick="deleteAppointmentFromCalendar(${a.id}, event)" title="Excluir agendamento">
          <i class="fa fa-trash"></i>
        </button>` : ''}
        <div class="appt-block-title">${formatTime(a.start_time)} ${esc(a.client_name)}</div>
        <div class="appt-block-sub">${esc(a.service_name)} · ${formatCurrency(a.price)}</div>
        ${agendaProfFilter === 'all' ? `<div class="appt-block-sub">${esc(a.professional_name)}</div>` : ''}
        <div class="appt-block-sub">${statusBadge(a.status)}</div>
      </div>`;
  }).join('');

  const blockedBlocks = blocked.map(b => {
    const top = getTop(b.start_time);
    const height = getHeight(b.start_time, b.end_time);
    return `
      <div class="blocked-block" style="position:absolute;top:${top}px;height:${height}px;left:4px;right:4px;z-index:4"
        onclick="event.stopPropagation();${canModifyAppt(b) ? `deleteBlockedTime(${b.id})` : ''}">
        <div class="blocked-block-title"><i class="fa fa-ban"></i> ${esc(b.reason || 'Bloqueado')}</div>
        <div style="font-size:11px;color:var(--gray-500)">${formatTime(b.start_time)} - ${formatTime(b.end_time)} · ${esc(b.professional_name)}</div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="card" style="overflow:visible">
      <div class="card-header">
        <div class="card-title">${longDate(date)}</div>
        <span class="badge ${date === today ? 'badge-confirmed' : 'badge-scheduled'}">${date === today ? 'Hoje' : dayName(date)}</span>
      </div>
      <div style="display:grid;grid-template-columns:56px 1fr">
        <!-- Time labels -->
        <div>
          ${hours.map(h => `
            <div style="height:${SLOT_HEIGHT}px;padding:4px 6px 0 6px;font-size:11px;color:var(--gray-400);border-bottom:1px solid var(--gray-100)">
              ${String(h).padStart(2, '0')}:00
            </div>`).join('')}
        </div>
        <!-- Events column -->
        <div style="position:relative;height:${totalHeight}px;border-left:1px solid var(--gray-200);cursor:pointer"
          onclick="handleDayClick(event, '${date}')">
          ${hours.map(() => `<div style="height:${SLOT_HEIGHT}px;border-bottom:1px solid var(--gray-100)"></div>`).join('')}
          ${pastOverlayHeight(date) > 0 ? `<div class="agenda-past-overlay" style="position:absolute;top:0;left:0;right:0;height:${pastOverlayHeight(date)}px;z-index:2" title="Horário já passado"></div>` : ''}
          ${apptBlocks}
          ${blockedBlocks}
        </div>
      </div>
    </div>
    <div style="margin-top:12px;font-size:12px;color:var(--gray-400)">
      ${canCreateInCurrentAgenda()
      ? '💡 Clique em um horário vazio para criar agendamento. Clique em um agendamento para ver detalhes.'
      : '👀 Você está vendo a agenda de outra profissional. Clique em um agendamento para ver os detalhes.'}
    </div>
  `;
}

// Decide se o usuário atual pode CRIAR agendamento na visão atual da agenda.
// Agenda compartilhada: qualquer usuária do painel pode criar/editar em qualquer agenda.
function canCreateInCurrentAgenda() {
  return !!currentUser;
}

// Agenda compartilhada: qualquer usuária pode alterar/excluir qualquer agendamento.
function canModifyAppt(appt) {
  return !!currentUser;
}

// Só faz sentido concluir um atendimento que ainda está ativo (não cancelado/concluído/faltou).
function canCompleteAppt(appt) {
  return canModifyAppt(appt) && ['scheduled', 'confirmed', 'in_progress'].includes(appt.status);
}

// Botão rápido de "Concluído" na agenda: abre o modal de conclusão (registra o pagamento).
function completeAppointmentFromCalendar(id, event) {
  if (event) event.stopPropagation();
  openCompleteModal(id);
}

// Calcula o horário (HH:MM, em passos de 30min) a partir da posição Y do clique na coluna.
function timeFromClickY(colEl, clientY) {
  const rect = colEl.getBoundingClientRect();
  const y = clientY - rect.top;
  const hourOffset = y / SLOT_HEIGHT;
  const h = Math.floor(TIME_START + hourOffset);
  const m = Math.floor((hourOffset % 1) * 60 / 30) * 30;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function handleWeekColClick(e, day) {
  // só dispara se clicou direto na coluna (área vazia), não em bloco
  if (e.target.closest('.appt-block') || e.target.closest('.blocked-block')) return;
  // Na agenda de outra profissional, clicar em horário vazio não faz nada
  if (!canCreateInCurrentAgenda()) return;
  // Dia passado: não cria agendamento (mas agendamentos existentes ainda abrem detalhes)
  if (day < getTodayStr()) return;

  const time = timeFromClickY(e.currentTarget, e.clientY);
  // Horário que já passou hoje: não permite criar novo agendamento
  if (isSlotPast(day, time)) {
    toast('Esse horário já passou. Escolha um horário futuro.', 'warning');
    return;
  }

  const profId = getActiveAgendaProfId();
  openNewAppointment(day, profId, null, time);
  setTimeout(() => {
    const timeInput = document.getElementById('appt-time');
    if (timeInput && !timeInput.value) timeInput.value = time;
    const dateInput = document.getElementById('appt-date');
    if (dateInput && !dateInput.value) dateInput.value = day;
  }, 300);
}

function handleDayClick(e, date) {
  // Don't trigger if clicked on appt block
  if (e.target.closest('.appt-block') || e.target.closest('.blocked-block')) return;
  // Na agenda de outra profissional, clicar em horário vazio não faz nada
  if (!canCreateInCurrentAgenda()) return;
  // Dia inteiro no passado: não cria (agendamentos existentes ainda abrem detalhes)
  if (date < getTodayStr()) {
    toast('Esse dia já passou. Não é possível criar novos agendamentos.', 'warning');
    return;
  }

  const time = timeFromClickY(e.currentTarget, e.clientY);
  // Horário que já passou hoje: bloqueia a criação
  if (isSlotPast(date, time)) {
    toast('Esse horário já passou. Escolha um horário futuro.', 'warning');
    return;
  }

  const profId = getActiveAgendaProfId();
  openNewAppointment(date, profId, null, time);
  setTimeout(() => {
    const timeInput = document.getElementById('appt-time');
    if (timeInput && !timeInput.value) timeInput.value = time;
    const dateInput = document.getElementById('appt-date');
    if (dateInput && !dateInput.value) dateInput.value = date;
  }, 300);
}

function renderWeekView(container, range, appointments, blocked) {
  const days = [];
  let d = range.start;
  while (d <= range.end) {
    days.push(d);
    d = addDays(d, 1);
  }

  const today = getTodayStr();
  const hours = [];
  for (let h = TIME_START; h < TIME_END; h++) hours.push(h);

  function getTop(time) {
    const [h, m] = time.split(':').map(Number);
    return ((h - TIME_START) + m / 60) * SLOT_HEIGHT;
  }
  function getHeight(start, end) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return Math.max(20, ((eh * 60 + em - sh * 60 - sm) / 60) * SLOT_HEIGHT);
  }

  const totalH = hours.length * SLOT_HEIGHT;
  const cols = days.length;

  container.innerHTML = `
    <div class="card" style="overflow-x:auto">
     <div class="week-grid-wrap" style="min-width:650px">
      <!-- Day headers -->
      <div style="display:grid;grid-template-columns:56px repeat(${cols},1fr);border-bottom:1px solid var(--gray-200);background:var(--gray-50)">
        <div></div>
        ${days.map(day => {
    const isPast = day < today;
    const isToday = day === today;
    return `
          <div style="padding:10px 6px;text-align:center;border-left:1px solid var(--gray-200);${isToday ? 'background:var(--primary-light)' : ''}${isPast ? 'opacity:0.45' : ''}">
            <div style="font-size:11px;font-weight:700;color:${isToday ? 'var(--primary)' : 'var(--gray-500)'};text-transform:uppercase">${new Date(day + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' })}</div>
            <div style="font-size:20px;font-weight:700;color:${isToday ? 'var(--primary)' : 'var(--dark)'}">${parseInt(day.split('-')[2])}</div>
            ${isToday ? `<div style="font-size:9px;font-weight:800;color:var(--primary);letter-spacing:.5px;text-transform:uppercase;margin-top:1px">Hoje</div>` : ''}
          </div>`;
  }).join('')}
      </div>
      <!-- Time grid -->
      <div style="display:grid;grid-template-columns:56px repeat(${cols},1fr)">
        <!-- Time col -->
        <div>
          ${hours.map(h => `
            <div style="height:${SLOT_HEIGHT}px;padding:3px 6px 0;font-size:11px;color:var(--gray-400);border-bottom:1px solid var(--gray-100)">
              ${String(h).padStart(2, '0')}:00
            </div>`).join('')}
        </div>
        <!-- Day cols -->
        ${days.map(day => {
    const isPast = day < today;
    const dayAppts = appointments.filter(a => a.date === day);
    const dayBlocked = blocked.filter(b => b.date === day);
    const dayLayout = computeOverlapLayout(dayAppts);
    const pastH = pastOverlayHeight(day);
    return `
            <div style="position:relative;height:${totalH}px;border-left:1px solid var(--gray-200);${isPast ? 'background:var(--gray-50);cursor:default;opacity:0.6' : 'cursor:pointer'}"
              onclick="handleWeekColClick(event, '${day}')">
              ${hours.map(() => `<div style="height:${SLOT_HEIGHT}px;border-bottom:1px solid var(--gray-100)"></div>`).join('')}
              ${pastH > 0 ? `<div class="agenda-past-overlay" style="position:absolute;top:0;left:0;right:0;height:${pastH}px;z-index:2" title="Horário já passado"></div>` : ''}
              ${dayAppts.map(a => `
                <div class="appt-block"
                  style="background:${a.professional_color || '#3B5848'};position:absolute;top:${getTop(a.start_time)}px;height:${getHeight(a.start_time, a.end_time)}px;${overlapStyle(dayLayout, a.id)}font-size:11px;z-index:5"
                  onclick="event.stopPropagation();openEditAppointment(${a.id})">
                  ${canCompleteAppt(a) ? `<button class="appt-done-btn appt-done-btn-sm" onclick="completeAppointmentFromCalendar(${a.id}, event)" title="Marcar como concluído">
                    <i class="fa fa-check"></i>
                  </button>` : ''}
                  ${canModifyAppt(a) ? `<button class="appt-delete-btn appt-delete-btn-sm" onclick="deleteAppointmentFromCalendar(${a.id}, event)" title="Excluir agendamento">
                    <i class="fa fa-trash"></i>
                  </button>` : ''}
                  <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:18px">${formatTime(a.start_time)} ${esc(a.client_name)}</div>
                  <div style="opacity:0.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.service_name)}</div>
                </div>`).join('')}
              ${dayBlocked.map(b => `
                <div class="blocked-block"
                  style="position:absolute;top:${getTop(b.start_time)}px;height:${getHeight(b.start_time, b.end_time)}px;left:2px;right:2px;font-size:11px;z-index:5"
                  onclick="event.stopPropagation();${canModifyAppt(b) ? `deleteBlockedTime(${b.id})` : ''}">
                  <div class="blocked-block-title"><i class="fa fa-ban"></i> ${esc(b.reason || 'Bloqueado')}</div>
                </div>`).join('')}
            </div>`;
  }).join('')}
      </div>
     </div>
    </div>
  `;
}

function renderMonthView(container, year, month, appointments) {
  const today = getTodayStr();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay() === 0 ? 7 : firstDay.getDay(); // Monday=1
  const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  let cells = [];
  // Prev month padding
  for (let i = 1; i < startDow; i++) {
    const d = new Date(year, month, 1 - (startDow - 1 - i + 1));
    cells.push({ date: d.toLocaleDateString('en-CA'), otherMonth: true });
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    cells.push({ date: new Date(year, month, i).toLocaleDateString('en-CA'), otherMonth: false });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    cells.push({ date: addDays(last.date, 1), otherMonth: true });
  }

  const apptMap = {};
  appointments.forEach(a => {
    if (!apptMap[a.date]) apptMap[a.date] = [];
    apptMap[a.date].push(a);
  });

  container.innerHTML = `
    <div class="card">
      <div style="display:grid;grid-template-columns:repeat(7,1fr)">
        ${days.map(d => `<div class="month-day-header">${d}</div>`).join('')}
        ${cells.map(cell => {
    const cellAppts = apptMap[cell.date] || [];
    const shown = cellAppts.slice(0, 3);
    const more = cellAppts.length - 3;
    const isPast = cell.date < today;
    return `
            <div class="month-day ${cell.otherMonth ? 'other-month' : ''} ${cell.date === today ? 'today' : ''} ${isPast ? 'past-day' : ''}"
              ${!isPast ? `onclick="goToDayView('${cell.date}')"` : ''}>
              <div class="day-num">${parseInt(cell.date.split('-')[2])}</div>
              ${shown.map(a => `
                <div class="month-appt" style="background:${a.professional_color || '#3B5848'};position:relative;padding-right:20px"
                  onclick="event.stopPropagation();openEditAppointment(${a.id})">
                  ${formatTime(a.start_time)} ${esc(a.client_name)}
                  ${canModifyAppt(a) ? `<button class="appt-delete-btn appt-delete-btn-month" onclick="deleteAppointmentFromCalendar(${a.id}, event)" title="Excluir agendamento">
                    <i class="fa fa-times"></i>
                  </button>` : ''}
                </div>`).join('')}
              ${more > 0 ? `<div class="month-more">+${more} mais</div>` : ''}
            </div>`;
  }).join('')}
      </div>
    </div>
  `;
}

function goToDayView(date) {
  agendaDate = date;
  agendaView = 'day';
  loadAgenda();
}

async function deleteAppointmentFromCalendar(id, event) {
  event.stopPropagation(); // não abre o modal de edição
  // Busca o series_id para oferecer cancelamento parcial vs série.
  let seriesId = null;
  try { const a = await api.getAppointment(id); seriesId = a.series_id || null; } catch (_) { }
  await cancelAppointmentFlow(id, seriesId, () => loadAgendaView());
}

async function deleteBlockedTime(id) {
  const ok = await confirmDialog('Remover este bloqueio de horário?');
  if (!ok) return;
  try {
    await api.deleteBlockedTime(id);
    toast('Bloqueio removido', 'success');
    loadAgendaView();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function openBlockTimeModal() {
  const activeProfId = getActiveAgendaProfId() || (currentUser && currentUser.professional_id);
  const profOptions = agendaProfessionals.map(p =>
    `<option value="${p.id}" ${activeProfId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`
  ).join('');

  const timeSlots = generateTimeSlots('07:00', '23:00', 30);
  const timeOptions = timeSlots.map(t => `<option value="${t}">${t}</option>`).join('');

  openModal('Bloquear Horário', `
    <form id="block-form">
      <div class="form-group">
        <label>Profissional *</label>
        <select id="block-prof" required>${profOptions}</select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Data *</label>
          <input type="date" id="block-date" value="${agendaDate}" required />
        </div>
        <div class="form-group">
          <label>Motivo</label>
          <input type="text" id="block-reason" placeholder="Almoço, folga..." />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Início *</label>
          <select id="block-start" required>${timeOptions}</select>
        </div>
        <div class="form-group">
          <label>Fim *</label>
          <select id="block-end" required>${timeOptions}</select>
        </div>
      </div>
      <div id="block-error" class="alert alert-error" style="display:none"></div>
      <div class="modal-footer" style="padding:0;margin-top:16px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary"><i class="fa fa-ban"></i> Bloquear</button>
      </div>
    </form>
  `, 'modal-sm');

  // Set default end time 1hr after start
  document.getElementById('block-end').value = '08:00';

  document.getElementById('block-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('block-error');
    errEl.style.display = 'none';
    try {
      await api.createBlockedTime({
        professional_id: document.getElementById('block-prof').value,
        date: document.getElementById('block-date').value,
        start_time: document.getElementById('block-start').value,
        end_time: document.getElementById('block-end').value,
        reason: document.getElementById('block-reason').value || null
      });
      toast('Horário bloqueado com sucesso', 'success');
      closeModal();
      loadAgendaView();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
    }
  });
}
