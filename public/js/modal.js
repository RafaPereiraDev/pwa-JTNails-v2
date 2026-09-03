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
async function openNewAppointment(prefillDate = null, prefillProfId = null) {
  openModal('Novo Agendamento', '<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>', 'modal-lg');
  try {
    const [clients, professionals, services] = await Promise.all([
      api.getClients(),
      api.getProfessionals(true),
      api.getServices(true)
    ]);
    renderAppointmentForm(null, { clients, professionals, services, prefillDate, prefillProfId });
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
  const color = appt.professional_color || '#e91e8c';

  // Uma atendente (com professional_id, exceto master) só pode AGIR sobre agendamentos
  // da própria agenda. Nos da colega, os detalhes aparecem apenas para leitura.
  const ehAtendente = currentUser && currentUser.professional_id && currentUser.role !== 'master';
  const isOwn = !ehAtendente || appt.professional_id === currentUser.professional_id;

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
      <button class="appt-action-btn" style="background:#ef4444" onclick="quickCancel(${appt.id})">
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
        <i class="fa fa-calendar"></i> ${formatDate(appt.date)} às ${appt.start_time}–${appt.end_time}
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
      <button class="appt-action-btn" style="background:#25d366" onclick="sendReminderWpp('${esc(appt.client_phone)}','${esc(appt.client_name).replace(/'/g,'&#39;')}','${appt.date}','${appt.start_time}','${esc(appt.service_name).replace(/'/g,'&#39;')}')">
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

async function quickCancel(id) {
  const ok = await confirmDialog('Tem certeza que deseja <strong>cancelar</strong> este agendamento?');
  if (!ok) return;
  try {
    await api.deleteAppointment(id);
    toast('Agendamento cancelado', 'warning');
    closeModal();
    refreshCurrentPage();
  } catch (e) {
    toast(e.message, 'error');
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
  openModal('Editar Agendamento', '<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>', 'modal-lg');
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

function renderAppointmentForm(appt, { clients, professionals, services, prefillDate, prefillProfId }) {
  const isEdit = !!appt;
  const today = getTodayStr();

  // Lista de clientes disponível para o autocomplete de busca
  window._apptClients = clients;
  const preSelected = appt ? clients.find(c => c.id === appt.client_id) : null;

  // Uma atendente (com professional_id, exceto master) só agenda na própria agenda:
  // o select de profissional mostra apenas ela mesma. O master vê todas.
  const ehAtendente = currentUser.professional_id && currentUser.role !== 'master';
  const profList = ehAtendente
    ? professionals.filter(p => p.id === currentUser.professional_id)
    : professionals;

  const profOptions = profList.map(p =>
    `<option value="${p.id}" ${
      (appt && appt.professional_id === p.id) ||
      (!appt && prefillProfId && parseInt(prefillProfId) === p.id) ||
      (!appt && !prefillProfId && currentUser.professional_id === p.id)
        ? 'selected' : ''
    }>${esc(p.name)}</option>`
  ).join('');

  const svcOptions = services.map(s =>
    `<option value="${s.id}" data-price="${s.price}" data-duration="${s.duration}" ${appt && appt.service_id === s.id ? 'selected' : ''}>${esc(s.name)} - ${formatCurrency(s.price)}</option>`
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
      <div class="form-row mb-4">
        <div class="form-group">
          <label>Cliente *</label>
          <div style="display:flex;gap:8px;align-items:flex-start;flex-direction:column">
            <div style="display:flex;gap:8px;width:100%;position:relative">
              <div style="flex:1;position:relative">
                <input type="text" id="appt-client-search" autocomplete="off"
                  placeholder="Buscar por nome ou telefone..."
                  value="${preSelected ? esc(preSelected.name) + ' - ' + formatPhone(preSelected.phone) : ''}"
                  oninput="onClientSearch()" onfocus="onClientSearch()" style="width:100%" />
                <input type="hidden" id="appt-client" value="${preSelected ? preSelected.id : ''}" required />
                <div id="client-suggestions" class="client-suggestions" style="display:none"></div>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" onclick="openQuickClient()" title="Novo cliente">
                <i class="fa fa-plus"></i>
              </button>
            </div>
            <div id="client-reliability-hint" style="min-height:20px"></div>
          </div>
        </div>
        <div class="form-group">
          <label>Profissional *</label>
          <select id="appt-professional" required>${profOptions}</select>
        </div>
      </div>
      <div class="form-row mb-4">
        <div class="form-group">
          <label>Serviço *</label>
          <select id="appt-service" required onchange="onServiceChange()">${svcOptions}</select>
        </div>
        <div class="form-group">
          <label>Valor (R$) *</label>
          <input type="number" id="appt-price" step="0.01" min="0" value="${appt ? appt.price : ''}" required />
        </div>
      </div>
      <div class="form-row mb-4">
        <div class="form-group">
          <label>Data *</label>
          <input type="date" id="appt-date" value="${appt ? appt.date : (prefillDate || today)}" required />
        </div>
        <div class="form-group">
          <label>Horário *</label>
          <input type="time" id="appt-time" value="${appt ? appt.start_time : ''}" required />
        </div>
      </div>
      <div class="form-row mb-4">
        <div class="form-group">
          <label>Status</label>
          <select id="appt-status">${statusOptions}</select>
        </div>
        <div class="form-group">
          <label>Forma de Pagamento</label>
          <select id="appt-payment">${payOptions}</select>
        </div>
      </div>
      <div class="form-group mb-4">
        <label>Observações</label>
        <textarea id="appt-notes" rows="2">${appt ? esc(appt.notes || '') : ''}</textarea>
      </div>
      <div id="appt-error" class="alert alert-error" style="display:none"></div>
      <div class="modal-footer" style="padding:0;margin-top:8px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        ${isEdit ? `<button type="button" class="btn btn-danger" onclick="quickCancel(${appt.id})"><i class="fa fa-trash"></i> Excluir</button>` : ''}
        <button type="submit" class="btn btn-primary"><i class="fa fa-save"></i> ${isEdit ? 'Salvar' : 'Agendar'}</button>
      </div>
    </form>
  `;

  // Auto-fill price on load
  if (!isEdit) onServiceChange();
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

    const data = {
      client_id: parseInt(clientId),
      professional_id: parseInt(document.getElementById('appt-professional').value),
      service_id: parseInt(document.getElementById('appt-service').value),
      date: document.getElementById('appt-date').value,
      start_time: document.getElementById('appt-time').value,
      price: parseFloat(document.getElementById('appt-price').value),
      status: document.getElementById('appt-status').value,
      payment_method: document.getElementById('appt-payment').value || null,
      notes: document.getElementById('appt-notes').value || null
    };

    try {
      if (isEdit) {
        await api.updateAppointment(appt.id, data);
        toast('Agendamento atualizado!', 'success');
      } else {
        await api.createAppointment(data);
        toast('Agendamento criado!', 'success');
      }
      closeModal();
      refreshCurrentPage();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
    }
  });
}

function onServiceChange() {
  const sel = document.getElementById('appt-service');
  if (!sel || !sel.selectedOptions[0]) return;
  const opt = sel.selectedOptions[0];
  const price = opt.dataset.price;
  const priceInput = document.getElementById('appt-price');
  if (priceInput && price) priceInput.value = parseFloat(price).toFixed(2);
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
      <div class="form-group">
        <label>Nome *</label>
        <input type="text" id="qc-name" required placeholder="Nome da cliente" />
      </div>
      <div class="form-group">
        <label>Telefone *</label>
        <input type="tel" id="qc-phone" required placeholder="(11) 99999-9999" />
      </div>
      <div id="qc-error" class="alert alert-error" style="display:none"></div>
      <div class="modal-footer" style="padding:0;margin-top:16px">
        <button type="button" class="btn btn-secondary" onclick="restoreAppointmentModal()">Voltar</button>
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
