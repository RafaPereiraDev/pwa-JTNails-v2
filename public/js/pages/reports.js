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
