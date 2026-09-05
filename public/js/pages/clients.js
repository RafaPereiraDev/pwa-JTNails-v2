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
                        <div class="font-semibold">${esc(c.name)}</div>
                        <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
                          ${reliabilityBadge(c.reliability || 'new')}
                          ${c.email ? `<span class="text-xs text-muted">${esc(c.email)}</span>` : ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <a href="tel:${c.phone}" style="color:var(--gray-700)">${formatPhone(c.phone)}</a>
                    <button class="btn btn-xs whatsapp-btn" style="margin-left:4px" onclick="sendWhatsApp('${esc(c.phone)}', '${esc(c.name).replace(/'/g,'&#39;')}')" title="WhatsApp">
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
                      ${isAdminLevel() ? `
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
          <h3 style="font-size:20px;font-weight:700">${esc(client.name)}</h3>
          <div style="color:var(--gray-500);margin-bottom:4px">
            <i class="fa fa-phone"></i> ${formatPhone(client.phone)}
            ${client.email ? ` · <i class="fa fa-envelope"></i> ${esc(client.email)}` : ''}
          </div>
          ${reliabilityBadge(client.reliability || 'new')}
          ${client.birth_date ? `<div class="text-sm text-muted" style="margin-top:4px"><i class="fa fa-birthday-cake"></i> ${formatDate(client.birth_date)}${clientAge(client.birth_date) !== null ? ` (${clientAge(client.birth_date)} anos)` : ''}</div>` : ''}
          <div class="text-xs text-muted" style="margin-top:4px">
            <i class="fa fa-lock"></i> Acesso online:
            ${client.has_password ? 'senha cadastrada' : 'sem senha ainda'}
          </div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <button class="btn btn-primary btn-sm" onclick="openNewAppointment(null,null,${client.id})">
            <i class="fa fa-calendar-plus"></i> Novo Agendamento
          </button>
        </div>
      </div>

      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-icon pink"><i class="fa fa-paintbrush"></i></div>
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

      ${client.notes ? `<div class="alert alert-info mb-4"><i class="fa fa-sticky-note"></i> ${esc(client.notes)}</div>` : ''}

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
                <td>${formatDate(h.date)}<br><span class="text-xs text-muted">${formatTime(h.start_time)}</span></td>
                <td>${esc(h.service_name)}</td>
                <td>${esc(h.professional_name)}</td>
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
        ${isAdminLevel() ? `
        <button class="btn btn-outline btn-sm" onclick="resetClientPasswordPrompt(${client.id}, '${esc(client.name).replace(/'/g,'&#39;')}')" title="Redefinir senha de acesso online">
          <i class="fa fa-key"></i> Redefinir senha
        </button>` : ''}
        <button class="btn whatsapp-btn btn-sm" onclick="sendWhatsApp('${esc(client.phone)}','${esc(client.name).replace(/'/g,'&#39;')}')">
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
        <input type="text" id="cf-name" value="${client ? esc(client.name) : ''}" required placeholder="Nome da cliente" />
      </div>
      <div class="form-group">
        <label>Telefone *</label>
        <input type="tel" id="cf-phone" value="${client ? esc(client.phone) : ''}" required placeholder="(11) 99999-9999" />
      </div>
      <div class="form-group">
        <label>E-mail</label>
        <input type="email" id="cf-email" value="${client ? esc(client.email || '') : ''}" placeholder="email@exemplo.com" />
      </div>
      <div class="form-group">
        <label>Data de nascimento</label>
        <input type="date" id="cf-birth" value="${client ? esc(client.birth_date || '') : ''}" />
      </div>
      <div class="form-group">
        <label>Observações</label>
        <textarea id="cf-notes">${client ? esc(client.notes || '') : ''}</textarea>
      </div>
      <div id="cf-error" class="alert alert-error" style="display:none"></div>
      <div class="modal-footer" style="padding:0;margin-top:16px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        ${id && isAdminLevel() ? `<button type="button" class="btn btn-danger btn-sm" onclick="deleteClientConfirm(${id})"><i class="fa fa-trash"></i></button>` : ''}
        <button type="submit" class="btn btn-primary"><i class="fa fa-save"></i> Salvar</button>
      </div>
    </form>
  `;

  attachPhoneMask('cf-phone');

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

// Calcula a idade a partir de birth_date (YYYY-MM-DD). Retorna null se inválida.
function clientAge(birth) {
  if (!birth) return null;
  const m = String(birth).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const bd = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(bd)) return null;
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const md = today.getMonth() - bd.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < bd.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

// Modal para a profissional redefinir a senha de acesso online da cliente
function resetClientPasswordPrompt(id, name) {
  openModal('Redefinir senha de acesso', `
    <p style="color:var(--gray-600);margin-bottom:14px">
      Defina uma nova senha de acesso online para <strong>${esc(name)}</strong>.
      Combine essa senha com a cliente para que ela possa consultar e cancelar agendamentos.
    </p>
    <form id="reset-pass-form">
      <div class="form-group">
        <label>Nova senha (mínimo 8 caracteres, sem sequências óbvias)</label>
        <input type="text" id="rp-password" placeholder="Ex.: atelier azul 27" minlength="8" required />
      </div>
      <div id="rp-error" class="alert alert-error" style="display:none"></div>
      <div class="modal-footer" style="padding:0;margin-top:16px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary"><i class="fa fa-key"></i> Redefinir senha</button>
      </div>
    </form>
  `, 'modal-sm');

  document.getElementById('reset-pass-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('rp-error');
    errEl.style.display = 'none';
    const pwd = document.getElementById('rp-password').value;
    try {
      await api.resetClientPassword(id, pwd);
      toast('Senha da cliente redefinida!', 'success');
      closeModal();
    } catch (err) {
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
