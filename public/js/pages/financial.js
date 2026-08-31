// ===== FINANCIAL PAGE =====
let finPeriod = 'month'; // today | week | month | custom

async function loadFinancial() {
  const container = document.getElementById('page-financial');
  const today = getTodayStr();
  const [y, m] = today.split('-');

  container.innerHTML = `
    <div class="page-header">
      <h2>Financeiro</h2>
      <button class="btn btn-primary" onclick="openExpenseModal()">
        <i class="fa fa-plus"></i> Nova Despesa
      </button>
    </div>

    <!-- Period filter -->
    <div class="card mb-6">
      <div class="card-body" style="padding:16px">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <div class="view-tabs">
            <button class="view-tab ${finPeriod === 'today' ? 'active' : ''}" onclick="setFinPeriod('today')">Hoje</button>
            <button class="view-tab ${finPeriod === 'week' ? 'active' : ''}" onclick="setFinPeriod('week')">Semana</button>
            <button class="view-tab ${finPeriod === 'month' ? 'active' : ''}" onclick="setFinPeriod('month')">Mês</button>
            <button class="view-tab ${finPeriod === 'custom' ? 'active' : ''}" onclick="setFinPeriod('custom')">Período</button>
          </div>
          <div id="custom-period-inputs" style="display:${finPeriod === 'custom' ? 'flex' : 'none'};gap:8px;align-items:center;flex-wrap:wrap">
            <input type="date" id="fin-start" value="${y}-${m}-01" style="width:150px" />
            <span>até</span>
            <input type="date" id="fin-end" value="${today}" style="width:150px" />
            <button class="btn btn-primary btn-sm" onclick="renderFinancialData()">Filtrar</button>
          </div>
        </div>
      </div>
    </div>

    <div id="financial-data"></div>
  `;

  await renderFinancialData();
}

function setFinPeriod(period) {
  finPeriod = period;
  const customInputs = document.getElementById('custom-period-inputs');
  document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  if (customInputs) customInputs.style.display = period === 'custom' ? 'flex' : 'none';
  if (period !== 'custom') renderFinancialData();
}

function getPeriodDates() {
  const today = getTodayStr();
  const [y, m, d] = today.split('-');

  if (finPeriod === 'today') return { start: today, end: today };
  if (finPeriod === 'week') {
    const range = getWeekRange(today);
    return { start: range.start, end: range.end };
  }
  if (finPeriod === 'month') {
    return { start: `${y}-${m}-01`, end: today };
  }
  if (finPeriod === 'custom') {
    return {
      start: document.getElementById('fin-start')?.value || `${y}-${m}-01`,
      end: document.getElementById('fin-end')?.value || today
    };
  }
  return { start: today, end: today };
}

async function renderFinancialData() {
  const container = document.getElementById('financial-data');
  if (!container) return;
  loading(container);

  const { start, end } = getPeriodDates();

  // Profissional só vê os próprios dados de receita
  const summaryParams = { start_date: start, end_date: end };
  if (currentUser.role === 'professional' && currentUser.professional_id) {
    summaryParams.professional_id = currentUser.professional_id;
  }

  try {
    const [summary, transactions] = await Promise.all([
      api.getFinancialSummary(summaryParams),
      api.getTransactions({ start_date: start, end_date: end })
    ]);

    // Para profissional: filtrar receitas apenas dela, mas despesas são gerais (visíveis a todos)
    const income = transactions.filter(t =>
      t.type === 'income' &&
      (currentUser.role === 'admin' || t.professional_id === currentUser.professional_id)
    );
    const expenses = transactions.filter(t => t.type === 'expense');

    container.innerHTML = `
      <!-- Summary cards -->
      <div class="financial-summary mb-6">
        <div class="finance-card income">
          <div><i class="fa fa-arrow-up" style="color:var(--success)"></i> ${currentUser.role === 'admin' ? 'Receitas' : 'Minha Receita'}</div>
          <div class="amount">${formatCurrency(summary.total_income)}</div>
          <div class="label">${income.length} transação(ões)</div>
        </div>
        <div class="finance-card expense">
          <div><i class="fa fa-arrow-down" style="color:var(--danger)"></i> Despesas</div>
          <div class="amount">${formatCurrency(summary.total_expenses)}</div>
          <div class="label">${expenses.length} lançamento(s)</div>
        </div>
        ${currentUser.role === 'admin' ? `
        <div class="finance-card result">
          <div><i class="fa fa-chart-line" style="color:var(--primary)"></i> Resultado</div>
          <div class="amount" style="color:${summary.result >= 0 ? 'var(--success)' : 'var(--danger)'}">
            ${formatCurrency(summary.result)}
          </div>
          <div class="label">${summary.result >= 0 ? 'Positivo' : 'Negativo'}</div>
        </div>` : `
        <div class="finance-card result">
          <div><i class="fa fa-info-circle" style="color:var(--info)"></i> Período</div>
          <div class="amount" style="font-size:16px;color:var(--gray-600)">${formatDate(start)}</div>
          <div class="label">até ${formatDate(end)}</div>
        </div>`}
      </div>

      <div class="grid-2 mb-6">
        <!-- By professional — ADMIN ONLY -->
        ${currentUser.role === 'admin' ? `
        <div class="card">
          <div class="card-header">
            <div class="card-title">Por Profissional</div>
          </div>
          <div class="card-body">
            ${summary.by_professional.map(p => `
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
                <div style="display:flex;align-items:center;gap:8px">
                  <span class="color-dot" style="background:${p.color};width:14px;height:14px"></span>
                  <span class="font-semibold">${p.name}</span>
                </div>
                <div class="text-right">
                  <div class="font-bold" style="color:var(--primary)">${formatCurrency(p.revenue)}</div>
                  <div class="text-xs text-muted">${p.count} atend.</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>` : `
        <div class="card">
          <div class="card-header">
            <div class="card-title">Meu Faturamento</div>
          </div>
          <div class="card-body">
            ${summary.by_professional.filter(p => p.id === currentUser.professional_id).map(p => `
              <div style="text-align:center;padding:16px 0">
                <div style="width:56px;height:56px;border-radius:50%;background:${p.color};color:white;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;margin:0 auto 12px">${getInitials(p.name)}</div>
                <div style="font-size:28px;font-weight:700;color:var(--primary)">${formatCurrency(p.revenue)}</div>
                <div class="text-muted text-sm">${p.count} atendimento(s) no período</div>
              </div>
            `).join('')}
          </div>
        </div>`}

        <!-- By category -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">Despesas por Categoria</div>
          </div>
          <div class="card-body">
            ${summary.by_category.length === 0 ? '<div class="text-muted text-center">Sem despesas neste período</div>' :
              summary.by_category.map(c => `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                  <span>${c.category || 'Outros'}</span>
                  <span class="font-bold text-danger">${formatCurrency(c.total)}</span>
                </div>
              `).join('')
            }
          </div>
        </div>
      </div>

      <!-- Transactions tabs -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Lançamentos</div>
        </div>
        <div style="padding:0 20px">
          <div class="tabs">
            <button class="tab-btn active" onclick="switchFinTab('income', this)">
              Receitas (${income.length})
            </button>
            <button class="tab-btn" onclick="switchFinTab('expenses', this)">
              Despesas (${expenses.length})
            </button>
          </div>
        </div>
        <div id="fin-tab-income" class="tab-panel active">
          ${renderTransactionsTable(income, 'income')}
        </div>
        <div id="fin-tab-expenses" class="tab-panel">
          ${renderTransactionsTable(expenses, 'expense')}
        </div>
      </div>
    `;
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

function switchFinTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('fin-tab-income').classList.toggle('active', tab === 'income');
  document.getElementById('fin-tab-expenses').classList.toggle('active', tab === 'expenses');
}

function renderTransactionsTable(transactions, type) {
  if (transactions.length === 0) {
    return `<div style="padding:20px">${emptyState(`Nenhuma ${type === 'income' ? 'receita' : 'despesa'} neste período`, 'fa-receipt')}</div>`;
  }
  return `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Descrição</th>
            ${type === 'income' ? '<th>Profissional</th>' : '<th>Categoria</th>'}
            <th>Pagamento</th>
            <th>Valor</th>
            ${type === 'expense' ? '<th></th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${transactions.map(t => `
            <tr>
              <td>${formatDate(t.date)}</td>
              <td>
                <div class="font-semibold">${t.description}</div>
                ${t.client_name ? `<div class="text-xs text-muted">${t.client_name}</div>` : ''}
              </td>
              ${type === 'income'
                ? `<td>${t.professional_name || '-'}</td>`
                : `<td><span class="badge badge-inactive">${t.category || 'Outros'}</span></td>`}
              <td>${getPaymentLabel(t.payment_method)}</td>
              <td>
                <span style="color:${type === 'income' ? 'var(--success)' : 'var(--danger)'};font-weight:700">
                  ${type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}
                </span>
              </td>
              ${type === 'expense' && (currentUser.role === 'admin' || currentUser.role === 'professional') ? `
                <td>
                  <div style="display:flex;gap:4px">
                    <button class="btn btn-secondary btn-xs" onclick="openExpenseModal(${t.id})"><i class="fa fa-edit"></i></button>
                    <button class="btn btn-danger btn-xs" onclick="deleteTransaction(${t.id})"><i class="fa fa-trash"></i></button>
                  </div>
                </td>` : (type === 'expense' ? '<td></td>' : '')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function openExpenseModal(id = null) {
  openModal(id ? 'Editar Despesa' : 'Nova Despesa', '<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>', 'modal-sm');
  let tx = null;
  if (id) {
    try {
      const txs = await api.getTransactions();
      tx = txs.find(t => t.id === id);
    } catch(e) {}
  }

  const today = getTodayStr();
  const categories = ['Aluguel','Materiais','Esmaltes','Produtos','Energia','Água','Marketing','Outros'];

  document.getElementById('modal-body').innerHTML = `
    <form id="expense-form">
      <div class="form-group">
        <label>Descrição *</label>
        <input type="text" id="ef-desc" value="${tx ? tx.description : ''}" required placeholder="Ex: Compra de esmaltes" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Categoria</label>
          <select id="ef-category">
            ${categories.map(c => `<option value="${c}" ${tx && tx.category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Valor (R$) *</label>
          <input type="number" id="ef-amount" value="${tx ? tx.amount : ''}" step="0.01" min="0.01" required />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Data *</label>
          <input type="date" id="ef-date" value="${tx ? tx.date : today}" required />
        </div>
        <div class="form-group">
          <label>Forma de pagamento</label>
          <select id="ef-payment">
            <option value="">-</option>
            <option value="pix" ${tx && tx.payment_method === 'pix' ? 'selected' : ''}>Pix</option>
            <option value="cash" ${tx && tx.payment_method === 'cash' ? 'selected' : ''}>Dinheiro</option>
            <option value="credit" ${tx && tx.payment_method === 'credit' ? 'selected' : ''}>Cartão de Crédito</option>
            <option value="debit" ${tx && tx.payment_method === 'debit' ? 'selected' : ''}>Cartão de Débito</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Observações</label>
        <textarea id="ef-notes">${tx ? (tx.notes || '') : ''}</textarea>
      </div>
      <div id="ef-error" class="alert alert-error" style="display:none"></div>
      <div class="modal-footer" style="padding:0;margin-top:16px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary"><i class="fa fa-save"></i> Salvar</button>
      </div>
    </form>
  `;

  document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('ef-error');
    errEl.style.display = 'none';
    const data = {
      type: 'expense',
      description: document.getElementById('ef-desc').value,
      category: document.getElementById('ef-category').value,
      amount: parseFloat(document.getElementById('ef-amount').value),
      date: document.getElementById('ef-date').value,
      payment_method: document.getElementById('ef-payment').value || null,
      notes: document.getElementById('ef-notes').value || null
    };
    try {
      if (id) await api.updateTransaction(id, data);
      else await api.createTransaction(data);
      toast(id ? 'Despesa atualizada!' : 'Despesa criada!', 'success');
      closeModal();
      renderFinancialData();
    } catch(err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
    }
  });
}

async function deleteTransaction(id) {
  const ok = await confirmDialog('Tem certeza que deseja excluir esta despesa?');
  if (!ok) return;
  try {
    await api.deleteTransaction(id);
    toast('Despesa excluída', 'success');
    renderFinancialData();
  } catch(e) {
    toast(e.message, 'error');
  }
}
