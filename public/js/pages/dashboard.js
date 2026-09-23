async function loadDashboard() {
  const container = document.getElementById('page-dashboard');
  loading(container);

  try {
    // Carrega dashboard, aniversários e mensagem de aniversário em paralelo
    const podeVerAniversarios = (currentUser.role !== 'professional' || currentUser.professional_id);
    const [data, birthdays, bMsgResp, plansEnding] = await Promise.all([
      api.getDashboard(),
      podeVerAniversarios ? api.getClientBirthdays().catch(() => [])          : Promise.resolve([]),
      podeVerAniversarios ? api.getBirthdayMessage().catch(() => ({}))        : Promise.resolve({}),
      api.getPlansEnding().catch(() => []),
    ]);
    const { today, month, next_appointments, professionals } = data;
    const birthdayMsgTemplate = bMsgResp.message ||
      'Parabéns, {nome}! 🎉🎂 O Juliana & Tainara Atelier Nails deseja a você um dia maravilhoso, repleto de alegria e momentos especiais! ✨💖';

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
                    <td><span class="font-semibold">${formatDate(a.date)}</span><br><span class="text-sm text-muted">${formatTime(a.start_time)}</span></td>
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
            <div class="card-title">${currentUser.role === 'master' ? 'Despesas do mês' : 'Meu Faturamento'}</div>
            <span class="text-sm text-muted">${new Date(today.date + 'T12:00:00').toLocaleDateString('pt-BR', {month:'long', year:'numeric'})}</span>
          </div>
          <div class="card-body">
            ${currentUser.role === 'master' ? `
              <div style="text-align:center;padding:16px 0">
                <div style="font-size:13px;color:#9ca3af;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Total de despesas</div>
                <div style="font-size:36px;font-weight:700;color:#dc2626">${formatCurrency(month.expenses || 0)}</div>
                <div style="font-size:12px;color:#9ca3af;margin-top:8px">Lançadas este mês</div>
              </div>
            ` : `
              ${(() => {
                const myProf = professionals.find(p => p.id === currentUser.professional_id);
                if (!myProf) return '<div class="text-muted text-center">Sem dados</div>';
                const foto = myProf.photo || currentUser.professional_photo;
                const avatarInner = foto
                  ? `<img src="${esc(foto)}" alt="${esc(myProf.name)}" style="width:100%;height:100%;object-fit:cover" />`
                  : getInitials(myProf.name);
                return `
                  <div style="text-align:center;padding:8px 0">
                    <div style="width:52px;height:52px;border-radius:50%;overflow:hidden;background:#C19B53;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;margin:0 auto 12px">${avatarInner}</div>
                    <div style="font-size:30px;font-weight:700;color:var(--primary)">${formatCurrency(myProf.revenue)}</div>
                    <div class="text-muted text-sm mt-2">${myProf.total} atendimento(s) este mês</div>
                  </div>`;
              })()}
            `}
          </div>
        </div>
      </div>

      ${birthdays && birthdays.length > 0 ? `
      <div class="card mt-4" style="border-left:4px solid #B29661">
        <div class="card-header" style="background:linear-gradient(135deg,#f3ecdd,#fff)">
          <div class="card-title" style="color:#8a6d2f">
            <i class="fa fa-cake-candles"></i> Aniversariantes de hoje
          </div>
          <span class="badge" style="background:#f3ecdd;color:#8a6d2f">${birthdays.length} cliente${birthdays.length > 1 ? 's' : ''}</span>
        </div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr><th>Cliente</th><th>Data</th><th>Quando</th><th></th></tr>
            </thead>
            <tbody>
              ${birthdays.map(b => {
                const parts = (b.birth_date || '').split('-');
                const dataFmt = parts.length >= 3 ? `${parts[2]}/${parts[1]}` : '-';
                const label = b.days_until === 0 ? '🎂 Hoje!' : `em ${b.days_until} dia${b.days_until > 1 ? 's' : ''}`;
                const phone = String(b.phone || '').replace(/\D/g, '');
                // Substitui {nome} pelo PRIMEIRO NOME da cliente e codifica para preservar emojis
                const primeiroNome = String(b.name || '').trim().split(' ')[0];
                const mensagemFormatada = birthdayMsgTemplate.replace(/\{nome\}/g, primeiroNome);
                const wpp = `https://api.whatsapp.com/send?phone=55${phone}&text=${encodeURIComponent(mensagemFormatada)}`;
                return `
                  <tr>
                    <td class="font-semibold">${esc(b.name)}</td>
                    <td>${dataFmt}</td>
                    <td><span class="badge" style="background:${b.days_until === 0 ? '#f3ecdd' : '#f0fdf4'};color:${b.days_until === 0 ? '#8a6d2f' : '#15803d'}">${label}</span></td>
                    <td>${phone ? `<a href="${wpp}" target="_blank" class="btn btn-xs" style="background:#25d366;color:#fff;border:none"><i class="fab fa-whatsapp"></i> Parabenizar</a>` : ''}</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}

      ${plansEnding && plansEnding.length > 0 ? `
      <div class="card mt-4" style="border-left:4px solid #C19B53">
        <div class="card-header" style="background:linear-gradient(135deg,#f3ecdd,#fff)">
          <div class="card-title" style="color:#8a6d2f">
            <i class="fa fa-rotate-right"></i> Planos anuais terminando
          </div>
          <span class="badge" style="background:#f3ecdd;color:#8a6d2f">${plansEnding.length}</span>
        </div>
        <div class="card-body">
          <p class="text-sm text-muted" style="margin-bottom:12px">
            ${plansEnding.length === 1 ? 'Uma cliente está' : 'Estas clientes estão'} com o Plano Anual terminando. Que tal renovar por mais 1 ano?
          </p>
          ${plansEnding.map(p => `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid var(--gray-100)">
              <div>
                <div class="font-semibold">${esc(p.client_name)}</div>
                <div class="text-xs text-muted">
                  ${parseInt(p.restantes, 10) === 1
                    ? 'Resta apenas 1 agendamento do plano.'
                    : (parseInt(p.restantes, 10) === 0
                      ? 'Plano finalizado recentemente (0 agendamentos restantes).'
                      : `Restam ${p.restantes} agendamentos (término em ${formatDate(p.data_fim)}).`)}
                </div>
              </div>
              <button class="btn btn-primary btn-sm" onclick="openNewAppointment(null, ${p.professional_id})" title="Renovar plano">
                <i class="fa fa-rotate-right"></i> Renovar
              </button>
            </div>
          `).join('')}
        </div>
      </div>` : ''}
    `;
  } catch (e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }

  // Verifica pendências após renderizar (não bloqueia)
  checkPendingConfirmations();
}

// Reutiliza o cadastro completo da página de Clientes (com senha + envio de acesso
// por WhatsApp). Evita duplicar o formulário e mantém uma única fonte de verdade.
function openNewClientModal() {
  openClientModal();
}

// ===== MODAL DE CONFIRMAÇÃO DE PENDÊNCIAS =====

// Estado local dos itens pendentes: Map<id, { appt, status, payment_method }>
let _pendingMap = new Map();

async function checkPendingConfirmations() {
  // Só profissionais e admins com agenda própria vinculada precisam confirmar.
  // Master não tem agenda, então pula.
  if (!currentUser || currentUser.role === 'master' || !currentUser.professional_id) return;

  try {
    const profId = currentUser.professional_id;
    const pending = await api.getPendingConfirmation({ professional_id: profId });
    if (!Array.isArray(pending) || pending.length === 0) return;

    // Garante isolamento estrito no frontend: apenas agendamentos da própria profissional logada
    const myPending = pending.filter(a => Number(a.professional_id) === Number(profId));
    if (myPending.length === 0) return;

    openPendingModal(myPending);
  } catch (e) {
    // Falha silenciosa: não interrompe o painel se a checagem der erro
    console.warn('checkPendingConfirmations:', e.message);
  }
}

function openPendingModal(pending) {
  // Garante que só abre para a profissional logada e apenas com seus próprios agendamentos
  if (!currentUser || !currentUser.professional_id) return;
  const myPending = (pending || []).filter(a => Number(a.professional_id) === Number(currentUser.professional_id));
  if (myPending.length === 0) return;
  pending = myPending;

  // Remove overlay anterior se existir
  const old = document.getElementById('pending-overlay');
  if (old) old.remove();

  // Inicializa estado local: default = 'completed' pra cada item
  _pendingMap = new Map();
  pending.forEach(a => _pendingMap.set(a.id, { appt: a, status: 'completed', payment_method: null }));

  const overlay = document.createElement('div');
  overlay.id = 'pending-overlay';
  overlay.innerHTML = `
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
            <div class="pending-item-header">
              <div class="pending-item-client-info">
                <span class="pending-item-dot" style="background:${a.professional_color || '#3B5848'}"></span>
                <div class="pending-item-client-text">
                  <span class="pending-item-name">${esc(a.client_name)}</span>
                  <span class="pending-item-meta">
                    <i class="fa fa-clock" style="font-size:10px"></i> ${formatDate(a.date)} às ${formatTime(a.start_time)}
                    ${a.professional_name ? ` · <i class="fa fa-user" style="font-size:10px"></i> ${esc(a.professional_name)}` : ''}
                  </span>
                </div>
              </div>
              <button type="button" class="pending-edit-btn" onclick="editPendingAppointment(${a.id})" title="Editar serviço e valor" aria-label="Editar serviço e valor">
                <i class="fa fa-pencil-alt"></i> <span>Editar</span>
              </button>
            </div>

            <div class="pending-service-row">
              <div class="pending-service-tag">
                <i class="fa fa-hand-sparkles"></i>
                <span class="pending-service-name" id="pitem-service-${a.id}">${esc(a.services_summary || a.service_name || 'Serviço')}</span>
              </div>
              <div class="pending-price-tag" id="pitem-price-${a.id}">
                ${formatCurrency(a.price)}
              </div>
            </div>

            <div class="pending-item-btns">
              <button type="button" class="pending-btn pending-btn-done active" id="pbtn-done-${a.id}"
                onclick="setPendingStatus(${a.id}, 'completed')">
                <i class="fa fa-check-circle"></i> <span>Concluído</span>
              </button>
              <button type="button" class="pending-btn pending-btn-noshow" id="pbtn-noshow-${a.id}"
                onclick="setPendingStatus(${a.id}, 'no_show')">
                <i class="fa fa-user-times"></i> <span>Não compareceu</span>
              </button>
            </div>

            <div class="pending-payment" id="ppayment-${a.id}">
              <select onchange="setPendingPayment(${a.id}, this.value)">
                <option value="">Forma de pagamento (opcional)</option>
                <option value="pix" ${a.payment_method === 'pix' ? 'selected' : ''}>Pix</option>
                <option value="cash" ${a.payment_method === 'cash' ? 'selected' : ''}>Dinheiro</option>
                <option value="credit" ${a.payment_method === 'credit' ? 'selected' : ''}>Cartão de Crédito</option>
                <option value="debit" ${a.payment_method === 'debit' ? 'selected' : ''}>Cartão de Débito</option>
                <option value="other" ${a.payment_method === 'other' ? 'selected' : ''}>Outro</option>
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
  if (item) item.className = `pending-item status-${status}`;

  const btnDone   = document.getElementById(`pbtn-done-${id}`);
  const btnNoShow = document.getElementById(`pbtn-noshow-${id}`);
  const payment   = document.getElementById(`ppayment-${id}`);

  if (btnDone) btnDone.classList.toggle('active', status === 'completed');
  if (btnNoShow) btnNoShow.classList.toggle('active', status === 'no_show');

  // Mostra seletor de pagamento só quando concluído
  if (payment) payment.style.display = status === 'completed' ? 'block' : 'none';
}

function setPendingPayment(id, value) {
  const entry = _pendingMap.get(id);
  if (entry) entry.payment_method = value || null;
}

function editPendingAppointment(id) {
  const pendingOverlay = document.getElementById('pending-overlay');
  if (pendingOverlay) {
    pendingOverlay.style.display = 'none';
  }

  openEditForm(id, {
    fromPending: true,
    onSave: (updatedAppt) => {
      // 1. Atualiza registro em _pendingMap
      const entry = _pendingMap.get(id);
      if (entry) {
        entry.appt = { ...entry.appt, ...updatedAppt };
        if (updatedAppt.payment_method) {
          entry.payment_method = updatedAppt.payment_method;
        }
      }

      // 2. Atualiza elementos do card no DOM imediatamente
      const serviceEl = document.getElementById(`pitem-service-${id}`);
      if (serviceEl) {
        serviceEl.textContent = updatedAppt.services_summary || updatedAppt.service_name || 'Serviço';
      }
      const priceEl = document.getElementById(`pitem-price-${id}`);
      if (priceEl) {
        priceEl.textContent = formatCurrency(updatedAppt.price);
      }
      const paymentSelect = document.querySelector(`#ppayment-${id} select`);
      if (paymentSelect && updatedAppt.payment_method) {
        paymentSelect.value = updatedAppt.payment_method;
      }

      // 3. Reexibe modal de confirmações pendentes
      if (pendingOverlay) {
        pendingOverlay.style.display = 'flex';
      }
    },
    onCancel: () => {
      if (pendingOverlay) {
        pendingOverlay.style.display = 'flex';
      }
    }
  });
}
window.editPendingAppointment = editPendingAppointment;

async function savePendingConfirmations() {
  const btn = document.getElementById('pending-save-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Salvando...';

  try {
    const updates = [..._pendingMap.values()].map(({ appt, status, payment_method }) => ({
      id: appt.id, status, payment_method, price: appt.price
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
