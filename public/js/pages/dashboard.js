async function loadDashboard() {
  const container = document.getElementById('page-dashboard');
  loading(container);

  try {
    const data = await api.getDashboard();
    const { today, month, next_appointments, professionals } = data;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Olá, ${currentUser.name.split(' ')[0]}!</h2>
          <p class="text-muted text-sm">${longDate(today.date)}</p>
        </div>
      </div>

      <div class="quick-actions mb-6">
        <button class="quick-btn" onclick="openNewAppointment()">
          <i class="fa fa-calendar-plus" style="color:var(--primary)"></i> Novo Agendamento
        </button>
        <button class="quick-btn" onclick="openNewClientModal()">
          <i class="fa fa-user-plus" style="color:var(--secondary)"></i> Novo Cliente
        </button>
        ${currentUser.role !== 'professional' ? `
        <button class="quick-btn" onclick="navigateTo('services')">
          <i class="fa fa-paintbrush" style="color:var(--success)"></i> Ver Serviços
        </button>` : ''}
        <button class="quick-btn" onclick="navigateTo('agenda')">
          <i class="fa fa-calendar" style="color:var(--info)"></i> Ver Agenda
        </button>
      </div>

      <!-- Today Stats -->
      <h3 class="font-bold mb-3" style="color:var(--dark)">Hoje</h3>
      <div class="stats-grid mb-6">
        <div class="stat-card">
          <div class="stat-icon pink"><i class="fa fa-calendar-check"></i></div>
          <div class="stat-info">
            <div class="stat-value">${today.total}</div>
            <div class="stat-label">Agendamentos</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon purple"><i class="fa fa-dollar-sign"></i></div>
          <div class="stat-info">
            <div class="stat-value">${formatCurrency(today.revenue)}</div>
            <div class="stat-label">Receita do dia</div>
          </div>
        </div>
      </div>

      <!-- Month Stats -->
      <h3 class="font-bold mb-3" style="color:var(--dark)">Este mês</h3>
      <div class="stats-grid mb-6">
        <div class="stat-card">
          <div class="stat-icon pink"><i class="fa fa-paintbrush"></i></div>
          <div class="stat-info">
            <div class="stat-value">${month.total}</div>
            <div class="stat-label">Atendimentos</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green"><i class="fa fa-wallet"></i></div>
          <div class="stat-info">
            <div class="stat-value">${formatCurrency(month.revenue)}</div>
            <div class="stat-label">Faturamento</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon orange"><i class="fa fa-chart-bar"></i></div>
          <div class="stat-info">
            <div class="stat-value">${formatCurrency(month.avg_ticket)}</div>
            <div class="stat-label">Ticket médio</div>
          </div>
        </div>
      </div>

      <div class="grid-2 mb-6">
        <!-- Next appointments -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">Próximos Atendimentos</div>
            <button class="btn btn-outline btn-sm" onclick="navigateTo('agenda')">Ver agenda</button>
          </div>
          <div class="table-wrapper">
            ${next_appointments.length === 0 ? emptyState('Nenhum atendimento próximo', 'fa-calendar') : `
            <table>
              <thead>
                <tr>
                  <th>Horário</th>
                  <th>Cliente</th>
                  <th>Serviço</th>
                  <th>Profissional</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${next_appointments.slice(0, 8).map(a => `
                  <tr style="cursor:pointer" onclick="openEditAppointment(${a.id})">
                    <td><span class="font-semibold">${formatDate(a.date)}</span><br><span class="text-sm text-muted">${a.start_time}</span></td>
                    <td>${esc(a.client_name)}</td>
                    <td class="text-sm">${esc(a.service_name)}</td>
                    <td>
                      <span style="display:flex;align-items:center;gap:5px">
                        <span class="color-dot" style="background:${a.professional_color}"></span>
                        ${esc(a.professional_name)}
                      </span>
                    </td>
                    <td>${statusBadge(a.status)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`}
          </div>
        </div>

        <!-- Per professional — admin only -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">${currentUser.role === 'master' ? 'Faturamento por Profissional' : 'Meu Faturamento'}</div>
            <span class="text-sm text-muted">${new Date().toLocaleDateString('pt-BR', {month:'long', year:'numeric'})}</span>
          </div>
          <div class="card-body">
            ${currentUser.role === 'master' ? `
              ${professionals.map(p => `
                <div style="margin-bottom:20px">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                    <div style="display:flex;align-items:center;gap:8px">
                      <span class="color-dot" style="background:${p.color};width:14px;height:14px"></span>
                      <span class="font-semibold">${esc(p.name)}</span>
                    </div>
                    <div class="text-right">
                      <div class="font-bold" style="color:var(--primary)">${formatCurrency(p.revenue)}</div>
                      <div class="text-xs text-muted">${p.total} atend.</div>
                    </div>
                  </div>
                  <div style="height:6px;background:var(--gray-100);border-radius:4px;overflow:hidden">
                    <div style="height:100%;background:${p.color};border-radius:4px;width:${
                      professionals.reduce((max,pr) => Math.max(max, pr.revenue), 0) > 0
                        ? Math.round((p.revenue / professionals.reduce((max,pr) => Math.max(max, pr.revenue), 1)) * 100)
                        : 0
                    }%;transition:width 0.5s ease"></div>
                  </div>
                </div>
              `).join('')}
              <div class="divider"></div>
              <div style="display:flex;justify-content:space-between">
                <span class="font-semibold text-muted">Total geral</span>
                <span class="font-bold" style="color:var(--primary)">${formatCurrency(professionals.reduce((s,p) => s + p.revenue, 0))}</span>
              </div>
            ` : `
              ${(() => {
                const myProf = professionals.find(p => p.id === currentUser.professional_id);
                if (!myProf) return '<div class="text-muted text-center">Sem dados</div>';
                return `
                  <div style="text-align:center;padding:8px 0">
                    <div style="width:52px;height:52px;border-radius:50%;background:${myProf.color};color:white;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;margin:0 auto 12px">${getInitials(myProf.name)}</div>
                    <div style="font-size:30px;font-weight:700;color:var(--primary)">${formatCurrency(myProf.revenue)}</div>
                    <div class="text-muted text-sm mt-2">${myProf.total} atendimento(s) este mês</div>
                  </div>`;
              })()}
            `}
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

function openNewClientModal() {
  openModal('Novo Cliente', `
    <form id="quick-client-form">
      <div class="form-group">
        <label>Nome completo *</label>
        <input type="text" id="qc-name" required placeholder="Nome da cliente" />
      </div>
      <div class="form-group">
        <label>Telefone *</label>
        <input type="tel" id="qc-phone" required placeholder="(11) 99999-9999" />
      </div>
      <div class="form-group">
        <label>E-mail</label>
        <input type="email" id="qc-email" placeholder="email@exemplo.com" />
      </div>
      <div id="qc-error" class="alert alert-error" style="display:none"></div>
      <div class="modal-footer" style="padding:0;margin-top:16px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary"><i class="fa fa-save"></i> Salvar</button>
      </div>
    </form>
  `, 'modal-sm');

  document.getElementById('quick-client-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('qc-error');
    try {
      await api.createClient({
        name: document.getElementById('qc-name').value,
        phone: document.getElementById('qc-phone').value,
        email: document.getElementById('qc-email').value || null
      });
      toast('Cliente criado com sucesso!', 'success');
      closeModal();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
    }
  });
}
