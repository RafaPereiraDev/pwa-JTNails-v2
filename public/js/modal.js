// ===== MODAL =====
function openModal(title, bodyHtml, sizeClass = '') {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  const modal = document.getElementById('modal-container');
  modal.className = 'modal ' + sizeClass;
  document.getElementById('modal-overlay').classList.add('open');
  // Focus first input
  setTimeout(() => {
    const first = document.querySelector('#modal-body input, #modal-body select, #modal-body textarea');
    if (first) first.focus();
  }, 100);
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) return;
  document.getElementById('modal-overlay').classList.remove('open');
  document.getElementById('modal-body').innerHTML = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.getElementById('modal-overlay').classList.remove('open');
  }
});

// ===== APPOINTMENT FORM =====
async function openNewAppointment(prefillDate = null, prefillProfId = null, prefillClientId = null, prefillTime = null) {
  // Se não foi informada profissional explicitamente, herda a profissional ativa no filtro da Agenda (se não for "Todas")
  if (!prefillProfId && typeof agendaProfFilter !== 'undefined' && agendaProfFilter && agendaProfFilter !== 'all') {
    const parsed = parseInt(agendaProfFilter, 10);
    if (!isNaN(parsed)) prefillProfId = parsed;
  }

  openModal('Novo Agendamento', '<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>', 'modal-appt');
  try {
    const [clients, professionals, services] = await Promise.all([
      api.getClients(),
      api.getProfessionals(true),
      api.getServices(true)
    ]);
    renderAppointmentForm(null, { clients, professionals, services, prefillDate, prefillProfId, prefillClientId, prefillTime });
  } catch (e) {
    document.getElementById('modal-body').innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

async function openEditAppointment(id) {
  openModal('Detalhes do Agendamento', '<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>', 'modal-sm');
  try {
    const appt = await api.getAppointment(id);
    renderAppointmentDetail(appt);
  } catch (e) {
    document.getElementById('modal-body').innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

function renderAppointmentDetail(appt) {
  const statusColors = {
    scheduled:   '#3b82f6',
    confirmed:   '#22c55e',
    in_progress: '#f59e0b',
    completed:   '#15803d',
    cancelled:   '#ef4444',
    no_show:     '#6b7280'
  };
  const color = appt.professional_color || '#3B5848';

  // Agenda compartilhada: qualquer usuária do painel pode agir sobre qualquer agendamento.
  const isOwn = true;

  const canAct = isOwn && !['cancelled','no_show','completed'].includes(appt.status);

  // Quick action buttons based on current status
  let actionButtons = '';
  if (isOwn && (appt.status === 'scheduled' || appt.status === 'confirmed')) {
    actionButtons = `
      <button class="appt-action-btn" style="background:#22c55e" onclick="quickStatus(${appt.id},'confirmed')">
        <i class="fa fa-check"></i> Confirmar
      </button>
      <button class="appt-action-btn" style="background:#f59e0b" onclick="quickStatus(${appt.id},'in_progress')">
        <i class="fa fa-paintbrush"></i> Iniciar
      </button>`;
  }
  if (isOwn && appt.status === 'in_progress') {
    actionButtons = `
      <button class="appt-action-btn" style="background:#15803d" onclick="openCompleteModal(${appt.id})">
        <i class="fa fa-check-circle"></i> Concluir
      </button>`;
  }
  if (canAct) {
    actionButtons += `
      <button class="appt-action-btn" style="background:#6b7280" onclick="quickStatus(${appt.id},'no_show')">
        <i class="fa fa-user-times"></i> Não apareceu
      </button>
      <button class="appt-action-btn" style="background:#ef4444" onclick="quickCancel(${appt.id}, ${appt.series_id ? `'${appt.series_id}'` : 'null'})">
        <i class="fa fa-ban"></i> Cancelar
      </button>`;
  }

  document.getElementById('modal-title').textContent = 'Detalhes do Agendamento';
  document.getElementById('modal-body').innerHTML = `
    <style>
      .appt-action-btn {
        display:flex; align-items:center; gap:8px;
        width:100%; padding:11px 16px; border-radius:8px;
        color:white; font-size:14px; font-weight:600;
        margin-bottom:8px; cursor:pointer; border:none;
        transition:opacity 0.15s;
      }
      .appt-action-btn:hover { opacity:0.85; }
    </style>

    <!-- Header colorido com info principal -->
    <div style="background:${color};border-radius:10px;padding:16px;margin-bottom:16px;color:white">
      <div style="font-size:18px;font-weight:700;margin-bottom:4px">${esc(appt.client_name)}</div>
      <div style="opacity:0.9;font-size:14px">${esc(appt.service_name)} · ${formatCurrency(appt.price)}</div>
      <div style="opacity:0.85;font-size:13px;margin-top:6px">
        <i class="fa fa-calendar"></i> ${formatDate(appt.date)} às ${formatTime(appt.start_time)}–${formatTime(appt.end_time)}
        &nbsp;·&nbsp;
        <i class="fa fa-user"></i> ${esc(appt.professional_name)}
      </div>
    </div>

    <!-- Status atual -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <span style="font-size:13px;color:#6b7280">Status atual</span>
      <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:600;background:${statusColors[appt.status]}22;color:${statusColors[appt.status]}">
        <i class="fa ${getStatusIcon(appt.status)}"></i> ${getStatusLabel(appt.status)}
      </span>
    </div>



    ${appt.payment_method ? `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;font-size:14px">
      <span style="color:#6b7280">Pagamento</span>
      <span style="font-weight:600">${getPaymentLabel(appt.payment_method)}</span>
    </div>` : ''}

    ${appt.notes ? `
    <div style="background:#f9fafb;border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:13px;color:#6b7280">
      <i class="fa fa-sticky-note"></i> ${esc(appt.notes)}
    </div>` : ''}

    ${isOwn && appt.client_phone ? `
    <div style="margin-bottom:16px">
      <button class="appt-action-btn" style="background:#25d366" onclick="sendReminderWpp('${esc(appt.client_phone)}','${esc(appt.client_name).replace(/'/g,'&#39;')}','${appt.date}','${formatTime(appt.start_time)}','${esc(appt.service_name).replace(/'/g,'&#39;')}')">
        <i class="fab fa-whatsapp"></i> Enviar lembrete no WhatsApp
      </button>
    </div>` : ''}

    ${!isOwn ? `
    <div style="background:#f9fafb;border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:12px;color:#9ca3af;text-align:center">
      <i class="fa fa-lock"></i> Agendamento de outra profissional (somente leitura)
    </div>` : ''}

    <!-- Ações rápidas -->
    ${actionButtons ? `
    <div style="border-top:1px solid #e5e7eb;padding-top:14px;margin-bottom:8px">
      <div style="font-size:12px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Ações rápidas</div>
      ${actionButtons}
    </div>` : ''}

    <!-- Rodapé -->
    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="btn btn-secondary" style="flex:1" onclick="closeModal()">Fechar</button>
      ${isOwn ? `
      <button class="btn btn-outline" style="flex:1" onclick="openEditForm(${appt.id})">
        <i class="fa fa-edit"></i> Editar
      </button>` : ''}
    </div>
  `;
}

async function quickStatus(id, status) {
  try {
    await api.updateAppointment(id, { status });
    const labels = {
      confirmed:   'Agendamento confirmado',
      in_progress: 'Atendimento iniciado',
      no_show:     'Marcado como não compareceu',
    };
    toast(labels[status] || 'Status atualizado', status === 'no_show' ? 'warning' : 'success');
    closeModal();
    refreshCurrentPage();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function quickCancel(id, seriesId) {
  await cancelAppointmentFlow(id, seriesId || null, () => { closeModal(); refreshCurrentPage(); });
}

// Fluxo central de cancelamento. Mostra modal de escolha (parcial vs série)
// se o agendamento pertencer a uma série; senão cancela direto.
async function cancelAppointmentFlow(id, seriesId, onSuccess) {
  if (seriesId) {
    // Agendamento de série: oferece cancelamento parcial ou total.
    await new Promise((resolve) => {
      const prev = document.getElementById('cancel-series-overlay');
      if (prev) prev.remove();

      const overlay = document.createElement('div');
      overlay.id = 'cancel-series-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
      overlay.innerHTML = `
        <div class="cancel-series-card" style="background:#fff;border-radius:16px;width:100%;max-width:420px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.25);box-sizing:border-box;overflow:hidden">
          <h3 style="font-size:17px;font-weight:700;margin-bottom:8px">Cancelar agendamento</h3>
          <p style="font-size:14px;color:#6b7280;margin-bottom:20px;line-height:1.4">
            Este agendamento faz parte de uma série. O que deseja cancelar?
          </p>
          <div class="cancel-series-actions" style="display:flex;flex-direction:column;gap:10px;width:100%;box-sizing:border-box">
            <button id="cs-only" class="btn btn-secondary cancel-series-btn" style="width:100%;box-sizing:border-box;white-space:normal;word-break:break-word;overflow:hidden;padding:12px 14px;display:flex;align-items:center;justify-content:flex-start;gap:12px;text-align:left;height:auto">
              <i class="fa fa-calendar-xmark" style="color:var(--warning);font-size:18px;flex-shrink:0"></i>
              <span class="cancel-series-content" style="width:100%;box-sizing:border-box;white-space:normal;word-break:break-word;overflow:hidden;display:block;flex:1;min-width:0">
                <strong class="cancel-series-title" style="display:block;font-size:0.95rem;line-height:1.25">Somente este horário</strong>
                <small class="cancel-series-sub" style="display:block;font-size:0.8rem;color:#6b7280;line-height:1.35;margin-top:3px">Os demais agendamentos da série continuam normais.</small>
              </span>
            </button>
            <button id="cs-series" class="btn btn-danger cancel-series-btn" style="width:100%;box-sizing:border-box;white-space:normal;word-break:break-word;overflow:hidden;padding:12px 14px;display:flex;align-items:center;justify-content:flex-start;gap:12px;text-align:left;height:auto">
              <i class="fa fa-calendar-times" style="font-size:18px;flex-shrink:0"></i>
              <span class="cancel-series-content" style="width:100%;box-sizing:border-box;white-space:normal;word-break:break-word;overflow:hidden;display:block;flex:1;min-width:0">
                <strong class="cancel-series-title" style="display:block;font-size:0.95rem;line-height:1.25">Cancelar este e todos os futuros</strong>
                <small class="cancel-series-sub" style="display:block;font-size:0.8rem;opacity:.85;line-height:1.35;margin-top:3px">Cancela este + todos os próximos agendamentos da série.</small>
              </span>
            </button>
            <button id="cs-close" class="btn btn-ghost btn-block" style="margin-top:6px;width:100%;box-sizing:border-box">Voltar</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      async function doCancel(tipo) {
        overlay.remove();
        try {
          const r = await api.deleteAppointment(id, tipo);
          const msg = tipo === 'SERIE_COMPLETA'
            ? `${r.cancelled || ''} agendamento(s) da série cancelado(s).`
            : 'Agendamento cancelado.';
          toast(msg, 'warning');
          if (onSuccess) onSuccess();
        } catch (e) {
          toast(e.message, 'error');
        }
        resolve();
      }

      document.getElementById('cs-only').addEventListener('click', () => doCancel('APENAS_ESTE'));
      document.getElementById('cs-series').addEventListener('click', () => doCancel('SERIE_COMPLETA'));
      document.getElementById('cs-close').addEventListener('click', () => { overlay.remove(); resolve(); });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(); } });
    });
  } else {
    // Agendamento avulso: confirmação simples.
    const ok = await confirmDialog('Tem certeza que deseja <strong>cancelar</strong> este agendamento?');
    if (!ok) return;
    try {
      await api.deleteAppointment(id, 'APENAS_ESTE');
      toast('Agendamento cancelado', 'warning');
      if (onSuccess) onSuccess();
    } catch (e) {
      toast(e.message, 'error');
    }
  }
}

function openCompleteModal(id) {
  openModal('Concluir Atendimento', `
    <p style="margin-bottom:16px;color:#6b7280">Registre o pagamento para concluir o atendimento.</p>
    <div class="form-group">
      <label>Forma de Pagamento</label>
      <select id="complete-payment" style="font-size:15px">
        <option value="">Selecionar...</option>
        <option value="pix">Pix</option>
        <option value="cash">Dinheiro</option>
        <option value="credit">Cartão de Crédito</option>
        <option value="debit">Cartão de Débito</option>
        <option value="other">Outro</option>
      </select>
    </div>
    <div id="complete-error" class="alert alert-error" style="display:none"></div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-secondary" style="flex:1" onclick="openEditAppointment(${id})">Voltar</button>
      <button class="btn btn-success" style="flex:1" onclick="doComplete(${id})">
        <i class="fa fa-check-circle"></i> Concluir
      </button>
    </div>
  `, 'modal-sm');
}

async function doComplete(id) {
  const payment = document.getElementById('complete-payment').value;
  const errEl   = document.getElementById('complete-error');
  if (!payment) {
    errEl.textContent = 'Selecione a forma de pagamento';
    errEl.style.display = '';
    return;
  }
  try {
    await api.updateAppointment(id, { status: 'completed', payment_method: payment });
    toast('Atendimento concluído!', 'success');
    closeModal();
    refreshCurrentPage();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = '';
  }
}

function sendReminderWpp(phone, name, date, time, service) {
  const msg = `Olá, ${name}! Seu atendimento está confirmado para ${formatDate(date)} às ${time}. Serviço: ${service}. Até lá!`;
  window.open(whatsappLink(phone, msg), '_blank');
}

async function openEditForm(id) {
  openModal('Editar Agendamento', '<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>', 'modal-appt');
  try {
    const [appt, clients, professionals, services] = await Promise.all([
      api.getAppointment(id),
      api.getClients(),
      api.getProfessionals(true),
      api.getServices(true)
    ]);
    renderAppointmentForm(appt, { clients, professionals, services });
  } catch (e) {
    document.getElementById('modal-body').innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

function renderAppointmentForm(appt, { clients, professionals, services, prefillDate, prefillProfId, prefillClientId, prefillTime }) {
  const isEdit = !!appt;
  const today = getTodayStr();

  // Lista de clientes disponível para o autocomplete de busca
  window._apptClients = clients;
  const preSelected = appt
    ? clients.find(c => c.id === appt.client_id)
    : (prefillClientId ? clients.find(c => c.id === parseInt(prefillClientId, 10)) : null);

  // Agenda compartilhada: o select mostra TODAS as profissionais, para qualquer usuária.
  const profList = professionals;

  // Define qual profissional virá selecionada no select:
  // 1. Se editando agendamento existente: a profissional do agendamento
  // 2. Se prefillProfId veio definido: a profissional correspondente
  // 3. Se filtro da agenda estiver ativo e não for 'all': a profissional do filtro
  // 4. Se a usuária logada for uma profissional: ela mesma
  // 5. Caso contrário: a primeira profissional da lista
  let targetProfId = null;
  if (appt) {
    targetProfId = appt.professional_id;
  } else if (prefillProfId) {
    targetProfId = parseInt(prefillProfId, 10);
  } else if (typeof agendaProfFilter !== 'undefined' && agendaProfFilter && agendaProfFilter !== 'all') {
    const parsed = parseInt(agendaProfFilter, 10);
    if (!isNaN(parsed)) targetProfId = parsed;
  } else if (currentUser && currentUser.professional_id) {
    targetProfId = currentUser.professional_id;
  } else if (profList.length > 0) {
    targetProfId = profList[0].id;
  }

  const selectedServiceIds = appt
    ? (appt.service_ids && appt.service_ids.length > 0 ? appt.service_ids : (appt.service_id ? [appt.service_id] : []))
    : (services.length > 0 ? [services[0].id] : []);

  const profOptions = profList.map(p =>
    `<option value="${p.id}" ${targetProfId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`
  ).join('');

  const statusOptions = [
    ['scheduled','Agendado'],['confirmed','Confirmado'],
    ['in_progress','Em atendimento'],['completed','Concluído'],
    ['cancelled','Cancelado'],['no_show','Não compareceu']
  ].map(([v,l]) => `<option value="${v}" ${appt && appt.status === v ? 'selected' : (!appt && v === 'scheduled' ? 'selected' : '')}>${l}</option>`).join('');

  const payOptions = [
    ['','Selecionar...'],['pix','Pix'],['cash','Dinheiro'],
    ['credit','Cartão de Crédito'],['debit','Cartão de Débito'],['other','Outro']
  ].map(([v,l]) => `<option value="${v}" ${appt && appt.payment_method === v ? 'selected' : ''}>${l}</option>`).join('');

  document.getElementById('modal-body').innerHTML = `
    <form id="appt-form">
      <div class="modal-form-body">
        <div class="appt-layout">
          <!-- BLOCO 1: Cliente & Serviços -->
        <div class="appt-block">
          <div class="appt-block-header">
            <i class="fa fa-user-circle"></i>
            <span>Cliente & Serviços</span>
          </div>

          <div class="form-group appt-client-group" style="margin-top:8px">
            <label>Cliente *</label>
            <div style="display:flex;gap:8px;align-items:flex-start;flex-direction:column;width:100%">
              <div style="display:flex;gap:8px;width:100%;position:relative">
                <div style="flex:1;position:relative">
                  <input type="text" id="appt-client-search" autocomplete="off"
                    placeholder="Buscar nome ou telefone..."
                    value="${preSelected ? esc(preSelected.name) + ' - ' + formatPhone(preSelected.phone) : ''}"
                    oninput="onClientSearch()" onfocus="onClientSearch()" style="width:100%" />
                  <input type="hidden" id="appt-client" value="${preSelected ? preSelected.id : ''}" required />
                  <div id="client-suggestions" class="client-suggestions" style="display:none"></div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" onclick="openQuickClient()" title="Cadastrar nova cliente" style="padding:9px 12px;border-radius:10px">
                  <i class="fa fa-plus"></i>
                </button>
              </div>
              <div id="client-reliability-hint" style="min-height:18px"></div>
            </div>
          </div>

          <div class="form-group">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <label style="margin:0;font-size:13px;font-weight:600;color:var(--gray-700)">
                Serviços * <span style="font-weight:400;color:var(--gray-500);font-size:11.5px">(selecione um ou mais)</span>
              </label>
              <span id="services-badge-count" style="font-size:11px;font-weight:700;color:var(--primary);background:var(--primary-light);padding:2px 8px;border-radius:12px">
                ${selectedServiceIds.length} selecionado(s)
              </span>
            </div>
            <div class="multi-services-list" id="multi-services-list">
              ${services.map(s => {
                const checked = selectedServiceIds.includes(s.id);
                return `
                  <label class="service-check-item ${checked ? 'selected' : ''}" data-service-id="${s.id}">
                    <input type="checkbox" class="service-checkbox" value="${s.id}"
                      data-price="${s.price}" data-duration="${s.duration}" data-name="${esc(s.name)}"
                      ${checked ? 'checked' : ''} onchange="onMultiServiceChange()" />
                    <div class="service-check-info">
                      <span class="service-check-name">${esc(s.name)}</span>
                      <div class="service-check-meta">
                        <span class="service-check-duration"><i class="fa fa-clock"></i> ${formatDurationBR(s.duration)}</span>
                        <span class="service-check-price">${formatCurrency(s.price)}</span>
                      </div>
                    </div>
                  </label>
                `;
              }).join('')}
            </div>

            <!-- Resumo Dinâmico em Tempo Real -->
            <div class="appt-services-summary-box" id="appt-services-summary-box">
              <div class="summary-metric">
                <span class="metric-label"><i class="fa fa-clock"></i> Duração Total</span>
                <strong class="metric-value" id="summary-total-duration">0min</strong>
              </div>
              <div class="summary-metric">
                <span class="metric-label"><i class="fa fa-tag"></i> Valor Sugerido</span>
                <strong class="metric-value" id="summary-total-price">R$ 0,00</strong>
              </div>
              <div class="summary-metric">
                <span class="metric-label"><i class="fa fa-hourglass-end"></i> Término Previsto</span>
                <strong class="metric-value" id="summary-end-time">--:--</strong>
              </div>
            </div>
          </div>

          <div class="appt-prof-price-grid">
            <div class="form-group">
              <label>Profissional *</label>
              <select id="appt-professional" required>${profOptions}</select>
            </div>

            <div class="form-group">
              <label>Valor (R$) *</label>
              <div style="position:relative">
                <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-weight:600;color:var(--gray-500);font-size:13px">R$</span>
                <input type="number" id="appt-price" step="0.01" min="0" value="${appt ? appt.price : ''}" required style="padding-left:34px;font-weight:700;color:var(--dark);width:100%" />
              </div>
            </div>
          </div>
        </div>

        <!-- BLOCO 2: Data & Horário -->
        <div class="appt-block">
          <div class="appt-block-header">
            <i class="fa fa-calendar-alt"></i>
            <span>Data & Horário</span>
          </div>

          <div class="appt-datetime-grid">
            <div class="form-group" style="min-width:0;width:100%">
              <label>Data *</label>
              <input type="date" id="appt-date" value="${appt ? appt.date : (prefillDate || today)}" ${isEdit ? '' : `min="${today}"`} required
                style="-webkit-appearance:none;appearance:none;-webkit-min-logical-width:0;min-width:0;width:100%;box-sizing:border-box;display:block;height:46px;line-height:normal;border:1px solid #d1d5db;border-radius:8px;padding:10px 12px;background:#ffffff" />
            </div>

            <div class="form-group" style="min-width:0;width:100%">
              <label>Horário de Início *</label>
              <input type="time" id="appt-time" value="${appt ? appt.start_time : (prefillTime || '')}" required
                style="-webkit-appearance:none;appearance:none;-webkit-min-logical-width:0;min-width:0;width:100%;box-sizing:border-box;display:block;height:46px;line-height:normal;border:1px solid #d1d5db;border-radius:8px;padding:10px 12px;background:#ffffff" />
            </div>
          </div>

          <div class="appt-datetime-hint" id="appt-datetime-hint">
            <i class="fa fa-info-circle"></i>
            <span id="appt-datetime-hint-text">A duração do serviço é calculada automaticamente na agenda.</span>
          </div>
        </div>

        <!-- BLOCO 3: Opções & Pagamento -->
        <div class="appt-block">
          <div class="appt-block-header">
            <i class="fa fa-sliders-h"></i>
            <span>Opções & Pagamento</span>
          </div>

          ${!isEdit ? `
          <div class="form-group">
            <label>Plano Anual / Recorrência</label>
            <select id="appt-plan">
              <option value="">Sem recorrência (agendamento único)</option>
              <option value="weekly">Semanal (52 sessões / 1 ano)</option>
              <option value="biweekly">Quinzenal (a cada 14 dias / 26 sessões)</option>
              <option value="every21">A cada 21 dias (~17 sessões)</option>
              <option value="monthly">Mensal (12 sessões / 1x por mês)</option>
            </select>
          </div>` : ''}

          ${isEdit ? `
          <div class="form-group">
            <label>Status do Agendamento</label>
            <select id="appt-status">${statusOptions}</select>
          </div>` : `<input type="hidden" id="appt-status" value="scheduled" />`}

          <div class="form-group">
            <label>Forma de Pagamento</label>
            <select id="appt-payment">${payOptions}</select>
          </div>

          <div class="form-group appt-encaixe-container" style="display:flex;align-items:center;justify-content:flex-start;gap:8px;margin:10px 0">
            <label style="display:flex;align-items:center;justify-content:flex-start;gap:8px;font-weight:600;cursor:pointer;font-size:13px;color:var(--gray-700);margin:0">
              <input type="checkbox" id="appt-encaixe" style="width:18px !important;height:18px !important;accent-color:#1e5631;cursor:pointer;flex-shrink:0;margin:0" />
              <span>Permitir encaixe <span style="font-weight:400;font-size:12px;color:var(--gray-500)">(sobrepor horário)</span></span>
            </label>
          </div>

          <div class="form-group">
            <label>Observações</label>
            <textarea id="appt-notes" rows="2" placeholder="Ex: Preferências, observações gerais...">${appt ? esc(appt.notes || '') : ''}</textarea>
          </div>
        </div>
      </div>

        <div id="appt-error" class="alert alert-error" style="display:none;margin-top:16px"></div>
      </div>

      <div class="modal-footer">
        ${isEdit ? `<button type="button" class="btn btn-danger" onclick="quickCancel(${appt.id}, ${appt.series_id ? `'${appt.series_id}'` : 'null'})" style="margin-right:auto"><i class="fa fa-trash"></i> Excluir</button>` : ''}
        <button type="button" class="btn btn-secondary btn-cancel" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-appt-confirm"><i class="fa fa-check"></i> ${isEdit ? 'Salvar Alterações' : 'Confirmar Agendamento'}</button>
      </div>
    </form>
  `;

  // Listener para atualização do término previsto quando o horário de início é alterado
  const timeInput = document.getElementById('appt-time');
  if (timeInput) {
    timeInput.addEventListener('input', () => updateAppointmentSummary());
    timeInput.addEventListener('change', () => updateAppointmentSummary());
  }

  // Inicializa cálculo de múltiplos serviços e resumo em tempo real
  onMultiServiceChange(!isEdit);
  // Show reliability hint for pre-selected client
  onClientChange();

  document.getElementById('appt-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('appt-error');
    errEl.style.display = 'none';

    const clientId = document.getElementById('appt-client').value;
    if (!clientId) {
      errEl.textContent = 'Selecione uma cliente da lista de busca.';
      errEl.style.display = '';
      return;
    }

    const selectedCheckboxes = document.querySelectorAll('#multi-services-list .service-checkbox:checked');
    const selectedServiceIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.value, 10)).filter(Boolean);

    if (selectedServiceIds.length === 0) {
      errEl.textContent = 'Selecione ao menos um serviço para o agendamento.';
      errEl.style.display = '';
      return;
    }

    const planEl = document.getElementById('appt-plan');
    const encaixeEl = document.getElementById('appt-encaixe');
    const data = {
      client_id: parseInt(clientId),
      professional_id: parseInt(document.getElementById('appt-professional').value),
      service_id: selectedServiceIds[0],
      service_ids: selectedServiceIds,
      date: document.getElementById('appt-date').value,
      start_time: document.getElementById('appt-time').value,
      price: parseFloat(document.getElementById('appt-price').value),
      status: (document.getElementById('appt-status') ? document.getElementById('appt-status').value : 'scheduled') || 'scheduled',
      payment_method: document.getElementById('appt-payment').value || null,
      notes: document.getElementById('appt-notes').value || null,
      plan: planEl ? (planEl.value || null) : null,
      allow_overlap: encaixeEl ? encaixeEl.checked : false,
    };

    // Não permite agendar em datas/horários que já passaram (usa fuso local).
    // Aplica também ao concluir/reagendar, mas não bloqueia editar um agendamento
    // que permanece no mesmo dia/horário já existente.
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA');
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = (() => {
      const m = String(data.start_time || '').match(/^(\d{1,2}):(\d{2})/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    })();
    const isSameAsSaved = isEdit && appt && data.date === appt.date &&
      String(data.start_time) === String(appt.start_time).slice(0, 5);
    if (!isSameAsSaved) {
      if (data.date < todayStr) {
        errEl.textContent = 'Não é possível agendar em uma data que já passaram.';
        errEl.style.display = '';
        return;
      }
      if (data.date === todayStr && startMinutes !== null && startMinutes <= nowMinutes) {
        errEl.textContent = 'Não é possível agendar em um horário que já passou hoje.';
        errEl.style.display = '';
        return;
      }
      const dow = new Date(`${data.date}T12:00:00`).getDay();
      if (dow === 0 || dow === 1) {
        errEl.textContent = 'O salão não atende aos domingos e segundas-feiras.';
        errEl.style.display = '';
        return;
      }
    }

    try {
      if (isEdit) {
        await api.updateAppointment(appt.id, data);
        toast('Agendamento atualizado!', 'success');
      } else if (data.plan) {
        const r = await api.createAppointment(data);
        const skipped = (r && r.skipped) ? r.skipped.length : 0;
        toast(
          `Plano criado: ${r.created} agendamento(s)` + (skipped ? `, ${skipped} pulado(s) por conflito.` : '.'),
          'success'
        );
      } else {
        await api.createAppointment(data);
        toast('Agendamento criado!', 'success');
      }
      closeModal();
      refreshCurrentPage();
    } catch (err) {
      // Conflito de horário: oferece o encaixe explícito (não vale para planos).
      if (err.status === 409 && !data.plan && !data.allow_overlap) {
        errEl.innerHTML =
          'Este horário já está ocupado. ' +
          '<a href="#" id="do-encaixe" style="font-weight:700;color:var(--primary)">Encaixar mesmo assim?</a>';
        errEl.style.display = '';
        const link = document.getElementById('do-encaixe');
        if (link) link.onclick = (ev) => {
          ev.preventDefault();
          if (encaixeEl) encaixeEl.checked = true;
          document.getElementById('appt-form').requestSubmit();
        };
        return;
      }
      errEl.textContent = err.message;
      errEl.style.display = '';
    }
  });
}

function onMultiServiceChange(autoFillPrice = true) {
  const checkboxes = document.querySelectorAll('#multi-services-list .service-checkbox');
  const countBadge = document.getElementById('services-badge-count');
  let totalMinutes = 0;
  let totalPrice = 0;
  let count = 0;

  checkboxes.forEach(cb => {
    const parentLabel = cb.closest('.service-check-item');
    if (cb.checked) {
      count++;
      if (parentLabel) parentLabel.classList.add('selected');
      const dur = parseInt(cb.dataset.duration, 10) || 60;
      const pr  = parseFloat(cb.dataset.price) || 0;
      totalMinutes += dur;
      totalPrice += pr;
    } else {
      if (parentLabel) parentLabel.classList.remove('selected');
    }
  });

  if (countBadge) {
    countBadge.textContent = `${count} selecionado(s)`;
  }

  // Preenche o valor sugerido se solicitado (ex: novo agendamento ou alteração na seleção)
  if (autoFillPrice) {
    const priceInput = document.getElementById('appt-price');
    if (priceInput) {
      priceInput.value = totalPrice > 0 ? totalPrice.toFixed(2) : '0.00';
    }
  }

  updateAppointmentSummary(totalMinutes, totalPrice);
}

function updateAppointmentSummary(knownMins = null, knownPrice = null) {
  let totalMinutes = knownMins;
  let totalPrice = knownPrice;

  if (totalMinutes === null || totalPrice === null) {
    totalMinutes = 0;
    totalPrice = 0;
    const checkboxes = document.querySelectorAll('#multi-services-list .service-checkbox:checked');
    checkboxes.forEach(cb => {
      totalMinutes += parseInt(cb.dataset.duration, 10) || 60;
      totalPrice += parseFloat(cb.dataset.price) || 0;
    });
  }

  const durEl = document.getElementById('summary-total-duration');
  if (durEl) durEl.textContent = formatDurationBR(totalMinutes);

  const prEl = document.getElementById('summary-total-price');
  if (prEl) prEl.textContent = formatCurrency(totalPrice);

  const timeInput = document.getElementById('appt-time');
  const startTime = timeInput ? timeInput.value : '';
  const endTime = startTime && totalMinutes > 0 ? addMinutesToHHMM(startTime, totalMinutes) : '--:--';

  const endEl = document.getElementById('summary-end-time');
  if (endEl) endEl.textContent = endTime;

  const hintText = document.getElementById('appt-datetime-hint-text');
  if (hintText) {
    if (startTime && totalMinutes > 0) {
      hintText.innerHTML = `Atendimento das <strong>${startTime}</strong> às <strong>${endTime}</strong> (duração total: <strong>${formatDurationBR(totalMinutes)}</strong>).`;
    } else {
      hintText.textContent = 'A duração do serviço é calculada automaticamente na agenda.';
    }
  }
}

// Mantido para compatibilidade se invocado externamente
function onServiceChange() {
  onMultiServiceChange(true);
}

// Mostra o badge de confiabilidade da cliente atualmente selecionada
function onClientChange() {
  const hidden = document.getElementById('appt-client');
  const hint   = document.getElementById('client-reliability-hint');
  if (!hidden || !hint) return;
  const id = parseInt(hidden.value);
  const client = (window._apptClients || []).find(c => c.id === id);
  if (!client) { hint.innerHTML = ''; return; }
  const rel = client.reliability || 'new';
  hint.innerHTML = (rel === 'good' || rel === 'new')
    ? (rel === 'good' ? reliabilityBadge('good') : '')
    : reliabilityBadge(rel);
}

// Filtra as clientes conforme o texto digitado (nome ou telefone)
function onClientSearch() {
  const input = document.getElementById('appt-client-search');
  const box   = document.getElementById('client-suggestions');
  if (!input || !box) return;

  const termRaw = input.value.trim().toLowerCase();
  const termDigits = termRaw.replace(/\D/g, '');
  const clients = window._apptClients || [];

  // Se o campo foi alterado manualmente, invalida a seleção anterior
  document.getElementById('appt-client').value = '';
  onClientChange();

  let matches = clients;
  if (termRaw) {
    matches = clients.filter(c => {
      const nameMatch = c.name.toLowerCase().includes(termRaw);
      const phoneMatch = termDigits && (c.phone || '').replace(/\D/g, '').includes(termDigits);
      return nameMatch || phoneMatch;
    });
  }
  matches = matches.slice(0, 8); // limita a 8 sugestões

  if (matches.length === 0) {
    box.innerHTML = `<div class="client-suggestion-empty">Nenhuma cliente encontrada. Use o + para cadastrar.</div>`;
    box.style.display = 'block';
    return;
  }

  box.innerHTML = matches.map(c => `
    <div class="client-suggestion" onclick="selectClientFromSearch(${c.id})">
      <span class="client-suggestion-name">${esc(c.name)}</span>
      <span class="client-suggestion-phone">${formatPhone(c.phone)}</span>
    </div>
  `).join('');
  box.style.display = 'block';
}

// Seleciona uma cliente da lista de sugestões
function selectClientFromSearch(id) {
  const client = (window._apptClients || []).find(c => c.id === id);
  if (!client) return;
  document.getElementById('appt-client').value = client.id;
  document.getElementById('appt-client-search').value = `${client.name} - ${formatPhone(client.phone)}`;
  document.getElementById('client-suggestions').style.display = 'none';
  onClientChange();
}

// Fecha a lista de sugestões ao clicar fora
document.addEventListener('click', (e) => {
  const box = document.getElementById('client-suggestions');
  const input = document.getElementById('appt-client-search');
  if (box && input && !box.contains(e.target) && e.target !== input) {
    box.style.display = 'none';
  }
});

// cancelAppointment mantido por compatibilidade — usa quickCancel internamente
async function cancelAppointment(id) {
  return quickCancel(id);
}

async function openQuickClient() {
  // Guarda o conteúdo atual do modal para restaurar depois
  const prevTitle = document.getElementById('modal-title').textContent;
  const prevBody  = document.getElementById('modal-body').innerHTML;
  const prevClass = document.getElementById('modal-container').className;

  openModal('Novo Cliente Rápido', `
    <form id="quick-client-form">
      <div class="modal-form-body">
        <div class="form-group">
          <label>Nome *</label>
          <input type="text" id="qc-name" required placeholder="Nome da cliente" />
        </div>
        <div class="form-group">
          <label>Telefone *</label>
          <input type="tel" id="qc-phone" required placeholder="(11) 99999-9999" />
        </div>
        <div id="qc-error" class="alert alert-error" style="display:none"></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary btn-cancel" onclick="restoreAppointmentModal()">Voltar</button>
        <button type="submit" class="btn btn-primary"><i class="fa fa-save"></i> Criar</button>
      </div>
    </form>
  `, 'modal-sm');

  // Salva estado para o botão Voltar
  window._prevModalState = { title: prevTitle, body: prevBody, cls: prevClass };

  attachPhoneMask('qc-phone');

  document.getElementById('quick-client-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('qc-error');
    errEl.style.display = 'none';
    const name  = document.getElementById('qc-name').value.trim();
    const phone = document.getElementById('qc-phone').value.trim();
    try {
      const client = await api.createClient({ name, phone });
      toast(`Cliente ${client.name} criado!`, 'success');
      // Restaura o modal de agendamento e já seleciona o cliente recém-criado no autocomplete
      restoreAppointmentModal();
      setTimeout(() => {
        // Adiciona à lista em memória e seleciona
        if (!window._apptClients) window._apptClients = [];
        window._apptClients.push(client);
        const hidden = document.getElementById('appt-client');
        const search = document.getElementById('appt-client-search');
        if (hidden && search) {
          hidden.value = client.id;
          search.value = `${client.name} - ${formatPhone(client.phone)}`;
          onClientChange();
        }
      }, 50);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
    }
  });
}

function restoreAppointmentModal() {
  if (!window._prevModalState) { closeModal(); return; }
  const { title, body, cls } = window._prevModalState;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML    = body;
  document.getElementById('modal-container').className = cls;
  window._prevModalState = null;
}
