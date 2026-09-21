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

function showRecurrenceScopeDialog() {
  return new Promise((resolve) => {
    const prev = document.getElementById('recurrence-scope-overlay');
    if (prev) prev.remove();

    const overlay = document.createElement('div');
    overlay.id = 'recurrence-scope-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
    overlay.innerHTML = `
      <div class="recurrence-scope-card" style="background:#fff;border-radius:18px;width:100%;max-width:440px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.25);box-sizing:border-box;overflow:hidden;animation:fadeIn .15s ease-out">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div style="width:40px;height:40px;border-radius:12px;background:rgba(59,88,72,0.12);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">
            <i class="fa fa-sync-alt"></i>
          </div>
          <div>
            <h3 style="font-size:17px;font-weight:700;margin:0;color:var(--dark,#1f2937)">Atualizar Recorrência</h3>
            <span style="font-size:12px;color:var(--gray-500,#6b7280)">Plano Anual / Série de Agendamentos</span>
          </div>
        </div>

        <p style="font-size:13.5px;color:#4b5563;margin:0 0 18px 0;line-height:1.45">
          Este agendamento faz parte de uma série. Você alterou serviços, duração ou valor. Como deseja aplicar?
        </p>

        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
          <!-- Opção 1: Apenas este agendamento -->
          <label id="label-scope-single" style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border:2px solid #e5e7eb;border-radius:14px;cursor:pointer;background:#f9fafb;transition:all .15s ease">
            <input type="radio" name="rec_scope" value="single" id="rec-scope-single" style="margin-top:3px;accent-color:var(--primary);width:16px;height:16px;cursor:pointer" />
            <div style="flex:1">
              <strong style="display:block;font-size:13.5px;color:#1f2937;line-height:1.3">Apenas este agendamento</strong>
              <small style="display:block;font-size:12px;color:#6b7280;margin-top:2px;line-height:1.35">Altera somente o atendimento do dia selecionado.</small>
            </div>
          </label>

          <!-- Opção 2: Deste em diante -->
          <label id="label-scope-future" style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border:2px solid var(--primary);border-radius:14px;cursor:pointer;background:rgba(59,88,72,0.06);transition:all .15s ease">
            <input type="radio" name="rec_scope" value="future" id="rec-scope-future" checked style="margin-top:3px;accent-color:var(--primary);width:16px;height:16px;cursor:pointer" />
            <div style="flex:1">
              <strong style="display:block;font-size:13.5px;color:var(--primary);line-height:1.3">Deste em diante (este e todos os próximos)</strong>
              <small style="display:block;font-size:12px;color:#4b5563;margin-top:2px;line-height:1.35">Atualiza o serviço, tempo e valor deste agendamento e de todos os atendimentos futuros da mesma série/plano.</small>
            </div>
          </label>
        </div>

        <div style="display:flex;gap:10px">
          <button type="button" id="scope-btn-cancel" class="btn btn-secondary" style="flex:1;padding:10px 16px;font-size:13.5px">Cancelar</button>
          <button type="button" id="scope-btn-confirm" class="btn btn-primary" style="flex:1;padding:10px 16px;font-size:13.5px;font-weight:700">Confirmar</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const rSingle = overlay.querySelector('#rec-scope-single');
    const rFuture = overlay.querySelector('#rec-scope-future');
    const lSingle = overlay.querySelector('#label-scope-single');
    const lFuture = overlay.querySelector('#label-scope-future');

    function updateCardStyles() {
      if (rSingle.checked) {
        lSingle.style.borderColor = 'var(--primary)';
        lSingle.style.background = 'rgba(59,88,72,0.06)';
        lFuture.style.borderColor = '#e5e7eb';
        lFuture.style.background = '#f9fafb';
      } else {
        lFuture.style.borderColor = 'var(--primary)';
        lFuture.style.background = 'rgba(59,88,72,0.06)';
        lSingle.style.borderColor = '#e5e7eb';
        lSingle.style.background = '#f9fafb';
      }
    }

    rSingle.addEventListener('change', updateCardStyles);
    rFuture.addEventListener('change', updateCardStyles);

    function cleanup(val) {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(val);
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        cleanup(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = rFuture.checked ? 'future' : 'single';
        cleanup(selected);
      }
    }
    document.addEventListener('keydown', onKey);

    overlay.querySelector('#scope-btn-cancel').onclick = () => cleanup(null);
    overlay.querySelector('#scope-btn-confirm').onclick = () => {
      const selected = rFuture.checked ? 'future' : 'single';
      cleanup(selected);
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(null);
    });
  });
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

  // Lista de clientes e profissionais disponível globalmente
  window._apptClients = clients;
  window._apptProfessionals = professionals;
  window._apptServices = services;
  const preSelected = appt
    ? clients.find(c => c.id === appt.client_id)
    : (prefillClientId ? clients.find(c => c.id === parseInt(prefillClientId, 10)) : null);

  // Agenda compartilhada: o select mostra TODAS as profissionais, para qualquer usuária.
  const profList = professionals;

  // Define qual profissional virá selecionada no select:
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

  // Inicializa o estado de agendamento simultâneo para novos agendamentos
  if (!isEdit) {
    window._simultaneousState = {
      activeTab: 1,
      prof1: {
        id: targetProfId,
        serviceIds: [...selectedServiceIds],
        customPrice: null
      },
      prof2: {
        id: null,
        serviceIds: [],
        customPrice: null
      }
    };
  } else {
    window._simultaneousState = null;
  }

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
        ${isEdit && (appt && (appt.series_id || appt.recurrence_group_id || appt.parent_id)) ? `
          <div style="background:rgba(59,88,72,0.07);border:1px solid rgba(59,88,72,0.2);border-radius:12px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--primary)">
            <i class="fa fa-sync-alt" style="font-size:14px;flex-shrink:0"></i>
            <span><strong>Agendamento Recorrente:</strong> Este atendimento faz parte de uma série/plano. Ao alterar serviços ou valor, você poderá estender para os agendamentos futuros.</span>
          </div>
        ` : ''}
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

            ${!isEdit ? '<div id="appt-prof-tabs-container" class="appt-prof-tabs-bar tab-professional-container"></div>' : ''}

            <div class="multi-services-list" id="multi-services-list">
              ${services.map(s => {
                const checked = selectedServiceIds.includes(s.id);
                return `
                  <label class="service-check-item ${checked ? 'selected' : ''}" data-service-id="${s.id}">
                    <input type="checkbox" class="service-checkbox" value="${s.id}"
                      data-price="${s.price}" data-duration="${s.duration}" data-name="${esc(s.name)}"
                      ${checked ? 'checked' : ''} onchange="onMultiServiceChange()" />
                    <span class="service-check-name" title="${esc(s.name)}">${esc(s.name)}</span>
                    <span class="service-check-meta">
                      <span class="service-check-duration">${formatDurationBR(s.duration)}</span>
                      <span class="service-check-dot">•</span>
                      <span class="service-check-price">${formatCurrency(s.price)}</span>
                    </span>
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
            <div id="appt-simultaneous-banner" class="appt-simultaneous-banner" style="display:none"></div>
          </div>

          <div class="appt-prof-price-grid">
            <div class="form-group">
              <label id="appt-prof-label">Profissional *</label>
              <select id="appt-professional" required>${profOptions}</select>
            </div>

            <div class="form-group">
              <label id="appt-price-label">Valor (R$) *</label>
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
            <i class="fa fa-info-circle" id="appt-datetime-hint-icon"></i>
            <span id="appt-datetime-hint-text">A duração do serviço é calculada automaticamente na agenda.</span>
          </div>
          <div id="appt-shift-alert" class="alert alert-warning" style="display:none;margin-top:10px;font-size:12.5px;padding:8px 12px;border-radius:8px"></div>
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

      <div class="modal-footer modal-footer-appt">
        ${isEdit ? `<button type="button" class="btn btn-danger btn-appt-delete" onclick="quickCancel(${appt.id}, ${appt.series_id ? `'${appt.series_id}'` : 'null'})"><i class="fa fa-trash"></i> Excluir</button>` : ''}
        <button type="button" class="btn btn-secondary btn-cancel" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-appt-confirm"><i class="fa fa-check"></i> ${isEdit ? 'Salvar Alterações' : 'Confirmar Agendamento'}</button>
      </div>
    </form>
  `;

  // Renderiza as mini-abas no formulário de novo agendamento
  if (!isEdit) {
    renderProfTabs();
  }

  // Listener para atualização do término previsto quando o horário de início é alterado
  const timeInput = document.getElementById('appt-time');
  if (timeInput) {
    timeInput.addEventListener('input', () => updateAppointmentSummary());
    timeInput.addEventListener('change', () => updateAppointmentSummary());
  }

  const profSelect = document.getElementById('appt-professional');
  if (profSelect) {
    profSelect.addEventListener('change', () => {
      if (window._simultaneousState) {
        const state = window._simultaneousState;
        const newId = parseInt(profSelect.value, 10);
        // Evita selecionar a mesma profissional em ambas as abas
        if (state.activeTab === 1 && state.prof2.id && newId === state.prof2.id) {
          toast('Esta profissional já está na 2ª aba. Selecione outra profissional.', 'warning');
          profSelect.value = state.prof1.id;
          return;
        }
        if (state.activeTab === 2 && newId === state.prof1.id) {
          toast('Esta profissional já é a principal (1ª aba). Selecione outra profissional.', 'warning');
          profSelect.value = state.prof2.id;
          return;
        }

        if (state.activeTab === 1) {
          state.prof1.id = newId;
        } else {
          state.prof2.id = newId;
        }
        renderProfTabs();
        loadTabServicesAndPrice();
      }
      updateAppointmentSummary();
    });
  }

  const priceInput = document.getElementById('appt-price');
  if (priceInput) {
    priceInput.addEventListener('input', () => {
      if (window._simultaneousState) {
        const state = window._simultaneousState;
        const activeProf = state.activeTab === 1 ? state.prof1 : state.prof2;
        if (activeProf) {
          activeProf.customPrice = priceInput.value !== '' ? parseFloat(priceInput.value) : null;
        }
      }
      updateAppointmentSummary();
    });
  }

  const encaixeInput = document.getElementById('appt-encaixe');
  if (encaixeInput) {
    encaixeInput.addEventListener('change', () => updateAppointmentSummary());
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

    // Salva o estado da aba ativa antes de submeter
    if (window._simultaneousState) {
      saveActiveTabServicesAndPrice();
    }

    const isSimultaneous = window._simultaneousState &&
      window._simultaneousState.prof2.id &&
      window._simultaneousState.prof2.serviceIds.length > 0;

    const selectedCheckboxes = document.querySelectorAll('#multi-services-list .service-checkbox:checked');
    const selectedServiceIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.value, 10)).filter(Boolean);

    if (isSimultaneous) {
      const s1 = window._simultaneousState.prof1.serviceIds;
      const s2 = window._simultaneousState.prof2.serviceIds;
      if (s1.length === 0) {
        errEl.textContent = 'Selecione ao menos um serviço para a 1ª profissional.';
        errEl.style.display = '';
        return;
      }
      if (s2.length === 0) {
        errEl.textContent = 'Selecione ao menos um serviço para a 2ª profissional.';
        errEl.style.display = '';
        return;
      }
    } else {
      if (selectedServiceIds.length === 0) {
        errEl.textContent = 'Selecione ao menos um serviço para o agendamento.';
        errEl.style.display = '';
        return;
      }
    }

    const planEl = document.getElementById('appt-plan');
    const encaixeEl = document.getElementById('appt-encaixe');
    const dateVal = document.getElementById('appt-date').value;
    const timeVal = document.getElementById('appt-time').value;

    const data = {
      client_id: parseInt(clientId),
      date: dateVal,
      start_time: timeVal,
      status: (document.getElementById('appt-status') ? document.getElementById('appt-status').value : 'scheduled') || 'scheduled',
      payment_method: document.getElementById('appt-payment').value || null,
      notes: document.getElementById('appt-notes').value || null,
      plan: planEl ? (planEl.value || null) : null,
      allow_overlap: encaixeEl ? encaixeEl.checked : false,
    };

    if (isSimultaneous) {
      const st = window._simultaneousState;
      const p1Svcs = (window._apptServices || []).filter(s => st.prof1.serviceIds.includes(s.id));
      const p2Svcs = (window._apptServices || []).filter(s => st.prof2.serviceIds.includes(s.id));
      const p1DefPrice = p1Svcs.reduce((acc, s) => acc + parseFloat(s.price || 0), 0);
      const p2DefPrice = p2Svcs.reduce((acc, s) => acc + parseFloat(s.price || 0), 0);
      const price1 = st.prof1.customPrice !== null ? st.prof1.customPrice : p1DefPrice;
      const price2 = st.prof2.customPrice !== null ? st.prof2.customPrice : p2DefPrice;

      data.simultaneous = [
        {
          professional_id: st.prof1.id,
          service_ids: st.prof1.serviceIds,
          price: price1
        },
        {
          professional_id: st.prof2.id,
          service_ids: st.prof2.serviceIds,
          price: price2
        }
      ];
      // Retrocompatibilidade
      data.professional_id = st.prof1.id;
      data.service_ids = st.prof1.serviceIds;
      data.service_id = st.prof1.serviceIds[0];
      data.price = price1;
    } else {
      data.professional_id = parseInt(document.getElementById('appt-professional').value);
      data.service_id = selectedServiceIds[0];
      data.service_ids = selectedServiceIds;
      data.price = parseFloat(document.getElementById('appt-price').value);
    }

    // Não permite agendar em datas/horários que já passaram (usa fuso local).
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
    }

    // Validação de término previsto vs expediente
    if (!data.allow_overlap && data.start_time) {
      if (isSimultaneous) {
        const st = window._simultaneousState;
        const profs = window._apptProfessionals || [];
        const p1 = profs.find(p => p.id === st.prof1.id);
        const p2 = profs.find(p => p.id === st.prof2.id);
        const svcs1 = (window._apptServices || []).filter(s => st.prof1.serviceIds.includes(s.id));
        const svcs2 = (window._apptServices || []).filter(s => st.prof2.serviceIds.includes(s.id));
        const dur1 = svcs1.reduce((acc, s) => acc + (parseInt(s.duration, 10) || 60), 0);
        const dur2 = svcs2.reduce((acc, s) => acc + (parseInt(s.duration, 10) || 60), 0);

        let shiftViolation = '';
        if (p1 && dur1 > 0) {
          const calcEnd1 = addMinutesToHHMM(data.start_time, dur1);
          const p1EndStr = (p1.work_end_time || '19:30').slice(0, 5);
          const [eh1, em1] = calcEnd1.split(':').map(Number);
          const [peh1, pem1] = p1EndStr.split(':').map(Number);
          if ((eh1 * 60 + em1) > (peh1 * 60 + pem1)) {
            shiftViolation = `O término de <strong>${esc(p1.name)}</strong> (${calcEnd1}) ultrapassa seu expediente (${p1EndStr}).`;
          }
        }
        if (!shiftViolation && p2 && dur2 > 0) {
          const calcEnd2 = addMinutesToHHMM(data.start_time, dur2);
          const p2EndStr = (p2.work_end_time || '19:30').slice(0, 5);
          const [eh2, em2] = calcEnd2.split(':').map(Number);
          const [peh2, pem2] = p2EndStr.split(':').map(Number);
          if ((eh2 * 60 + em2) > (peh2 * 60 + pem2)) {
            shiftViolation = `O término de <strong>${esc(p2.name)}</strong> (${calcEnd2}) ultrapassa seu expediente (${p2EndStr}).`;
          }
        }

        if (shiftViolation) {
          errEl.innerHTML = `
            ${shiftViolation}<br>
            <a href="#" id="enable-encaixe-link" style="font-weight:700;color:var(--primary);text-decoration:underline;display:inline-block;margin-top:6px">
              <i class="fa fa-check-square"></i> Marcar "Permitir encaixe" para confirmar este agendamento
            </a>
          `;
          errEl.style.display = '';
          const link = document.getElementById('enable-encaixe-link');
          if (link) {
            link.onclick = (ev) => {
              ev.preventDefault();
              if (encaixeEl) encaixeEl.checked = true;
              updateAppointmentSummary();
              document.getElementById('appt-form').requestSubmit();
            };
          }
          return;
        }
      } else {
        const selectedProf = (window._apptProfessionals || []).find(p => p.id === data.professional_id);
        if (selectedProf) {
          const totalDur = Array.from(selectedCheckboxes).reduce((acc, cb) => acc + (parseInt(cb.dataset.duration, 10) || 60), 0);
          const calculatedEnd = addMinutesToHHMM(data.start_time, totalDur);
          const profEndStr = (selectedProf.work_end_time || '19:30').slice(0, 5);
          const [eh, em] = calculatedEnd.split(':').map(Number);
          const endMins = eh * 60 + em;
          const [peh, pem] = profEndStr.split(':').map(Number);
          const profEndMins = peh * 60 + pem;

          if (endMins > profEndMins) {
            errEl.innerHTML = `
              O término previsto (<strong>${calculatedEnd}</strong>) ultrapassa o encerramento do expediente de <strong>${esc(selectedProf.name)}</strong> (${profEndStr}).<br>
              <a href="#" id="enable-encaixe-link" style="font-weight:700;color:var(--primary);text-decoration:underline;display:inline-block;margin-top:6px">
                <i class="fa fa-check-square"></i> Marcar "Permitir encaixe" para confirmar este agendamento
              </a>
            `;
            errEl.style.display = '';
            const link = document.getElementById('enable-encaixe-link');
            if (link) {
              link.onclick = (ev) => {
                ev.preventDefault();
                if (encaixeEl) encaixeEl.checked = true;
                updateAppointmentSummary();
                document.getElementById('appt-form').requestSubmit();
              };
            }
            return;
          }
        }
      }
    }

    if (isEdit) {
      const isRecurring = !!(appt && (appt.series_id || appt.recurrence_group_id || appt.parent_id));
      if (isRecurring) {
        // 1. Verifica se os serviços selecionados mudaram
        const origSvcIds = (appt.service_ids && appt.service_ids.length > 0 ? appt.service_ids : (appt.service_id ? [appt.service_id] : [])).map(Number).sort();
        const currSvcIds = (data.service_ids || []).map(Number).sort();
        const servicesChanged = origSvcIds.length !== currSvcIds.length || origSvcIds.some((id, idx) => id !== currSvcIds[idx]);

        // 2. Verifica se o preço mudou
        const origPrice = parseFloat(appt.price || 0);
        const currPrice = parseFloat(data.price || 0);
        const priceChanged = Math.abs(origPrice - currPrice) > 0.009;

        // 3. Verifica se a duração total mudou
        const origDuration = parseInt(appt.service_duration, 10) || 60;
        const currDuration = Array.from(selectedCheckboxes).reduce((acc, cb) => acc + (parseInt(cb.dataset.duration, 10) || 60), 0);
        const durationChanged = origDuration !== currDuration;

        if (servicesChanged || priceChanged || durationChanged) {
          const chosenScope = await showRecurrenceScopeDialog();
          if (!chosenScope) {
            // Usuário cancelou ou fechou a caixa de diálogo -> mantém na tela de edição
            return;
          }
          data.update_scope = chosenScope;
        } else {
          data.update_scope = 'single';
        }
      } else {
        data.update_scope = 'single';
      }
    }

    try {
      if (isEdit) {
        const r = await api.updateAppointment(appt.id, data);
        const msg = (r && r.message) ? r.message : (data.update_scope === 'future' && r && r.future_count
          ? `Este e mais ${r.future_count} agendamentos futuros foram atualizados com o novo serviço!`
          : 'Agendamento atualizado com sucesso!');
        toast(msg, 'success');
      } else if (data.plan) {
        const r = await api.createAppointment(data);
        const skipped = (r && r.skipped) ? r.skipped.length : 0;
        toast(
          `Plano criado: ${r.created} agendamento(s)` + (skipped ? `, ${skipped} pulado(s) por conflito.` : '.'),
          'success'
        );
      } else {
        const r = await api.createAppointment(data);
        if (r && r.simultaneous) {
          toast('Agendamentos simultâneos criados com sucesso!', 'success');
        } else {
          toast('Agendamento criado!', 'success');
        }
      }
      closeModal();
      refreshCurrentPage();
    } catch (err) {
      // Conflito de horário: oferece o encaixe explícito (não vale para planos).
      if (err.status === 409 && !data.plan && !data.allow_overlap) {
        errEl.innerHTML =
          (err.message || 'Este horário já está ocupado.') + ' ' +
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

// ===== CONTROLE DE MINI-ABAS (AGENDAMENTO SIMULTÂNEO) =====
function renderProfTabs() {
  const container = document.getElementById('appt-prof-tabs-container');
  if (!container || !window._simultaneousState) return;

  const state = window._simultaneousState;
  const profs = window._apptProfessionals || [];
  const p1 = profs.find(p => p.id === state.prof1.id) || { name: 'Profissional 1', color: '#4E6754' };
  const p2 = state.prof2.id ? profs.find(p => p.id === state.prof2.id) : null;

  const count1 = state.prof1.serviceIds.length;
  const count2 = state.prof2.serviceIds.length;

  let html = `
    <style>
      #appt-prof-tabs-container, .appt-prof-tabs-bar, .tab-professional-container {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        margin-bottom: 8px !important;
        position: relative !important;
        flex-wrap: wrap !important;
      }
      .appt-prof-tab-btn, .tab-professional {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 6px !important;
        padding: 6px 12px !important;
        border-radius: 20px !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        border: 1.5px solid #e2e8f0 !important;
        background-color: #f8fafc !important;
        color: #374151 !important;
        cursor: pointer !important;
        outline: none !important;
        line-height: 1.2 !important;
        user-select: none !important;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04) !important;
        white-space: nowrap !important;
      }
      .appt-prof-tab-btn:hover, .tab-professional:hover {
        background-color: #f1f5f9 !important;
        border-color: #cbd5e1 !important;
        color: #212F27 !important;
      }
      .appt-prof-tab-btn.active, .tab-professional.active {
        background-color: rgba(78, 103, 84, 0.12) !important;
        border-color: #4E6754 !important;
        color: #4E6754 !important;
        font-weight: 700 !important;
      }
      .appt-prof-tab-add-btn, .btn-add-partner {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 6px !important;
        padding: 6px 12px !important;
        border-radius: 20px !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        border: 1.5px dashed #94a3b8 !important;
        background-color: #ffffff !important;
        color: #4E6754 !important;
        cursor: pointer !important;
        outline: none !important;
        line-height: 1.2 !important;
        user-select: none !important;
        white-space: nowrap !important;
      }
      .appt-prof-tab-add-btn:hover, .btn-add-partner:hover {
        border-color: #4E6754 !important;
        background-color: rgba(78, 103, 84, 0.08) !important;
      }
    </style>
    <button type="button" class="appt-prof-tab-btn tab-professional ${state.activeTab === 1 ? 'active' : ''}" onclick="switchApptProfTab(1)">
      <span class="appt-prof-tab-dot" style="background:${p1.color || '#4E6754'}"></span>
      <span>${esc(p1.name)}</span>
      <span class="appt-prof-tab-badge" id="tab1-badge">${count1}</span>
    </button>
  `;

  if (p2) {
    html += `
      <button type="button" class="appt-prof-tab-btn tab-professional ${state.activeTab === 2 ? 'active' : ''}" onclick="switchApptProfTab(2)">
        <span class="appt-prof-tab-dot" style="background:${p2.color || '#3b82f6'}"></span>
        <span>${esc(p2.name)}</span>
        <span class="appt-prof-tab-badge" id="tab2-badge">${count2}</span>
        <span class="appt-prof-tab-remove" onclick="removeProf2Tab(event)" title="Remover 2ª profissional">
          <i class="fa fa-times"></i>
        </span>
      </button>
    `;
  } else {
    // Lista de profissionais disponíveis para a 2ª aba (exceto a principal)
    const availableOthers = profs.filter(p => p.id !== state.prof1.id);
    if (availableOthers.length > 0) {
      html += `
        <div class="appt-prof-tab-add-wrapper">
          <button type="button" class="appt-prof-tab-add-btn btn-add-partner" id="btn-add-prof2" onclick="toggleProf2Popover(event)">
            <i class="fa fa-plus"></i> Incluir 2ª Profissional
          </button>
          <div class="appt-prof2-popover" id="appt-prof2-popover" style="display:none">
            <div class="appt-prof2-popover-title">Selecionar colega:</div>
            ${availableOthers.map(p => `
              <button type="button" class="appt-prof2-popover-item" onclick="selectProf2Tab(${p.id})">
                <span class="appt-prof-tab-dot" style="background:${p.color}"></span>
                <span>${esc(p.name)}</span>
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }
  }

  container.innerHTML = html;
}

function toggleProf2Popover(event) {
  if (event) event.stopPropagation();
  const pop = document.getElementById('appt-prof2-popover');
  if (pop) {
    pop.style.display = pop.style.display === 'none' ? 'block' : 'none';
  }
}

function selectProf2Tab(profId) {
  if (!window._simultaneousState) return;
  saveActiveTabServicesAndPrice();

  const state = window._simultaneousState;
  state.prof2.id = profId;
  state.prof2.serviceIds = [];
  state.prof2.customPrice = null;

  // Fecha popover
  const pop = document.getElementById('appt-prof2-popover');
  if (pop) pop.style.display = 'none';

  // Alterna imediatamente para a nova aba
  state.activeTab = 2;
  renderProfTabs();
  loadTabServicesAndPrice();
  updateAppointmentSummary();
}

function removeProf2Tab(event) {
  if (event) event.stopPropagation();
  if (!window._simultaneousState) return;

  const state = window._simultaneousState;
  state.prof2.id = null;
  state.prof2.serviceIds = [];
  state.prof2.customPrice = null;
  state.activeTab = 1;

  renderProfTabs();
  loadTabServicesAndPrice();
  updateAppointmentSummary();
}

function switchApptProfTab(tabNumber) {
  if (!window._simultaneousState) return;
  const state = window._simultaneousState;
  if (state.activeTab === tabNumber) return;

  saveActiveTabServicesAndPrice();
  state.activeTab = tabNumber;
  renderProfTabs();
  loadTabServicesAndPrice();
  updateAppointmentSummary();
}

function saveActiveTabServicesAndPrice() {
  if (!window._simultaneousState) return;
  const state = window._simultaneousState;
  const activeProf = state.activeTab === 1 ? state.prof1 : state.prof2;
  if (!activeProf) return;

  const checkboxes = document.querySelectorAll('#multi-services-list .service-checkbox:checked');
  activeProf.serviceIds = Array.from(checkboxes).map(cb => parseInt(cb.value, 10)).filter(Boolean);

  const priceInput = document.getElementById('appt-price');
  if (priceInput && priceInput.value !== '') {
    activeProf.customPrice = parseFloat(priceInput.value) || 0;
  }
}

function loadTabServicesAndPrice() {
  if (!window._simultaneousState) return;
  const state = window._simultaneousState;
  const activeProf = state.activeTab === 1 ? state.prof1 : state.prof2;
  const profs = window._apptProfessionals || [];
  const p = profs.find(pr => pr.id === activeProf.id);

  // Atualiza checkboxes
  const checkboxes = document.querySelectorAll('#multi-services-list .service-checkbox');
  let tabTotalPrice = 0;
  let tabCount = 0;

  checkboxes.forEach(cb => {
    const id = parseInt(cb.value, 10);
    const checked = activeProf.serviceIds.includes(id);
    cb.checked = checked;
    const parentLabel = cb.closest('.service-check-item');
    if (checked) {
      tabCount++;
      if (parentLabel) parentLabel.classList.add('selected');
      tabTotalPrice += parseFloat(cb.dataset.price) || 0;
    } else {
      if (parentLabel) parentLabel.classList.remove('selected');
    }
  });

  const countBadge = document.getElementById('services-badge-count');
  if (countBadge) {
    countBadge.textContent = `${tabCount} selecionado(s)`;
  }

  // Atualiza select de profissional para refletir a profissional da aba
  const profSelect = document.getElementById('appt-professional');
  if (profSelect && activeProf.id) {
    profSelect.value = activeProf.id;
  }

  // Atualiza labels para maior clareza quando a 2ª profissional estiver ativa
  const profLabel = document.getElementById('appt-prof-label');
  if (profLabel) {
    profLabel.innerHTML = state.prof2.id
      ? `Profissional (${state.activeTab === 1 ? '1ª' : '2ª'} - ${esc(p ? p.name : '')}) *`
      : 'Profissional *';
  }

  const priceLabel = document.getElementById('appt-price-label');
  if (priceLabel) {
    priceLabel.innerHTML = state.prof2.id
      ? `Valor ${esc(p ? p.name : '')} (R$) *`
      : 'Valor (R$) *';
  }

  // Atualiza input de preço
  const priceInput = document.getElementById('appt-price');
  if (priceInput) {
    const priceVal = (activeProf.customPrice !== null) ? activeProf.customPrice : tabTotalPrice;
    priceInput.value = priceVal > 0 ? priceVal.toFixed(2) : '0.00';
  }
}

// Torna os métodos de aba acessíveis globalmente aos atributos onclick
window.toggleProf2Popover = toggleProf2Popover;
window.selectProf2Tab = selectProf2Tab;
window.removeProf2Tab = removeProf2Tab;
window.switchApptProfTab = switchApptProfTab;

// Fecha popover ao clicar fora
document.addEventListener('click', (e) => {
  const pop = document.getElementById('appt-prof2-popover');
  const btn = document.getElementById('btn-add-prof2');
  if (pop && pop.style.display !== 'none') {
    if (!pop.contains(e.target) && (!btn || !btn.contains(e.target))) {
      pop.style.display = 'none';
    }
  }
});

function onMultiServiceChange(autoFillPrice = true) {
  const checkboxes = document.querySelectorAll('#multi-services-list .service-checkbox');
  const countBadge = document.getElementById('services-badge-count');
  let currentTabMinutes = 0;
  let currentTabPrice = 0;
  let count = 0;
  const currentCheckedIds = [];

  checkboxes.forEach(cb => {
    const parentLabel = cb.closest('.service-check-item');
    if (cb.checked) {
      count++;
      if (parentLabel) parentLabel.classList.add('selected');
      const dur = parseInt(cb.dataset.duration, 10) || 60;
      const pr  = parseFloat(cb.dataset.price) || 0;
      currentTabMinutes += dur;
      currentTabPrice += pr;
      currentCheckedIds.push(parseInt(cb.value, 10));
    } else {
      if (parentLabel) parentLabel.classList.remove('selected');
    }
  });

  if (countBadge) {
    countBadge.textContent = `${count} selecionado(s)`;
  }

  // Sincroniza serviços e preço no estado da aba ativa
  if (window._simultaneousState) {
    const state = window._simultaneousState;
    const activeProf = state.activeTab === 1 ? state.prof1 : state.prof2;
    if (activeProf) {
      activeProf.serviceIds = currentCheckedIds;
      if (autoFillPrice) {
        activeProf.customPrice = null;
      }
    }
    const tabBadge = document.getElementById(`tab${state.activeTab}-badge`);
    if (tabBadge) tabBadge.textContent = count;
  }

  if (autoFillPrice) {
    const priceInput = document.getElementById('appt-price');
    if (priceInput) {
      priceInput.value = currentTabPrice > 0 ? currentTabPrice.toFixed(2) : '0.00';
    }
  }

  updateAppointmentSummary();
}

function updateAppointmentSummary(knownMins = null, knownPrice = null) {
  const timeInput = document.getElementById('appt-time');
  const startTime = timeInput ? timeInput.value : '';
  const durEl = document.getElementById('summary-total-duration');
  const prEl = document.getElementById('summary-total-price');
  const endEl = document.getElementById('summary-end-time');
  const hintText = document.getElementById('appt-datetime-hint-text');
  const shiftAlert = document.getElementById('appt-shift-alert');
  const banner = document.getElementById('appt-simultaneous-banner');
  const encaixeEl = document.getElementById('appt-encaixe');
  const isEncaixe = encaixeEl ? encaixeEl.checked : false;

  const profs = window._apptProfessionals || [];
  const allSvcs = window._apptServices || [];

  // Se agendamento simultâneo com 2ª profissional ativa
  if (window._simultaneousState && window._simultaneousState.prof2.id) {
    const state = window._simultaneousState;
    const p1 = profs.find(p => p.id === state.prof1.id) || { name: 'Profissional 1', work_start_time: '08:00', work_end_time: '19:30' };
    const p2 = profs.find(p => p.id === state.prof2.id) || { name: 'Profissional 2', work_start_time: '08:00', work_end_time: '19:30' };

    const svcs1 = allSvcs.filter(s => state.prof1.serviceIds.includes(s.id));
    const svcs2 = allSvcs.filter(s => state.prof2.serviceIds.includes(s.id));

    const dur1 = svcs1.reduce((acc, s) => acc + (parseInt(s.duration, 10) || 60), 0);
    const dur2 = svcs2.reduce((acc, s) => acc + (parseInt(s.duration, 10) || 60), 0);

    const p1DefPrice = svcs1.reduce((acc, s) => acc + parseFloat(s.price || 0), 0);
    const p2DefPrice = svcs2.reduce((acc, s) => acc + parseFloat(s.price || 0), 0);

    const price1 = state.prof1.customPrice !== null ? state.prof1.customPrice : p1DefPrice;
    const price2 = state.prof2.customPrice !== null ? state.prof2.customPrice : p2DefPrice;

    // Duração simultânea = maior duração entre as duas profissionais
    const maxDur = Math.max(dur1, dur2);
    const totalPrice = price1 + price2;
    const endTime = startTime && maxDur > 0 ? addMinutesToHHMM(startTime, maxDur) : '--:--';

    if (durEl) {
      durEl.textContent = maxDur > 0 ? formatDurationBR(maxDur) : '0min';
    }

    if (prEl) {
      prEl.textContent = formatCurrency(totalPrice);
    }

    if (banner) {
      if (dur1 > 0 && dur2 > 0) {
        banner.innerHTML = `
          <div class="appt-simultaneous-banner-header">
            <i class="fa fa-users" style="color:var(--primary);flex-shrink:0"></i>
            <strong>Atendimento Simultâneo:</strong>
          </div>
          <span class="appt-summary-detail-line">• <strong>${esc(p1.name)}:</strong> ${dur1}m · ${formatCurrency(price1)}</span>
          <span class="appt-summary-detail-line">• <strong>${esc(p2.name)}:</strong> ${dur2}m · ${formatCurrency(price2)}</span>
        `;
        banner.style.display = 'flex';
      } else if (dur1 > 0 || dur2 > 0) {
        const activeName = dur1 > 0 ? esc(p1.name) : esc(p2.name);
        const activeDur = dur1 > 0 ? dur1 : dur2;
        const activePrice = dur1 > 0 ? price1 : price2;
        const waitingName = dur1 > 0 ? esc(p2.name) : esc(p1.name);
        banner.innerHTML = `
          <div class="appt-simultaneous-banner-header">
            <i class="fa fa-users" style="color:var(--primary);flex-shrink:0"></i>
            <strong>Atendimento Simultâneo:</strong>
          </div>
          <span class="appt-summary-detail-line">• <strong>${activeName}:</strong> ${activeDur}m · ${formatCurrency(activePrice)}</span>
          <span class="appt-summary-detail-line" style="color:#94a3b8">• <em>Aguardando serviços de ${waitingName}...</em></span>
        `;
        banner.style.display = 'flex';
      } else {
        banner.style.display = 'none';
        banner.innerHTML = '';
      }
    }

    // Checagem de expediente individual para ambas as profissionais
    let exceedsShift = false;
    let shiftMsg = '';
    if (startTime && maxDur > 0 && endTime !== '--:--') {
      if (dur1 > 0) {
        const end1 = addMinutesToHHMM(startTime, dur1);
        const p1EndStr = (p1.work_end_time || '19:30').slice(0, 5);
        const [eh1, em1] = end1.split(':').map(Number);
        const [peh1, pem1] = p1EndStr.split(':').map(Number);
        if ((eh1 * 60 + em1) > (peh1 * 60 + pem1)) {
          exceedsShift = true;
          shiftMsg += `Término de <strong>${esc(p1.name)}</strong> (${end1}) ultrapassa expediente (${p1EndStr}). `;
        }
      }
      if (dur2 > 0) {
        const end2 = addMinutesToHHMM(startTime, dur2);
        const p2EndStr = (p2.work_end_time || '19:30').slice(0, 5);
        const [eh2, em2] = end2.split(':').map(Number);
        const [peh2, pem2] = p2EndStr.split(':').map(Number);
        if ((eh2 * 60 + em2) > (peh2 * 60 + pem2)) {
          exceedsShift = true;
          shiftMsg += `Término de <strong>${esc(p2.name)}</strong> (${end2}) ultrapassa expediente (${p2EndStr}). `;
        }
      }
    }

    if (hintText) {
      if (startTime && maxDur > 0) {
        hintText.innerHTML = `Atendimento simultâneo das <strong>${startTime}</strong> às <strong>${endTime}</strong> (duração máx: <strong>${formatDurationBR(maxDur)}</strong>).`;
      } else {
        hintText.innerHTML = 'A duração total corresponde ao serviço de maior tempo entre as duas profissionais.';
      }
    }

    if (exceedsShift) {
      if (!isEncaixe) {
        if (shiftAlert) {
          shiftAlert.className = 'alert alert-error';
          shiftAlert.innerHTML = `<i class="fa fa-exclamation-triangle"></i> ${shiftMsg} Marque <strong>"Permitir encaixe (sobrepor horário)"</strong> se deseja prosseguir.`;
          shiftAlert.style.display = 'block';
        }
        if (endEl) endEl.innerHTML = `<span style="color:var(--danger)">${endTime} ⚠️</span>`;
      } else {
        if (shiftAlert) {
          shiftAlert.className = 'alert alert-info';
          shiftAlert.style.background = '#f0fdf4';
          shiftAlert.style.borderColor = '#bbf7d0';
          shiftAlert.style.color = '#166534';
          shiftAlert.innerHTML = `<i class="fa fa-check-circle" style="color:var(--success)"></i> Encaixe ativado: término às <strong>${endTime}</strong> permitido além do expediente.`;
          shiftAlert.style.display = 'block';
        }
        if (endEl) endEl.innerHTML = `<span style="color:var(--primary)">${endTime} <small style="font-weight:600;font-size:11px">(Encaixe)</small></span>`;
      }
    } else {
      if (shiftAlert) {
        shiftAlert.style.display = 'none';
        shiftAlert.innerHTML = '';
      }
      if (endEl) endEl.textContent = endTime;
    }
    return;
  }

  // Fluxo normal (única profissional ou modo edição)
  if (banner) {
    banner.style.display = 'none';
    banner.innerHTML = '';
  }

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

  if (durEl) durEl.textContent = formatDurationBR(totalMinutes);
  if (prEl) prEl.textContent = formatCurrency(totalPrice);

  const endTime = startTime && totalMinutes > 0 ? addMinutesToHHMM(startTime, totalMinutes) : '--:--';
  const profSelect = document.getElementById('appt-professional');
  const profId = profSelect ? parseInt(profSelect.value, 10) : null;
  const prof = profs.find(p => p.id === profId);

  let exceedsShift = false;
  let profEndStr = '19:30';
  let profStartStr = '08:00';

  if (prof) {
    profStartStr = (prof.work_start_time || '08:00').slice(0, 5);
    profEndStr   = (prof.work_end_time   || '19:30').slice(0, 5);
  }

  if (startTime && totalMinutes > 0 && endTime !== '--:--') {
    const [eh, em] = endTime.split(':').map(Number);
    const endMins = eh * 60 + em;
    const [peh, pem] = profEndStr.split(':').map(Number);
    const profEndMins = peh * 60 + pem;
    if (endMins > profEndMins) {
      exceedsShift = true;
    }
  }

  if (hintText) {
    if (startTime && totalMinutes > 0) {
      hintText.innerHTML = `Atendimento das <strong>${startTime}</strong> às <strong>${endTime}</strong> (duração total: <strong>${formatDurationBR(totalMinutes)}</strong>). Expediente: <strong>${profStartStr} às ${profEndStr}</strong>.`;
    } else {
      hintText.innerHTML = `A duração do serviço é calculada automaticamente na agenda. Expediente: <strong>${profStartStr} às ${profEndStr}</strong>.`;
    }
  }

  if (exceedsShift) {
    if (!isEncaixe) {
      if (shiftAlert) {
        shiftAlert.className = 'alert alert-error';
        shiftAlert.innerHTML = `<i class="fa fa-exclamation-triangle"></i> Término previsto (<strong>${endTime}</strong>) ultrapassa o expediente de <strong>${esc(prof ? prof.name : '')}</strong> (encerra às <strong>${profEndStr}</strong>). Marque <strong>"Permitir encaixe (sobrepor horário)"</strong> abaixo se deseja prosseguir.`;
        shiftAlert.style.display = 'block';
      }
      if (endEl) endEl.innerHTML = `<span style="color:var(--danger)">${endTime} ⚠️</span>`;
    } else {
      if (shiftAlert) {
        shiftAlert.className = 'alert alert-info';
        shiftAlert.style.background = '#f0fdf4';
        shiftAlert.style.borderColor = '#bbf7d0';
        shiftAlert.style.color = '#166534';
        shiftAlert.innerHTML = `<i class="fa fa-check-circle" style="color:var(--success)"></i> Encaixe ativado: término às <strong>${endTime}</strong> permitido além do expediente (${profEndStr}).`;
        shiftAlert.style.display = 'block';
      }
      if (endEl) endEl.innerHTML = `<span style="color:var(--primary)">${endTime} <small style="font-weight:600;font-size:11px">(Encaixe)</small></span>`;
    }
  } else {
    if (shiftAlert) {
      shiftAlert.style.display = 'none';
      shiftAlert.innerHTML = '';
    }
    if (endEl) endEl.textContent = endTime;
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
