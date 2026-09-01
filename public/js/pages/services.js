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
    if (services.length === 0) {
      container.innerHTML = `<div class="card"><div class="card-body">${emptyState('Nenhum serviço cadastrado', 'fa-paintbrush')}</div></div>`;
      return;
    }

    container.innerHTML = `
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
              ${services.map(s => `
                <tr>
                  <td class="font-semibold" style="opacity:${s.active ? 1 : 0.5}">${esc(s.name)}</td>
                  <td class="text-sm text-muted">${esc(s.description || '-')}</td>
                  <td><span style="color:var(--primary);font-weight:700">${formatCurrency(s.price)}</span></td>
                  <td>${s.duration} min</td>
                  <td>
                    ${isAdmin ? `
                      <button class="status-toggle ${s.active ? 'active' : 'inactive'}" onclick="toggleService(${s.id}, ${s.active ? 0 : 1})" title="${s.active ? 'Clique para desativar' : 'Clique para ativar'}">
                        <span class="toggle-dot"></span>
                        <span class="toggle-label">${s.active ? 'Ativo' : 'Inativo'}</span>
                      </button>
                    ` : `
                      <span class="badge ${s.active ? 'badge-active' : 'badge-inactive'}">${s.active ? 'Ativo' : 'Inativo'}</span>
                    `}
                  </td>
                  ${isAdmin ? `
                  <td style="text-align:center">
                    <div style="display:flex;gap:6px;justify-content:center">
                      <button class="btn btn-secondary btn-xs" onclick="openServiceModal(${s.id})" title="Editar serviço">
                        <i class="fa fa-edit"></i> Editar
                      </button>
                      <button class="btn btn-danger btn-xs" onclick="deleteServiceConfirm(${s.id})" title="Excluir serviço">
                        <i class="fa fa-trash"></i>
                      </button>
                    </div>
                  </td>` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div style="padding:12px 16px;color:var(--gray-500);font-size:13px">
          ${services.filter(s=>s.active).length} ativo(s) · ${services.filter(s=>!s.active).length} inativo(s)
        </div>
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

async function toggleService(id, active) {
  try {
    await api.updateService(id, { active });
    toast(active ? 'Serviço ativado' : 'Serviço desativado', 'success');
    renderServicesTable();
  } catch(e) {
    toast(e.message, 'error');
  }
}

async function deleteServiceConfirm(id) {
  const ok = await confirmDialog('Tem certeza que deseja excluir este serviço?');
  if (!ok) return;
  try {
    await api.deleteService(id);
    toast('Serviço excluído', 'success');
    renderServicesTable();
  } catch(e) {
    toast(e.message, 'error');
  }
}
