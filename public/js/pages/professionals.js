// ===== PROFESSIONALS PAGE =====
async function loadProfessionals() {
  const container = document.getElementById('page-professionals');
  container.innerHTML = `
    <div class="page-header">
      <h2>Profissionais</h2>
      <button class="btn btn-primary" onclick="openProfessionalModal()">
        <i class="fa fa-plus"></i> Nova Profissional
      </button>
    </div>
    <div id="prof-container"></div>
  `;
  await renderProfessionalsList();
}

async function renderProfessionalsList() {
  const container = document.getElementById('prof-container');
  loading(container);
  try {
    const professionals = await api.getProfessionals();
    if (professionals.length === 0) {
      container.innerHTML = `<div class="card"><div class="card-body">${emptyState('Nenhuma profissional cadastrada', 'fa-user-tie')}</div></div>`;
      return;
    }

    const today = getTodayStr();
    const month = getMonthStr();
    const [y, m] = month.split('-');

    // Get stats for each professional
    const statsPromises = professionals.map(p => api.getProfessionalStats(p.id, m, y));
    const stats = await Promise.all(statsPromises.map(p => p.catch(() => ({ total_appointments: 0, total_revenue: 0, avg_ticket: 0 }))));

    container.innerHTML = `
      <div style="display:grid;gap:16px">
        ${professionals.map((p, i) => `
          <div class="card">
            <div class="card-body">
              <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
                <div style="width:60px;height:60px;border-radius:50%;background:${p.color};color:white;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;flex-shrink:0">
                  ${getInitials(p.name)}
                </div>
                <div style="flex:1;min-width:200px">
                  <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
                    <h3 style="font-size:18px;font-weight:700">${p.name}</h3>
                    <span class="badge ${p.active ? 'badge-active' : 'badge-inactive'}">${p.active ? 'Ativa' : 'Inativa'}</span>
                  </div>
                  ${p.phone ? `<div class="text-sm text-muted"><i class="fa fa-phone"></i> ${formatPhone(p.phone)}</div>` : ''}
                  ${p.email ? `<div class="text-sm text-muted"><i class="fa fa-envelope"></i> ${p.email}</div>` : ''}
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;flex:2;min-width:280px">
                  <div class="text-center">
                    <div style="font-size:22px;font-weight:700;color:var(--primary)">${stats[i].total_appointments || 0}</div>
                    <div class="text-xs text-muted">Atendimentos<br>este mês</div>
                  </div>
                  <div class="text-center">
                    <div style="font-size:22px;font-weight:700;color:var(--success)">${formatCurrency(stats[i].total_revenue)}</div>
                    <div class="text-xs text-muted">Faturamento<br>este mês</div>
                  </div>
                  <div class="text-center">
                    <div style="font-size:22px;font-weight:700;color:var(--secondary)">${formatCurrency(stats[i].avg_ticket)}</div>
                    <div class="text-xs text-muted">Ticket<br>médio</div>
                  </div>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  <button class="btn btn-outline btn-sm" onclick="openAgendaProfessional(${p.id})">
                    <i class="fa fa-calendar"></i> Agenda
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="openProfessionalModal(${p.id})">
                    <i class="fa fa-edit"></i> Editar
                  </button>
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

function openAgendaProfessional(profId) {
  agendaProfFilter = String(profId);
  navigateTo('agenda');
}

async function openProfessionalModal(id = null) {
  openModal(id ? 'Editar Profissional' : 'Nova Profissional', '<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>', 'modal-sm');
  let prof = null;
  if (id) {
    try { prof = await api.getProfessional(id); } catch(e) {}
  }

  document.getElementById('modal-body').innerHTML = `
    <form id="prof-form">
      <div class="form-group">
        <label>Nome *</label>
        <input type="text" id="pf-name" value="${prof ? prof.name : ''}" required placeholder="Nome da profissional" />
      </div>
      <div class="form-group">
        <label>Telefone</label>
        <input type="tel" id="pf-phone" value="${prof ? (prof.phone || '') : ''}" placeholder="(11) 99999-9999" />
      </div>
      <div class="form-group">
        <label>E-mail</label>
        <input type="email" id="pf-email" value="${prof ? (prof.email || '') : ''}" placeholder="email@exemplo.com" />
      </div>
      <div class="form-group">
        <label>Cor na agenda</label>
        <input type="color" id="pf-color" value="${prof ? (prof.color || '#e91e8c') : '#e91e8c'}" style="height:40px;padding:4px" />
      </div>
      <div id="pf-error" class="alert alert-error" style="display:none"></div>
      <div class="modal-footer" style="padding:0;margin-top:16px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        ${id ? `<button type="button" class="btn btn-danger btn-sm" onclick="toggleProfActive(${id}, ${prof && prof.active ? 0 : 1})">
          ${prof && prof.active ? '<i class="fa fa-ban"></i> Desativar' : '<i class="fa fa-check"></i> Ativar'}
        </button>` : ''}
        <button type="submit" class="btn btn-primary"><i class="fa fa-save"></i> Salvar</button>
      </div>
    </form>
  `;

  document.getElementById('prof-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('pf-error');
    errEl.style.display = 'none';
    const data = {
      name: document.getElementById('pf-name').value,
      phone: document.getElementById('pf-phone').value || null,
      email: document.getElementById('pf-email').value || null,
      color: document.getElementById('pf-color').value
    };
    try {
      if (id) await api.updateProfessional(id, data);
      else await api.createProfessional(data);
      toast(id ? 'Profissional atualizada!' : 'Profissional criada!', 'success');
      closeModal();
      renderProfessionalsList();
    } catch(err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
    }
  });
}

async function toggleProfActive(id, active) {
  try {
    await api.updateProfessional(id, { active });
    toast(active ? 'Profissional ativada' : 'Profissional desativada', 'success');
    closeModal();
    renderProfessionalsList();
  } catch(e) {
    toast(e.message, 'error');
  }
}
