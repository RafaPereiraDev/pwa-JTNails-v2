// ===== SERVICES PAGE =====
async function loadServices() {
  const container = document.getElementById('page-services');

  container.innerHTML = `
    <div class="page-header">
      <h2>Serviços</h2>
      ${isAdminLevel() ? `<button class="btn btn-primary" onclick="openServiceModal()">
        <i class="fa fa-plus"></i> Novo Serviço
      </button>` : ''}
    </div>
    <div id="services-container"></div>
  `;
  await renderServicesTable();
}

async function renderServicesTable() {
  const container = document.getElementById('services-container');
  const isAdmin = isAdminLevel();
  loading(container);
  try {
    const services = await api.getServices();
    if (!services || services.length === 0) {
      container.innerHTML = `<div class="card"><div class="card-body">${emptyState('Nenhum serviço cadastrado', 'fa-paintbrush')}</div></div>`;
      return;
    }

    const activeServices = services.filter(s => s.active);
    const inactiveServices = services.filter(s => !s.active);

    container.innerHTML = `
      <!-- SEÇÃO: SERVIÇOS ATIVOS -->
      <div style="margin-bottom:28px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <h3 style="font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px">
            <i class="fa fa-check-circle" style="color:var(--success)"></i> Serviços Ativos
            <span class="badge badge-active" style="font-size:12px;font-weight:600">${activeServices.length}</span>
          </h3>
        </div>

        ${activeServices.length === 0 ? `
          <div class="card"><div class="card-body">${emptyState('Nenhum serviço ativo', 'fa-paintbrush')}</div></div>
        ` : `
          <div class="card">
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Serviço</th>
                    <th>Descrição</th>
                    <th>Preço</th>
                    <th>Duração</th>
                    <th>Status</th>
                    ${isAdmin ? '<th style="text-align:center">Ações</th>' : ''}
                  </tr>
                </thead>
                <tbody>
                  ${activeServices.map(s => `
                    <tr>
                      <td class="font-semibold">${esc(s.name)}</td>
                      <td class="text-sm text-muted">${esc(s.description || '-')}</td>
                      <td><span style="color:var(--primary);font-weight:700">${formatCurrency(s.price)}</span></td>
                      <td>${s.duration} min</td>
                      <td>
                        <span class="badge badge-active">Ativo</span>
                      </td>
                      ${isAdmin ? `
                      <td style="text-align:center">
                        <div style="display:flex;gap:6px;justify-content:center">
                          <button class="btn btn-secondary btn-xs" onclick="openServiceModal(${s.id})" title="Editar serviço">
                            <i class="fa fa-edit"></i> Editar
                          </button>
                          <button class="btn btn-danger btn-xs" onclick="deleteServiceConfirm(${s.id})" title="Desativar serviço">
                            <i class="fa fa-trash"></i> Desativar
                          </button>
                        </div>
                      </td>` : ''}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            <div style="padding:10px 16px;color:var(--gray-500);font-size:13px;border-top:1px solid var(--gray-100)">
              ${activeServices.length} serviço(s) ativo(s) disponível(is) para agendamentos
            </div>
          </div>
        `}
      </div>

      <!-- SEÇÃO: SERVIÇOS INATIVOS -->
      <div style="margin-top:28px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <h3 style="font-size:16px;font-weight:700;color:var(--gray-700);display:flex;align-items:center;gap:8px">
            <i class="fa fa-archive text-muted"></i> Serviços Inativos
            <span class="badge" style="background:var(--gray-200);color:var(--gray-700);font-size:12px;font-weight:600">${inactiveServices.length}</span>
          </h3>
        </div>

        ${inactiveServices.length === 0 ? `
          <div class="card" style="border: 1px dashed var(--gray-300); background: transparent; box-shadow: none">
            <div class="card-body text-center text-muted" style="padding:20px;font-size:13px">
              <i class="fa fa-info-circle" style="color:var(--gray-400);margin-right:6px"></i> Nenhum serviço inativo no momento.
            </div>
          </div>
        ` : `
          <div class="card" style="opacity:0.95">
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Serviço</th>
                    <th>Descrição</th>
                    <th>Preço</th>
                    <th>Duração</th>
                    <th>Status</th>
                    ${isAdmin ? '<th style="text-align:center">Ações</th>' : ''}
                  </tr>
                </thead>
                <tbody>
                  ${inactiveServices.map(s => `
                    <tr>
                      <td class="font-semibold text-muted" style="opacity:0.75">${esc(s.name)}</td>
                      <td class="text-sm text-muted">${esc(s.description || '-')}</td>
                      <td><span style="color:var(--gray-600);font-weight:600">${formatCurrency(s.price)}</span></td>
                      <td class="text-muted">${s.duration} min</td>
                      <td>
                        <span class="badge badge-inactive">Inativo</span>
                      </td>
                      ${isAdmin ? `
                      <td style="text-align:center">
                        <div style="display:flex;gap:6px;justify-content:center">
                          <button class="btn btn-success btn-xs" onclick="reactivateService(${s.id})" title="Ativar serviço novamente">
                            <i class="fa fa-undo"></i> Ativar
                          </button>
                          <button class="btn btn-secondary btn-xs" onclick="openServiceModal(${s.id})" title="Editar serviço">
                            <i class="fa fa-edit"></i>
                          </button>
                        </div>
                      </td>` : ''}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            <div style="padding:10px 16px;color:var(--gray-500);font-size:13px;border-top:1px solid var(--gray-100)">
              Serviços inativos são mantidos para preservar o histórico financeiro e não aparecem na criação de novos agendamentos.
            </div>
          </div>
        `}
      </div>
    `;
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

async function openServiceModal(id = null) {
  openModal(id ? 'Editar Serviço' : 'Novo Serviço', '<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>', 'modal-sm');
  let service = null;
  if (id) {
    try { service = await api.getService(id); } catch(e) {}
  }

  document.getElementById('modal-body').innerHTML = `
    <form id="service-form">
      <div class="form-group">
        <label>Nome *</label>
        <input type="text" id="sf-name" value="${service ? esc(service.name) : ''}" required placeholder="Ex: Manicure" />
      </div>
      <div class="form-group">
        <label>Descrição</label>
        <input type="text" id="sf-desc" value="${service ? esc(service.description || '') : ''}" placeholder="Descrição opcional" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Preço (R$) *</label>
          <input type="number" id="sf-price" value="${service ? service.price : ''}" step="0.01" min="0" required placeholder="0,00" />
        </div>
        <div class="form-group">
          <label>Duração (min) *</label>
          <input type="number" id="sf-duration" value="${service ? service.duration : 60}" min="5" required placeholder="60" />
        </div>
      </div>
      <div id="sf-error" class="alert alert-error" style="display:none"></div>
      <div class="modal-footer" style="padding:0;margin-top:16px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary"><i class="fa fa-save"></i> Salvar</button>
      </div>
    </form>
  `;

  document.getElementById('service-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('sf-error');
    errEl.style.display = 'none';
    const data = {
      name: document.getElementById('sf-name').value,
      description: document.getElementById('sf-desc').value || null,
      price: parseFloat(document.getElementById('sf-price').value),
      duration: parseInt(document.getElementById('sf-duration').value)
    };
    try {
      if (id) await api.updateService(id, data);
      else await api.createService(data);
      toast(id ? 'Serviço atualizado!' : 'Serviço criado!', 'success');
      closeModal();
      renderServicesTable();
    } catch(err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
    }
  });
}

async function reactivateService(id) {
  try {
    await api.activateService(id);
    toast('Serviço ativado com sucesso!', 'success');
    renderServicesTable();
  } catch(e) {
    toast(e.message, 'error');
  }
}

async function toggleService(id, active) {
  try {
    if (active) {
      await api.activateService(id);
    } else {
      await api.deleteService(id);
    }
    toast(active ? 'Serviço ativado' : 'Serviço desativado', 'success');
    renderServicesTable();
  } catch(e) {
    toast(e.message, 'error');
  }
}

async function deleteServiceConfirm(id) {
  const ok = await confirmDialog('Deseja desativar este serviço? Ele não aparecerá para novos agendamentos, mas poderá ser reativado quando quiser na seção de Serviços Inativos.');
  if (!ok) return;
  try {
    await api.deleteService(id);
    toast('Serviço desativado com sucesso!', 'success');
    renderServicesTable();
  } catch(e) {
    toast(e.message, 'error');
  }
}
