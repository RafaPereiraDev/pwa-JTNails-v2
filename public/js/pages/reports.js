// ===== REPORTS PAGE =====
async function loadReports() {
  const container = document.getElementById('page-reports');
  const today = getTodayStr();
  const [y, m] = today.split('-');

  container.innerHTML = `
    <div class="page-header">
      <h2>Relatórios</h2>
    </div>

    <div class="tabs mb-6">
      <button class="tab-btn active" onclick="switchReportTab('appointments', this)">Atendimentos</button>
      <button class="tab-btn" onclick="switchReportTab('financial', this)">Financeiro</button>
      <button class="tab-btn" onclick="switchReportTab('inactive', this)">Clientes Inativas</button>
    </div>

    <!-- Appointments Report -->
    <div id="report-appointments" class="tab-panel active">
      <div class="card mb-4">
        <div class="card-body">
          <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
            <div class="form-group" style="margin:0;min-width:140px">
              <label>Data início</label>
              <input type="date" id="ra-start" value="${y}-${m}-01" />
            </div>
            <div class="form-group" style="margin:0;min-width:140px">
              <label>Data fim</label>
              <input type="date" id="ra-end" value="${today}" />
            </div>
            <div class="form-group" style="margin:0;min-width:180px" id="ra-prof-wrap">
              <label>Profissional</label>
              <select id="ra-professional">
                <option value="">Todas</option>
              </select>
            </div>
            <div class="form-group" style="margin:0;min-width:180px">
              <label>Status</label>
              <select id="ra-status">
                <option value="">Todos</option>
                <option value="scheduled">Agendado</option>
                <option value="confirmed">Confirmado</option>
                <option value="completed">Concluído</option>
                <option value="cancelled">Cancelado</option>
                <option value="no_show">Não compareceu</option>
              </select>
            </div>
            <button class="btn btn-primary" onclick="runAppointmentsReport()">
              <i class="fa fa-search"></i> Buscar
            </button>
          </div>
        </div>
      </div>
      <div id="ra-results"></div>
    </div>

    <!-- Financial Report -->
    <div id="report-financial" class="tab-panel">
      <div class="card mb-4">
        <div class="card-body">
          <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
            <div class="form-group" style="margin:0;min-width:140px">
              <label>Data início</label>
              <input type="date" id="rf-start" value="${y}-${m}-01" />
            </div>
            <div class="form-group" style="margin:0;min-width:140px">
              <label>Data fim</label>
              <input type="date" id="rf-end" value="${today}" />
            </div>
            <div class="form-group" style="margin:0;min-width:180px" id="rf-prof-wrap">
              <label>Profissional</label>
              <select id="rf-professional">
                <option value="">Todas</option>
              </select>
            </div>
            <button class="btn btn-primary" onclick="runFinancialReport()">
              <i class="fa fa-search"></i> Buscar
            </button>
          </div>
        </div>
      </div>
      <div id="rf-results"></div>
    </div>

    <!-- Inactive Clients Report -->
    <div id="report-inactive" class="tab-panel">
      <div class="card mb-4">
        <div class="card-body">
          <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
            <div class="form-group" style="margin:0">
              <label>Inativas há mais de</label>
              <div style="display:flex;align-items:center;gap:8px">
                <select id="ri-days" style="width:120px">
                  <option value="30">30 dias</option>
                  <option value="60">60 dias</option>
                  <option value="90" selected>90 dias</option>
                  <option value="180">6 meses</option>
                  <option value="365">1 ano</option>
                </select>
                <button class="btn btn-primary" onclick="runInactiveReport()">
                  <i class="fa fa-search"></i> Buscar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div id="ri-results"></div>
    </div>
  `;

  // Populate professional dropdowns
  try {
    const profs = await api.getProfessionals(true);
    ['ra-professional', 'rf-professional'].forEach(id => {
      const sel = document.getElementById(id);
      if (sel) {
        profs.forEach(p => {
          const opt = new Option(p.name, p.id);
          sel.appendChild(opt);
        });
      }
    });

    // Filtro por profissional só faz sentido para o master (visão geral)
    if (currentUser.role !== 'master') {
      ['ra-prof-wrap','rf-prof-wrap'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
    }
  } catch(e) {}
}

function switchReportTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('report-appointments').classList.toggle('active', tab === 'appointments');
  document.getElementById('report-financial').classList.toggle('active', tab === 'financial');
  document.getElementById('report-inactive').classList.toggle('active', tab === 'inactive');
  if (tab === 'inactive') runInactiveReport();
}

async function runAppointmentsReport() {
  const container = document.getElementById('ra-results');
  loading(container);

  const params = {
    start_date: document.getElementById('ra-start').value,
    end_date: document.getElementById('ra-end').value,
    professional_id: document.getElementById('ra-professional')?.value || '',
    status: document.getElementById('ra-status').value
  };
  Object.keys(params).forEach(k => !params[k] && delete params[k]);

  try {
    const { appointments, summary } = await api.getReportAppointments(params);

    container.innerHTML = `
      <div class="stats-grid mb-4">
        <div class="stat-card">
          <div class="stat-icon pink"><i class="fa fa-calendar-check"></i></div>
          <div class="stat-info"><div class="stat-value">${summary.total}</div><div class="stat-label">Total</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green"><i class="fa fa-check-circle"></i></div>
          <div class="stat-info"><div class="stat-value">${summary.completed}</div><div class="stat-label">Concluídos</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon pink"><i class="fa fa-ban"></i></div>
          <div class="stat-info"><div class="stat-value">${summary.cancelled}</div><div class="stat-label">Cancelados</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon purple"><i class="fa fa-dollar-sign"></i></div>
          <div class="stat-info"><div class="stat-value">${formatCurrency(summary.total_revenue)}</div><div class="stat-label">Receita</div></div>
        </div>
      </div>

      ${appointments.length === 0 ? `<div class="card"><div class="card-body">${emptyState('Nenhum atendimento encontrado', 'fa-calendar')}</div></div>` : `
      <div class="card">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Data</th><th>Cliente</th><th>Serviço</th><th>Profissional</th><th>Valor</th><th>Pagamento</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${appointments.map(a => `
                <tr>
                  <td>${formatDate(a.date)}<br><span class="text-xs text-muted">${formatTime(a.start_time)}</span></td>
                  <td>${esc(a.client_name)}</td>
                  <td>${esc(a.service_name)}</td>
                  <td>${esc(a.professional_name)}</td>
                  <td class="font-semibold">${formatCurrency(a.price)}</td>
                  <td>${getPaymentLabel(a.payment_method)}</td>
                  <td>${statusBadge(a.status)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>`}
    `;
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

async function runFinancialReport() {
  const container = document.getElementById('rf-results');
  loading(container);

  const params = {
    start_date: document.getElementById('rf-start').value,
    end_date: document.getElementById('rf-end').value,
    professional_id: document.getElementById('rf-professional')?.value || ''
  };
  Object.keys(params).forEach(k => !params[k] && delete params[k]);

  try {
    const [summary, transactions] = await Promise.all([
      api.getFinancialSummary(params),
      api.getTransactions(params)
    ]);

    container.innerHTML = `
      <div class="financial-summary mb-4">
        <div class="finance-card income">
          <div>Receitas</div>
          <div class="amount">${formatCurrency(summary.total_income)}</div>
        </div>
        <div class="finance-card expense">
          <div>Despesas</div>
          <div class="amount">${formatCurrency(summary.total_expenses)}</div>
        </div>
        <div class="finance-card result">
          <div>Resultado</div>
          <div class="amount" style="color:${summary.result >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(summary.result)}</div>
        </div>
      </div>

      ${transactions.length === 0 ? `<div class="card"><div class="card-body">${emptyState('Nenhuma transação encontrada', 'fa-receipt')}</div></div>` : `
      <div class="card">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr>
            </thead>
            <tbody>
              ${transactions.map(t => `
                <tr>
                  <td>${formatDate(t.date)}</td>
                  <td><span class="badge badge-${t.type}">${t.type === 'income' ? 'Receita' : 'Despesa'}</span></td>
                  <td>${esc(t.description)}</td>
                  <td>${esc(t.category || '-')}</td>
                  <td style="color:${t.type === 'income' ? 'var(--success)' : 'var(--danger)'};font-weight:700">
                    ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>`}
    `;
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

async function runInactiveReport() {
  const container = document.getElementById('ri-results');
  if (!container) return;
  loading(container);

  const days = document.getElementById('ri-days')?.value || 90;

  try {
    const clients = await api.getClientsInactive(days);

    if (clients.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="card-body">${emptyState(`Nenhuma cliente inativa há mais de ${days} dias`, 'fa-users')}</div>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="card mb-3" style="background:linear-gradient(135deg,#fff7ed,#fff);border-left:4px solid #f59e0b">
        <div class="card-body" style="padding:14px 16px">
          <div style="font-size:14px;color:#92400e">
            <i class="fa fa-triangle-exclamation" style="color:#f59e0b"></i>
            <strong>${clients.length} cliente${clients.length > 1 ? 's' : ''}</strong>
            não ${clients.length > 1 ? 'voltaram' : 'voltou'} há mais de <strong>${days} dias</strong>.
            Use o botão de WhatsApp para reconquistar.
          </div>
        </div>
      </div>

      <div class="card">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Último atendimento</th>
                <th>Último serviço</th>
                <th>Total visitas</th>
                <th>Inativa há</th>
                <th>WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              ${clients.map(c => {
                const phone = String(c.phone || '').replace(/\D/g, '');
                const msg   = encodeURIComponent(
                  `Olá, ${c.name}! 💅 Faz um tempinho que não te vemos por aqui no Salão Tainara Nails. Que tal agendar um horário? Temos novidades esperando por você! 🌸`
                );
                const wpp = `https://wa.me/55${phone}?text=${msg}`;
                const daysSince = parseInt(c.days_since) || 0;
                const badgeColor = daysSince >= 180 ? '#fee2e2' : daysSince >= 90 ? '#fff7ed' : '#fef9c3';
                const badgeText  = daysSince >= 180 ? '#dc2626' : daysSince >= 90 ? '#d97706' : '#ca8a04';
                return `
                  <tr>
                    <td>
                      <div class="font-semibold">${esc(c.name)}</div>
                      <div class="text-xs text-muted">${esc(c.phone || '-')}</div>
                    </td>
                    <td>${c.last_appointment ? formatDate(c.last_appointment) : '-'}</td>
                    <td class="text-sm">${esc(c.last_service || '-')}</td>
                    <td style="text-align:center">${c.total_appointments || 0}</td>
                    <td>
                      <span style="background:${badgeColor};color:${badgeText};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600">
                        ${daysSince} dias
                      </span>
                    </td>
                    <td>
                      ${phone ? `
                        <a href="${wpp}" target="_blank"
                          class="btn btn-xs"
                          style="background:#25d366;color:#fff;border:none;display:inline-flex;align-items:center;gap:4px">
                          <i class="fab fa-whatsapp"></i> Chamar
                        </a>` : '<span class="text-muted text-xs">Sem telefone</span>'}
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}
