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
    // No mobile (<= 768px), define a visualização padrão para 1 Único Dia ('day')
    if (window.innerWidth <= 768) {
      agendaView = 'day';
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
      const [appointments, blocked] = await Promise.all([
        api.getAppointments(params),
        api.getBlockedTimes(params)
      ]);
      renderMonthView(container, d.getFullYear(), d.getMonth(), appointments, blocked);
    }
  } catch (e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

const TIME_START = 7;
const TIME_END = 23;
const SLOT_HEIGHT_30 = 40; // px por slot de 30 minutos (80px por hora, confortável para toque mobile)

function getAgendaTimeSlots() {
  const slots = [];
  for (let h = TIME_START; h < TIME_END; h++) {
    const hh = String(h).padStart(2, '0');
    slots.push({ h, m: 0, time: `${hh}:00`, isHalf: false });
    slots.push({ h, m: 30, time: `${hh}:30`, isHalf: true });
  }
  return slots;
}

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
  return ((clamped - startMin) / 30) * SLOT_HEIGHT_30;
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

function selectDayPickerDate(selectedDate) {
  agendaDate = selectedDate;
  loadAgendaView();
}

function renderDayView(container, date, appointments, blocked) {
  const today = getTodayStr();
  const slots = getAgendaTimeSlots();

  // Posicionamento vertical proporcional aos minutos em faixas de 30min
  function getTop(time) {
    const [h, m] = (time || '07:00').split(':').map(Number);
    const mins = Math.max(0, (h - TIME_START) * 60 + m);
    return (mins / 30) * SLOT_HEIGHT_30;
  }
  function getHeight(start, end) {
    const [sh, sm] = (start || '07:00').split(':').map(Number);
    const [eh, em] = (end || '23:00').split(':').map(Number);
    const startMins = Math.max(TIME_START * 60, sh * 60 + sm);
    const endMins = Math.min(TIME_END * 60, eh * 60 + em);
    const mins = Math.max(0, endMins - startMins);
    // Margem de 2px para espaçamento visual entre cards sequenciais
    return Math.max(26, (mins / 30) * SLOT_HEIGHT_30 - 2);
  }

  const totalHeight = slots.length * SLOT_HEIGHT_30;
  const dayLayout = computeOverlapLayout(appointments);

  // Seletor de dias no topo da visualização de dia (carrossel horizontal suave)
  const stripDays = [];
  for (let offset = -3; offset <= 10; offset++) {
    stripDays.push(addDays(date, offset));
  }
  const dayStripHtml = `
    <div class="agenda-day-picker-strip">
      ${stripDays.map(dStr => {
        const isCurrent = dStr === date;
        const isTodayDate = dStr === today;
        const dObj = new Date(dStr + 'T12:00:00');
        const dowName = dObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
        const dayNum = parseInt(dStr.split('-')[2], 10);
        return `
          <button type="button" class="agenda-day-pill ${isCurrent ? 'active' : ''}"
            onclick="selectDayPickerDate('${dStr}')"
            title="${longDate(dStr)}">
            <span class="pill-dow">${dowName}</span>
            <span class="pill-day">${dayNum}</span>
            ${isTodayDate ? '<span class="pill-today">Hoje</span>' : ''}
          </button>
        `;
      }).join('')}
    </div>
  `;

  // Cards de agendamentos das clientes (z-index 10: sempre clicáveis e visíveis sobre faixas de bloqueio)
  const apptBlocks = appointments.map(a => {
    const top = getTop(a.start_time);
    const height = getHeight(a.start_time, a.end_time);
    const color = a.professional_color || '#3B5848';
    return `
      <div class="appt-block appt-card" style="background:${color};position:absolute;top:${top + 1}px;height:${height}px;${overlapStyle(dayLayout, a.id)}z-index:10"
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

  // Faixas de bloqueio de horário (z-index 3: sobreposta ao grid, sob os agendamentos)
  const blockedBlocks = blocked.map(b => {
    const top = getTop(b.start_time);
    const height = getHeight(b.start_time, b.end_time);
    const isAllDay = b.all_day || (b.start_time.slice(0, 5) === '07:00' && b.end_time.slice(0, 5) === '23:00');
    const timeText = isAllDay ? 'Dia Inteiro' : `${formatTime(b.start_time)} - ${formatTime(b.end_time)}`;
    return `
      <div class="blocked-block" style="position:absolute;top:${top + 1}px;height:${height}px;left:4px;right:4px;z-index:3"
        onclick="event.stopPropagation();${canModifyAppt(b) ? `deleteBlockedTime(${b.id})` : ''}"
        title="Bloqueio de Horário. Clique para remover.">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div class="blocked-block-title"><i class="fa fa-ban"></i> ${esc(b.reason || 'Bloqueado')}</div>
          ${canModifyAppt(b) ? `<button type="button" class="blocked-delete-btn" onclick="event.stopPropagation();deleteBlockedTime(${b.id})" title="Remover bloqueio"><i class="fa fa-times"></i></button>` : ''}
        </div>
        <div style="font-size:11px;color:#64748b;font-weight:500;margin-top:2px">${timeText} · ${esc(b.professional_name)}</div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="card" style="overflow:visible">
      <div class="card-header" style="flex-wrap:wrap;gap:8px">
        <div class="card-title">${longDate(date)}</div>
        <span class="badge ${date === today ? 'badge-confirmed' : 'badge-scheduled'}">${date === today ? 'Hoje' : dayName(date)}</span>
      </div>
      ${dayStripHtml}
      <div style="display:grid;grid-template-columns:56px 1fr">
        <!-- Time labels (30 em 30 min) -->
        <div>
          ${slots.map(s => `
            <div class="agenda-time-label ${s.isHalf ? 'half-hour' : 'full-hour'}" style="height:${SLOT_HEIGHT_30}px">
              ${s.isHalf ? `<span class="time-sub">${s.time}</span>` : `<span class="time-main">${s.time}</span>`}
            </div>`).join('')}
        </div>
        <!-- Events column -->
        <div style="position:relative;height:${totalHeight}px;border-left:1px solid var(--gray-200);cursor:pointer"
          onclick="handleDayClick(event, '${date}')">
          ${slots.map(s => `<div class="agenda-grid-slot ${s.isHalf ? 'half-hour' : 'full-hour'}" data-time="${s.time}" style="height:${SLOT_HEIGHT_30}px"></div>`).join('')}
          ${pastOverlayHeight(date) > 0 ? `<div class="agenda-past-overlay" style="position:absolute;top:0;left:0;right:0;height:${pastOverlayHeight(date)}px;z-index:2" title="Horário já passado"></div>` : ''}
          ${blockedBlocks}
          ${apptBlocks}
        </div>
      </div>
    </div>
    <div style="margin-top:12px;font-size:12px;color:var(--gray-400)">
      ${canCreateInCurrentAgenda()
      ? '💡 Clique em um horário vazio para criar agendamento. Clique em um agendamento para ver detalhes.'
      : '👀 Você está vendo a agenda de outra profissional. Clique em um agendamento para ver os detalhes.'}
    </div>
  `;

  setTimeout(() => {
    const activePill = container.querySelector('.agenda-day-pill.active');
    if (activePill) {
      activePill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, 60);
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
  const y = Math.max(0, clientY - rect.top);
  const slotIdx = Math.floor(y / SLOT_HEIGHT_30);
  const totalMins = slotIdx * 30;
  const h = Math.floor(TIME_START + totalMins / 60);
  const m = totalMins % 60;
  const clampedH = Math.min(TIME_END - 1, Math.max(TIME_START, h));
  return `${String(clampedH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function handleWeekColClick(e, day) {
  // só dispara se clicou direto na coluna (área vazia), não em bloco
  if (e.target.closest('.appt-block') || e.target.closest('.blocked-block')) return;
  // Na agenda de outra profissional, clicar em horário vazio não faz nada
  if (!canCreateInCurrentAgenda()) return;
  // Dia passado: não cria agendamento (mas agendamentos existentes ainda abrem detalhes)
  if (day < getTodayStr()) return;

  const slotEl = e.target.closest('[data-time]');
  const time = (slotEl && slotEl.dataset.time) ? slotEl.dataset.time : timeFromClickY(e.currentTarget, e.clientY);
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

  const slotEl = e.target.closest('[data-time]');
  const time = (slotEl && slotEl.dataset.time) ? slotEl.dataset.time : timeFromClickY(e.currentTarget, e.clientY);
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
  const slots = getAgendaTimeSlots();

  function getTop(time) {
    const [h, m] = (time || '07:00').split(':').map(Number);
    const mins = Math.max(0, (h - TIME_START) * 60 + m);
    return (mins / 30) * SLOT_HEIGHT_30;
  }
  function getHeight(start, end) {
    const [sh, sm] = (start || '07:00').split(':').map(Number);
    const [eh, em] = (end || '23:00').split(':').map(Number);
    const startMins = Math.max(TIME_START * 60, sh * 60 + sm);
    const endMins = Math.min(TIME_END * 60, eh * 60 + em);
    const mins = Math.max(0, endMins - startMins);
    return Math.max(26, (mins / 30) * SLOT_HEIGHT_30 - 2);
  }

  const totalH = slots.length * SLOT_HEIGHT_30;
  const cols = days.length;

  container.innerHTML = `
    <div class="card agenda-week-container" style="overflow-x:auto;-webkit-overflow-scrolling:touch;scroll-behavior:smooth">
     <div class="week-grid-wrap" style="min-width:calc(56px + ${cols} * 220px)">
      <!-- Day headers -->
      <div class="week-grid-header" style="display:grid;grid-template-columns:56px repeat(${cols}, minmax(220px, 1fr));border-bottom:1px solid var(--gray-200);background:var(--gray-50)">
        <div></div>
        ${days.map(day => {
    const isPast = day < today;
    const isToday = day === today;
    return `
          <div style="padding:10px 8px;text-align:center;border-left:1px solid var(--gray-200);min-width:220px;box-sizing:border-box;${isToday ? 'background:var(--primary-light)' : ''}${isPast ? 'opacity:0.45' : ''}"
            data-is-today="${isToday}">
            <div style="font-size:11px;font-weight:700;color:${isToday ? 'var(--primary)' : 'var(--gray-500)'};text-transform:uppercase">${new Date(day + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' })}</div>
            <div style="font-size:20px;font-weight:700;color:${isToday ? 'var(--primary)' : 'var(--dark)'}">${parseInt(day.split('-')[2])}</div>
            ${isToday ? `<div style="font-size:9px;font-weight:800;color:var(--primary);letter-spacing:.5px;text-transform:uppercase;margin-top:1px">Hoje</div>` : ''}
          </div>`;
  }).join('')}
      </div>
      <!-- Time grid (30 em 30 min) -->
      <div class="week-grid-body" style="display:grid;grid-template-columns:56px repeat(${cols}, minmax(220px, 1fr))">
        <!-- Time col -->
        <div>
          ${slots.map(s => `
            <div class="agenda-time-label ${s.isHalf ? 'half-hour' : 'full-hour'}" style="height:${SLOT_HEIGHT_30}px">
              ${s.isHalf ? `<span class="time-sub">${s.time}</span>` : `<span class="time-main">${s.time}</span>`}
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
            <div class="week-day-col" style="position:relative;height:${totalH}px;min-width:220px;box-sizing:border-box;border-left:1px solid var(--gray-200);${isPast ? 'background:var(--gray-50);cursor:default;opacity:0.6' : 'cursor:pointer'}"
              onclick="handleWeekColClick(event, '${day}')">
              ${slots.map(s => `<div class="agenda-grid-slot ${s.isHalf ? 'half-hour' : 'full-hour'}" data-time="${s.time}" style="height:${SLOT_HEIGHT_30}px"></div>`).join('')}
              ${pastH > 0 ? `<div class="agenda-past-overlay" style="position:absolute;top:0;left:0;right:0;height:${pastH}px;z-index:2" title="Horário já passado"></div>` : ''}
              ${dayBlocked.map(b => {
                const isAllDay = b.all_day || (b.start_time.slice(0, 5) === '07:00' && b.end_time.slice(0, 5) === '23:00');
                const timeText = isAllDay ? 'Dia Inteiro' : `${formatTime(b.start_time)} - ${formatTime(b.end_time)}`;
                return `
                <div class="blocked-block"
                  style="position:absolute;top:${getTop(b.start_time) + 1}px;height:${getHeight(b.start_time, b.end_time)}px;left:2px;right:2px;font-size:11px;z-index:3"
                  onclick="event.stopPropagation();${canModifyAppt(b) ? `deleteBlockedTime(${b.id})` : ''}"
                  title="Bloqueio de Horário. Clique para remover.">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start">
                    <div class="blocked-block-title"><i class="fa fa-ban"></i> ${esc(b.reason || 'Bloqueado')}</div>
                    ${canModifyAppt(b) ? `<button type="button" class="blocked-delete-btn" onclick="event.stopPropagation();deleteBlockedTime(${b.id})" title="Remover bloqueio"><i class="fa fa-times"></i></button>` : ''}
                  </div>
                  <div style="font-size:10px;color:#64748b;font-weight:500;margin-top:2px">${timeText}</div>
                </div>`;
              }).join('')}
              ${dayAppts.map(a => `
                <div class="appt-block appt-card"
                  style="background:${a.professional_color || '#3B5848'};position:absolute;top:${getTop(a.start_time) + 1}px;height:${getHeight(a.start_time, a.end_time)}px;${overlapStyle(dayLayout, a.id)}z-index:10"
                  onclick="event.stopPropagation();openEditAppointment(${a.id})">
                  ${canCompleteAppt(a) ? `<button class="appt-done-btn appt-done-btn-sm" onclick="completeAppointmentFromCalendar(${a.id}, event)" title="Marcar como concluído">
                    <i class="fa fa-check"></i>
                  </button>` : ''}
                  ${canModifyAppt(a) ? `<button class="appt-delete-btn appt-delete-btn-sm" onclick="deleteAppointmentFromCalendar(${a.id}, event)" title="Excluir agendamento">
                    <i class="fa fa-trash"></i>
                  </button>` : ''}
                  <div class="appt-block-title">${formatTime(a.start_time)} ${esc(a.client_name)}</div>
                  <div class="appt-block-sub">${esc(a.service_name)} · ${formatCurrency(a.price)}</div>
                  ${agendaProfFilter === 'all' ? `<div class="appt-block-sub">${esc(a.professional_name)}</div>` : ''}
                  <div class="appt-block-sub">${statusBadge(a.status)}</div>
                </div>`).join('')}
            </div>`;
  }).join('')}
      </div>
     </div>
    </div>
  `;

  setTimeout(() => {
    const scrollContainer = container.querySelector('.agenda-week-container');
    const todayCol = container.querySelector('.week-grid-header [data-is-today="true"]');
    if (scrollContainer && todayCol) {
      const scrollPos = todayCol.offsetLeft - 60;
      if (scrollPos > 0) {
        scrollContainer.scrollTo({ left: scrollPos, behavior: 'smooth' });
      }
    }
  }, 60);
}

function renderMonthView(container, year, month, appointments, blocked = []) {
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

  const blockedMap = {};
  (blocked || []).forEach(b => {
    if (!blockedMap[b.date]) blockedMap[b.date] = [];
    blockedMap[b.date].push(b);
  });

  container.innerHTML = `
    <div class="card calendar-month-container month-view-wrapper" style="overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%">
      <div class="month-grid" style="display:grid;grid-template-columns:repeat(7, minmax(90px, 1fr));min-width:650px">
        ${days.map(d => `<div class="month-day-header" style="min-width:90px">${d}</div>`).join('')}
        ${cells.map(cell => {
    const cellAppts = apptMap[cell.date] || [];
    const cellBlocked = blockedMap[cell.date] || [];
    const shown = cellAppts.slice(0, 3);
    const more = cellAppts.length - 3;
    const isPast = cell.date < today;
    return `
            <div class="month-day ${cell.otherMonth ? 'other-month' : ''} ${cell.date === today ? 'today' : ''} ${isPast ? 'past-day' : ''}" style="min-width:90px"
              ${!isPast ? `onclick="goToDayView('${cell.date}')"` : ''}>
              <div class="day-num">${parseInt(cell.date.split('-')[2])}</div>
              ${cellBlocked.map(b => `
                <div class="month-blocked"
                  onclick="event.stopPropagation();${canModifyAppt(b) ? `deleteBlockedTime(${b.id})` : ''}"
                  title="Bloqueio: ${esc(b.reason || 'Bloqueado')}. Clique para remover.">
                  <i class="fa fa-ban" style="font-size:9px"></i> ${esc(b.reason || 'Bloqueado')}
                </div>`).join('')}
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

function openBlockTimeModal(prefill = {}) {
  const activeProfId = prefill.profId || getActiveAgendaProfId() || (currentUser && currentUser.professional_id);
  const profOptions = agendaProfessionals.map(p =>
    `<option value="${p.id}" ${String(activeProfId) === String(p.id) ? 'selected' : ''}>${esc(p.name)}</option>`
  ).join('');

  const startDateVal = prefill.startDate || agendaDate || getTodayStr();
  const endDateVal   = prefill.endDate   || startDateVal;
  const isAllDay     = prefill.allDay !== undefined ? prefill.allDay : true;
  const startTimeVal = prefill.startTime || '08:00';
  const endTimeVal   = prefill.endTime   || '12:00';
  const reasonVal    = prefill.reason    || '';

  openModal('Bloquear Horário', `
    <form id="block-form">
      <div class="block-form-group">
        <label for="block-prof">Profissional *</label>
        <select id="block-prof" required>${profOptions}</select>
      </div>

      <div class="block-form-row block-date-row">
        <div class="block-form-group" style="margin-bottom:0">
          <label for="block-start-date">Data Início *</label>
          <input type="date" id="block-start-date" value="${startDateVal}" required />
        </div>
        <div class="block-form-group" style="margin-bottom:0">
          <label for="block-end-date">Data Fim *</label>
          <input type="date" id="block-end-date" value="${endDateVal}" min="${startDateVal}" required />
        </div>
      </div>

      <label class="block-checkbox-wrapper" for="block-all-day">
        <input type="checkbox" id="block-all-day" ${isAllDay ? 'checked' : ''} />
        <span class="block-checkbox-label">Bloquear o dia inteiro</span>
      </label>

      <div class="block-form-row ${isAllDay ? 'hidden' : ''}" id="block-time-row" style="${isAllDay ? 'display:none' : 'display:grid'}">
        <div class="block-form-group" style="margin-bottom:0">
          <label for="block-start-time">Horário Início *</label>
          <input type="time" id="block-start-time" value="${startTimeVal}" ${isAllDay ? '' : 'required'} />
        </div>
        <div class="block-form-group" style="margin-bottom:0">
          <label for="block-end-time">Horário Fim *</label>
          <input type="time" id="block-end-time" value="${endTimeVal}" ${isAllDay ? '' : 'required'} />
        </div>
      </div>

      <div class="block-form-group">
        <label for="block-reason">Motivo / Observação</label>
        <input type="text" id="block-reason" value="${esc(reasonVal)}" placeholder="Ex: Férias, Folga, Casamento..." autocomplete="off" />
      </div>

      <div id="block-error" class="alert alert-error" style="display:none;margin-bottom:12px"></div>

      <div class="block-modal-footer">
        <button type="button" class="btn-block-cancel" onclick="closeModal()">Cancelar</button>
        <button type="submit" id="btn-submit-block" class="btn-block-submit">
          <i class="fa fa-ban"></i> Bloquear Horário
        </button>
      </div>
    </form>
  `, 'modal-block');

  const form = document.getElementById('block-form');
  const allDayCb = document.getElementById('block-all-day');
  const timeRow = document.getElementById('block-time-row');
  const startDateInput = document.getElementById('block-start-date');
  const endDateInput = document.getElementById('block-end-date');
  const startTimeInput = document.getElementById('block-start-time');
  const endTimeInput = document.getElementById('block-end-time');
  const errEl = document.getElementById('block-error');

  function showBlockError(msg) {
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }
  }

  // Alterna campos de horário conforme o checkbox "Bloquear o dia inteiro"
  allDayCb.addEventListener('change', () => {
    if (allDayCb.checked) {
      timeRow.classList.add('hidden');
      timeRow.style.setProperty('display', 'none', 'important');
      startTimeInput.removeAttribute('required');
      endTimeInput.removeAttribute('required');
    } else {
      timeRow.classList.remove('hidden');
      timeRow.style.setProperty('display', 'grid', 'important');
      startTimeInput.setAttribute('required', 'required');
      endTimeInput.setAttribute('required', 'required');
    }
  });

  // Ajusta data fim quando a data início muda
  startDateInput.addEventListener('change', () => {
    endDateInput.min = startDateInput.value;
    if (!endDateInput.value || endDateInput.value < startDateInput.value) {
      endDateInput.value = startDateInput.value;
    }
  });

  // Submissão inteligente do formulário
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.style.display = 'none';

    const profId = document.getElementById('block-prof').value;
    const sDate = startDateInput.value;
    const eDate = endDateInput.value || sDate;
    const isCheckedAllDay = allDayCb.checked;
    const sTime = isCheckedAllDay ? '07:00' : startTimeInput.value;
    const eTime = isCheckedAllDay ? '23:00' : endTimeInput.value;
    const reason = document.getElementById('block-reason').value.trim();

    if (!sDate) {
      showBlockError('A data de início é obrigatória');
      return;
    }
    if (eDate < sDate) {
      showBlockError('A data final não pode ser anterior à data inicial');
      return;
    }
    if (!isCheckedAllDay) {
      if (!sTime || !eTime) {
        showBlockError('Informe o horário de início e término');
        return;
      }
      if (eTime <= sTime) {
        showBlockError('O horário de término deve ser posterior ao horário de início');
        return;
      }
    }

    const submitBtn = document.getElementById('btn-submit-block');
    const originalBtnHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Verificando...';

    try {
      // Consulta agendamentos existentes no período selecionado
      const checkRes = await api.checkBlockedTimeConflicts({
        professional_id: profId,
        start_date: sDate,
        end_date: eDate,
        all_day: isCheckedAllDay,
        start_time: sTime,
        end_time: eTime
      });

      const conflicts = (checkRes && checkRes.conflicts) || [];

      if (conflicts.length === 0) {
        // CENÁRIO A: NÃO HÁ agendamentos no intervalo selecionado:
        // Salva o bloqueio diretamente, sem modais ou alertas adicionais.
        await api.createBlockedTime({
          professional_id: profId,
          start_date: sDate,
          end_date: eDate,
          all_day: isCheckedAllDay,
          start_time: sTime,
          end_time: eTime,
          reason: reason || null
        });
        toast('Horário bloqueado com sucesso', 'success');
        closeModal();
        loadAgendaView();
      } else {
        // CENÁRIO B: HÁ 1 ou mais agendamentos de clientes no período selecionado:
        // Exibe tela de confirmação com listagem detalhada das clientes afetadas
        renderBlockConfirmationView({
          professional_id: profId,
          start_date: sDate,
          end_date: eDate,
          all_day: isCheckedAllDay,
          start_time: sTime,
          end_time: eTime,
          reason,
          conflicts
        }, () => {
          // Callback para voltar ao formulário com os dados preservados
          openBlockTimeModal({
            profId,
            startDate: sDate,
            endDate: eDate,
            allDay: isCheckedAllDay,
            startTime: sTime,
            endTime: eTime,
            reason
          });
        });
      }
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
      showBlockError(err.message || 'Erro ao processar bloqueio');
    }
  });
}

function renderBlockConfirmationView(blockData, onBack) {
  document.getElementById('modal-title').textContent = 'Confirmar Bloqueio de Horário';
  const modalBody = document.getElementById('modal-body');

  const count = blockData.conflicts.length;
  const countText = count === 1 ? '1 agendamento marcado' : `${count} agendamentos marcados`;

  modalBody.innerHTML = `
    <div class="block-conflict-alert">
      <div class="block-conflict-title">
        <i class="fa fa-exclamation-triangle" style="font-size:1.15rem;color:#d97706"></i>
        <span>Atenção: Existem ${countText} neste período.</span>
      </div>
      <p class="block-conflict-desc">
        Os agendamentos abaixo <strong>não serão excluídos</strong>. Eles permanecerão visíveis e clicáveis na sua agenda para atendimento, edição ou remarcação. O período ficará fechado para novos agendamentos.
      </p>
    </div>

    <div style="font-size:0.85rem;font-weight:700;color:#334155;margin-bottom:6px">
      Clientes com horário marcado:
    </div>

    <div class="block-conflict-list">
      ${blockData.conflicts.map(a => `
        <div class="block-conflict-item">
          <div class="block-conflict-main">
            <span class="block-conflict-time-badge">
              ${blockData.start_date !== blockData.end_date ? formatDate(a.date).slice(0, 5) + ' ' : ''}${formatTime(a.start_time)}
            </span>
            <div class="block-conflict-info">
              <span class="block-conflict-name">${esc(a.client_name)}</span>
              <span class="block-conflict-service">· ${esc(a.service_name)}</span>
            </div>
          </div>
          ${a.client_phone ? `
            <a href="${whatsappLink(a.client_phone, `Olá ${a.client_name}, tudo bem? Gostaria de falar sobre seu horário agendado no JT Nails.`)}"
               target="_blank" class="block-conflict-wpp-btn"
               title="Conversar no WhatsApp">
              <i class="fab fa-whatsapp"></i> WhatsApp
            </a>` : ''}
        </div>
      `).join('')}
    </div>

    <div id="block-confirm-error" class="alert alert-error" style="display:none;margin-bottom:12px"></div>

    <div class="block-modal-footer">
      <button type="button" id="btn-conflict-back" class="btn-block-cancel">
        <i class="fa fa-arrow-left"></i> Voltar / Cancelar
      </button>
      <button type="button" id="btn-conflict-confirm" class="btn-block-submit">
        <i class="fa fa-check"></i> Sim, confirmar bloqueio
      </button>
    </div>
  `;

  document.getElementById('btn-conflict-back').addEventListener('click', () => {
    if (onBack) onBack();
    else closeModal();
  });

  document.getElementById('btn-conflict-confirm').addEventListener('click', async () => {
    const confirmBtn = document.getElementById('btn-conflict-confirm');
    const backBtn = document.getElementById('btn-conflict-back');
    const errEl = document.getElementById('block-confirm-error');
    errEl.style.display = 'none';

    confirmBtn.disabled = true;
    backBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Salvando...';

    try {
      await api.createBlockedTime({
        professional_id: blockData.professional_id,
        start_date: blockData.start_date,
        end_date: blockData.end_date,
        all_day: blockData.all_day,
        start_time: blockData.start_time,
        end_time: blockData.end_time,
        reason: blockData.reason || null
      });
      toast('Horário bloqueado com sucesso', 'success');
      closeModal();
      loadAgendaView();
    } catch (err) {
      confirmBtn.disabled = false;
      backBtn.disabled = false;
      confirmBtn.innerHTML = '<i class="fa fa-check"></i> Sim, confirmar bloqueio';
      errEl.textContent = err.message || 'Erro ao salvar bloqueio';
      errEl.style.display = '';
    }
  });
}
