// ===== CLIENTS PAGE =====
let clientSearchTimer = null;

async function loadClients() {
  const container = document.getElementById('page-clients');
  container.innerHTML = `
    <div class="page-header">
      <h2>Clientes</h2>
      <button class="btn btn-primary" onclick="openClientModal()">
        <i class="fa fa-plus"></i> Novo Cliente
      </button>
    </div>
    <div class="search-bar">
      <div class="search-input-wrap">
        <i class="fa fa-search"></i>
        <input type="text" id="client-search" placeholder="Buscar por nome ou telefone..." oninput="debounceClientSearch()" />
      </div>
    </div>
    <div id="clients-table-container"></div>
  `;
  await renderClientsTable();
}

async function renderClientsTable(search = '') {
  const container = document.getElementById('clients-table-container');
  loading(container);
  try {
    const clients = await api.getClients(search);
    if (clients.length === 0) {
      container.innerHTML = `<div class="card"><div class="card-body">${emptyState('Nenhum cliente encontrado', 'fa-users')}</div></div>`;
      return;
    }

    container.innerHTML = `
      <div class="card">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Telefone</th>
                <th>Último atendimento</th>
                <th>Atendimentos</th>
                <th>Total gasto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${clients.map(c => `
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:10px">
                      <div class="client-avatar">${getInitials(c.name)}</div>
                      <div>
                        <div class="font-semibold">${c.name}</div>
                        <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
                          ${reliabilityBadge(c.reliability || 'new')}
                          ${c.email ? `<span class="text-xs text-muted">${c.email}</span>` : ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <a href="tel:${c.phone}" style="color:var(--gray-700)">${formatPhone(c.phone)}</a>
                    <button class="btn btn-xs whatsapp-btn" style="margin-left:4px" onclick="sendWhatsApp('${c.phone}', '${c.name.replace(/'/g,'')}')" title="WhatsApp">
                      <i class="fab fa-whatsapp"></i>
                    </button>
                  </td>
                  <td>${c.last_appointment ? formatDate(c.last_appointment) : '<span class="text-muted">-</span>'}</td>
                  <td><span class="font-semibold">${c.total_appointments || 0}</span></td>
                  <td><span style="color:var(--primary);font-weight:700">${formatCurrency(c.total_spent)}</span></td>
                  <td>
                    <div style="display:flex;gap:6px">
                      <button class="btn btn-secondary btn-xs" onclick="openClientDetail(${c.id})" title="Ver histórico">
                        <i class="fa fa-eye"></i>
                      </button>
                      <button class="btn btn-secondary btn-xs" onclick="openClientModal(${c.id})" title="Editar">
                        <i class="fa fa-edit"></i>
                      </button>
                      <button class="btn btn-secondary btn-xs" onclick="openNewAppointment(null, null, ${c.id})" title="Novo agendamento">
                        <i class="fa fa-calendar-plus"></i>
                      </button>
                      ${currentUser.role === 'admin' ? `
                      <button class="btn btn-danger btn-xs" onclick="deleteClientConfirm(${c.id})" title="Excluir cliente">
                        <i class="fa fa-trash"></i>
                      </button>` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div style="padding:12px 16px;color:var(--gray-500);font-size:13px">${clients.length} cliente(s) encontrado(s)</div>
      </div>
    `;
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

function debounceClientSearch() {
  clearTimeout(clientSearchTimer);
  clientSearchTimer = setTimeout(() => {
    const search = document.getElementById('client-search')?.value || '';
    renderClientsTable(search);
  }, 400);
}

function sendWhatsApp(phone, name) {
  const msg = `Olá, ${name}! Como posso te ajudar?`;
  window.open(whatsappLink(phone, msg), '_blank');
}

async function openClientDetail(id) {
  openModal('Perfil do Cliente', '<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>', 'modal-lg');
  try {
    const client = await api.getClient(id);
    document.getElementById('modal-body').innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
        <div class="client-avatar" style="width:56px;height:56px;font-size:22px">${getInitials(client.name)}</div>
        <div>
          <h3 style="font-size:20px;font-weight:700">${client.name}</h3>
          <div style="color:var(--gray-500);margin-bottom:4px">
            <i class="fa fa-phone"></i> ${formatPhone(client.phone)}
            ${client.email ? ` · <i class="fa fa-envelope"></i> ${client.email}` : ''}
          </div>
          ${reliabilityBadge(client.reliability || 'new')}
          ${client.birth_date ? `<div class="text-sm text-muted" style="margin-top:4px"><i class="fa fa-birthday-cake"></i> ${formatDate(client.birth_date)}</div>` : ''}
        </div>
        <div style="margin-left:auto;text-align:right">
          <button class="btn btn-primary btn-sm" onclick="openNewAppointment(null,null,${client.id})">
            <i class="fa fa-calendar-plus"></i> Novo Agendamento
          </button>
        </div>
      </div>

      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-icon pink"><i class="fa fa-scissors"></i></div>
          <div class="stat-info">
            <div class="stat-value">${client.total_appointments || 0}</div>
            <div class="stat-label">Atendimentos</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green"><i class="fa fa-wallet"></i></div>
          <div class="stat-info">
            <div class="stat-value">${formatCurrency(client.total_spent)}</div>
            <div class="stat-label">Total gasto</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon purple"><i class="fa fa-calendar-check"></i></div>
          <div class="stat-info">
            <div class="stat-value">${client.last_appointment ? formatDate(client.last_appointment) : '-'}</div>
            <div class="stat-label">Último atend.</div>
          </div>
        </div>
      </div>

      ${client.notes ? `<div class="alert alert-info mb-4"><i class="fa fa-sticky-note"></i> ${client.notes}</div>` : ''}

      <h4 class="font-bold mb-3">Histórico de Atendimentos</h4>
      ${client.history.length === 0 ? emptyState('Nenhum atendimento ainda', 'fa-calendar') : `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr><th>Data</th><th>Serviço</th><th>Profissional</th><th>Valor</th><th>Pagamento</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${client.history.map(h => `
              <tr>
                <td>${formatDate(h.date)}<br><span class="text-xs text-muted">${h.start_time}</span></td>
                <td>${h.service_name}</td>
                <td>${h.professional_name}</td>
                <td class="font-semibold">${formatCurrency(h.price)}</td>
                <td>${getPaymentLabel(h.payment_method)}</td>
                <td>${statusBadge(h.status)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`}

      <div class="modal-footer" style="padding:16px 0 0;margin-top:16px">
        <button class="btn btn-secondary" onclick="closeModal()">Fechar</button>
        <button class="btn btn-outline" onclick="closeModal();openClientModal(${client.id})">
          <i class="fa fa-edit"></i> Editar
        </button>
        <button class="btn whatsapp-btn btn-sm" onclick="sendWhatsApp('${client.phone}','${client.name.replace(/'/g,'')}')">
          <i class="fab fa-whatsapp"></i> WhatsApp
        </button>
      </div>
    `;
  } catch(e) {
    document.getElementById('modal-body').innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

async function openClientModal(id = null) {
  openModal(id ? 'Editar Cliente' : 'Novo Cliente', '<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>', 'modal-sm');

  let client = null;
  if (id) {
    try { client = await api.getClient(id); } catch(e) {}
  }

  document.getElementById('modal-body').innerHTML = `
    <form id="client-form">
      <div class="form-group">
        <label>Nome completo *</label>
        <input type="text" id="cf-name" value="${client ? client.name : ''}" required placeholder="Nome da cliente" />
      </div>
      <div class="form-group">
        <label>Telefone *</label>
        <input type="tel" id="cf-phone" value="${client ? client.phone : ''}" required placeholder="(11) 99999-9999" />
      </div>
      <div class="form-group">
        <label>E-mail</label>
        <input type="email" id="cf-email" value="${client ? (client.email || '') : ''}" placeholder="email@exemplo.com" />
      </div>
      <div class="form-group">
        <label>Data de nascimento</label>
        <input type="date" id="cf-birth" value="${client ? (client.birth_date || '') : ''}" />
      </div>
      <div class="form-group">
        <label>Observações</label>
        <textarea id="cf-notes">${client ? (client.notes || '') : ''}</textarea>
      </div>
      <div id="cf-error" class="alert alert-error" style="display:none"></div>
      <div class="modal-footer" style="padding:0;margin-top:16px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        ${id && currentUser.role === 'admin' ? `<button type="button" class="btn btn-danger btn-sm" onclick="deleteClientConfirm(${id})"><i class="fa fa-trash"></i></button>` : ''}
        <button type="submit" class="btn btn-primary"><i class="fa fa-save"></i> Salvar</button>
      </div>
    </form>
  `;

  document.getElementById('client-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('cf-error');
    errEl.style.display = 'none';
    const data = {
      name: document.getElementById('cf-name').value,
      phone: document.getElementById('cf-phone').value,
      email: document.getElementById('cf-email').value || null,
      birth_date: document.getElementById('cf-birth').value || null,
      notes: document.getElementById('cf-notes').value || null
    };
    try {
      if (id) await api.updateClient(id, data);
      else await api.createClient(data);
      toast(id ? 'Cliente atualizado!' : 'Cliente criado!', 'success');
      closeModal();
      loadClients();
    } catch(err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
    }
  });
}

async function deleteClientConfirm(id) {
  const ok = await confirmDialog('Tem certeza que deseja excluir este cliente?');
  if (!ok) return;
  try {
    await api.deleteClient(id);
    toast('Cliente excluído', 'success');
    closeModal();
    loadClients();
  } catch(e) {
    toast(e.message, 'error');
  }
}
