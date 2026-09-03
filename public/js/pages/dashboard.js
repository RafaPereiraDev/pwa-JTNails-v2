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

  // Verifica pendências após renderizar o dashboard (não bloqueia o carregamento)
  checkPendingConfirmations();
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

// ===== MODAL DE CONFIRMAÇÃO DE PENDÊNCIAS =====

// Estado local dos itens pendentes: Map<id, { appt, status, payment_method }>
let _pendingMap = new Map();

async function checkPendingConfirmations() {
  // Só profissionais e admins com agenda própria precisam confirmar.
  // Master não tem agenda, então pula.
  if (!currentUser || currentUser.role === 'master') return;

  try {
    const pending = await api.getPendingConfirmation();
    if (!pending || pending.length === 0) return;
    openPendingModal(pending);
  } catch (e) {
    // Falha silenciosa: não interrompe o painel se a checagem der erro
    console.warn('checkPendingConfirmations:', e.message);
  }
}

function openPendingModal(pending) {
  // Remove overlay anterior se existir
  const old = document.getElementById('pending-overlay');
  if (old) old.remove();

  // Inicializa estado local: default = 'completed' pra cada item
  _pendingMap = new Map();
  pending.forEach(a => _pendingMap.set(a.id, { appt: a, status: 'completed', payment_method: null }));

  const overlay = document.createElement('div');
  overlay.id = 'pending-overlay';
  overlay.innerHTML = `
    <style>
      #pending-overlay {
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(0,0,0,0.55);
        display: flex; align-items: center; justify-content: center;
        padding: 16px;
      }
      #pending-box {
        background: #fff; border-radius: 16px;
        width: 100%; max-width: 560px;
        max-height: 90vh; display: flex; flex-direction: column;
        box-shadow: 0 20px 60px rgba(0,0,0,0.25);
        overflow: hidden;
      }
      #pending-header {
        padding: 20px 20px 16px;
        border-bottom: 1px solid #e5e7eb;
        background: linear-gradient(135deg, #fdf2f8, #fff);
      }
      #pending-header h3 {
        margin: 0 0 4px;
        font-size: 17px; font-weight: 700; color: #1f2937;
      }
      #pending-header p {
        margin: 0; font-size: 13px; color: #6b7280;
      }
      #pending-list {
        overflow-y: auto; flex: 1; padding: 12px 16px;
      }
      .pending-item {
        border: 1.5px solid #e5e7eb; border-radius: 12px;
        padding: 14px; margin-bottom: 10px;
        transition: border-color 0.2s;
      }
      .pending-item.status-completed  { border-color: #22c55e; background: #f0fdf4; }
      .pending-item.status-no_show    { border-color: #9ca3af; background: #f9fafb; }
      .pending-item-info {
        display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px;
      }
      .pending-item-dot {
        width: 10px; height: 10px; border-radius: 50%;
        margin-top: 5px; flex-shrink: 0;
      }
      .pending-item-name  { font-weight: 700; font-size: 14px; color: #1f2937; }
      .pending-item-sub   { font-size: 12px; color: #6b7280; margin-top: 2px; }
      .pending-item-btns  { display: flex; gap: 8px; }
      .pending-btn {
        flex: 1; padding: 10px 8px; border-radius: 8px; border: none;
        font-size: 13px; font-weight: 600; cursor: pointer;
        display: flex; align-items: center; justify-content: center; gap: 6px;
        transition: opacity 0.15s, transform 0.1s;
        min-height: 44px;
      }
      .pending-btn:active { transform: scale(0.97); }
      .pending-btn-done   { background: #22c55e; color: #fff; }
      .pending-btn-noshow { background: #e5e7eb; color: #374151; }
      .pending-btn-done.active   { box-shadow: 0 0 0 3px rgba(34,197,94,0.35); }
      .pending-btn-noshow.active { box-shadow: 0 0 0 3px rgba(107,114,128,0.35); background: #9ca3af; color: #fff; }
      .pending-payment {
        margin-top: 10px; display: none;
      }
      .pending-payment select {
        width: 100%; padding: 8px 10px; border-radius: 8px;
        border: 1.5px solid #d1d5db; font-size: 13px; color: #374151;
        background: #fff;
      }
      #pending-footer {
        padding: 14px 16px; border-top: 1px solid #e5e7eb;
        display: flex; gap: 8px;
      }
      #pending-save-btn {
        flex: 1; padding: 14px; border-radius: 10px;
        background: var(--primary, #e91e8c); color: #fff;
        font-size: 15px; font-weight: 700; border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center; gap: 8px;
        transition: opacity 0.15s;
      }
      #pending-save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      #pending-skip-btn {
        padding: 14px 18px; border-radius: 10px;
        background: #f3f4f6; color: #6b7280;
        font-size: 13px; font-weight: 600; border: none; cursor: pointer;
      }
    </style>

    <div id="pending-box">
      <div id="pending-header">
        <h3><i class="fa fa-clock" style="color:#f59e0b;margin-right:6px"></i>
          ${pending.length} atendimento${pending.length > 1 ? 's' : ''} aguardando confirmação
        </h3>
        <p>Esses atendimentos já encerraram. Confirme o que aconteceu para manter o faturamento correto.</p>
      </div>

      <div id="pending-list">
        ${pending.map(a => `
          <div class="pending-item status-completed" id="pitem-${a.id}">
            <div class="pending-item-info">
              <span class="pending-item-dot" style="background:${a.professional_color || '#e91e8c'}"></span>
              <div>
                <div class="pending-item-name">${esc(a.client_name)}</div>
                <div class="pending-item-sub">
                  <i class="fa fa-hand-sparkles" style="font-size:10px"></i> ${esc(a.service_name)}
                  &nbsp;·&nbsp;
                  <i class="fa fa-clock" style="font-size:10px"></i> ${formatDate(a.date)} às ${a.start_time}
                  &nbsp;·&nbsp;
                  <i class="fa fa-user" style="font-size:10px"></i> ${esc(a.professional_name)}
                </div>
              </div>
            </div>
            <div class="pending-item-btns">
              <button class="pending-btn pending-btn-done active" id="pbtn-done-${a.id}"
                onclick="setPendingStatus(${a.id}, 'completed')">
                <i class="fa fa-check-circle"></i> Concluído
              </button>
              <button class="pending-btn pending-btn-noshow" id="pbtn-noshow-${a.id}"
                onclick="setPendingStatus(${a.id}, 'no_show')">
                <i class="fa fa-user-times"></i> Não compareceu
              </button>
            </div>
            <div class="pending-payment" id="ppayment-${a.id}">
              <select onchange="setPendingPayment(${a.id}, this.value)">
                <option value="">Forma de pagamento (opcional)</option>
                <option value="pix">Pix</option>
                <option value="cash">Dinheiro</option>
                <option value="credit">Cartão de Crédito</option>
                <option value="debit">Cartão de Débito</option>
                <option value="other">Outro</option>
              </select>
            </div>
          </div>
        `).join('')}
      </div>

      <div id="pending-footer">
        <button id="pending-skip-btn" onclick="closePendingModal()" title="Resolver depois">
          Depois
        </button>
        <button id="pending-save-btn" onclick="savePendingConfirmations()">
          <i class="fa fa-check"></i> Salvar e Continuar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

function setPendingStatus(id, status) {
  const entry = _pendingMap.get(id);
  if (!entry) return;
  entry.status = status;

  // Atualiza visual do item
  const item = document.getElementById(`pitem-${id}`);
  item.className = `pending-item status-${status}`;

  const btnDone   = document.getElementById(`pbtn-done-${id}`);
  const btnNoShow = document.getElementById(`pbtn-noshow-${id}`);
  const payment   = document.getElementById(`ppayment-${id}`);

  btnDone.classList.toggle('active', status === 'completed');
  btnNoShow.classList.toggle('active', status === 'no_show');

  // Mostra seletor de pagamento só quando concluído
  payment.style.display = status === 'completed' ? 'block' : 'none';
}

function setPendingPayment(id, value) {
  const entry = _pendingMap.get(id);
  if (entry) entry.payment_method = value || null;
}

async function savePendingConfirmations() {
  const btn = document.getElementById('pending-save-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Salvando...';

  try {
    const updates = [..._pendingMap.values()].map(({ appt, status, payment_method }) => ({
      id: appt.id, status, payment_method
    }));
    await api.bulkConfirmAppointments(updates);
    toast(`${updates.length} atendimento${updates.length > 1 ? 's' : ''} confirmado${updates.length > 1 ? 's' : ''}!`, 'success');
    closePendingModal();
    // Recarrega o dashboard para refletir o novo faturamento
    loadDashboard();
  } catch (e) {
    toast(e.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-check"></i> Salvar e Continuar';
  }
}

function closePendingModal() {
  const overlay = document.getElementById('pending-overlay');
  if (overlay) overlay.remove();
  _pendingMap.clear();
}
