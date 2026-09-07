// ===== SETTINGS PAGE =====
// Helper: alterna visibilidade de qualquer campo de senha
function togglePw(inputId, iconId) {
  const inp  = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  if (icon) { icon.className = show ? 'fa fa-eye-slash' : 'fa fa-eye'; }
}

async function loadSettings() {
  const container = document.getElementById('page-settings');

  container.innerHTML = `
    <div class="page-header">
      <h2>Configurações</h2>
    </div>

    <div class="tabs mb-6">
      <button class="tab-btn active" onclick="switchSettingsTab('account', this)">Minha Conta</button>
      ${currentUser.professional_id ? `<button class="tab-btn" onclick="switchSettingsTab('profile', this)">Meu Perfil</button>` : ''}
      ${isAdminLevel() ? `<button class="tab-btn" onclick="switchSettingsTab('messages', this)">Mensagens</button>` : ''}
      ${isAdminLevel() ? `<button class="tab-btn" onclick="switchSettingsTab('users', this)">Usuários</button>` : ''}
    </div>

    <div id="settings-account" class="tab-panel active">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Alterar Senha</div>
        </div>
        <div class="card-body" style="max-width:400px">
          <form id="change-pw-form">
            <div class="form-group">
              <label>Senha atual</label>
              <div class="input-icon">
                <i class="fa fa-lock"></i>
                <input type="password" id="pw-current" required placeholder="••••••••" />
                <button type="button" class="btn-eye" onclick="togglePw('pw-current','eye-cur')"><i class="fa fa-eye" id="eye-cur"></i></button>
              </div>
            </div>
            <div class="form-group">
              <label>Nova senha</label>
              <div class="input-icon">
                <i class="fa fa-lock"></i>
                <input type="password" id="pw-new" required placeholder="Mínimo 6 caracteres" minlength="6" />
                <button type="button" class="btn-eye" onclick="togglePw('pw-new','eye-new')"><i class="fa fa-eye" id="eye-new"></i></button>
              </div>
            </div>
            <div class="form-group">
              <label>Confirmar nova senha</label>
              <div class="input-icon">
                <i class="fa fa-lock"></i>
                <input type="password" id="pw-confirm" required placeholder="••••••••" />
                <button type="button" class="btn-eye" onclick="togglePw('pw-confirm','eye-conf')"><i class="fa fa-eye" id="eye-conf"></i></button>
              </div>
            </div>
            <div id="pw-error" class="alert alert-error" style="display:none"></div>
            <button type="submit" class="btn btn-primary"><i class="fa fa-lock"></i> Alterar Senha</button>
          </form>
        </div>
      </div>

      <div class="card mt-4">
        <div class="card-header">
          <div class="card-title"><i class="fa fa-bell" style="color:#B29661"></i> Notificações</div>
        </div>
        <div class="card-body" style="max-width:480px">
          <p class="text-sm text-muted mb-4">Receba um aviso no celular quando uma cliente fizer um novo agendamento na sua agenda.</p>

          <label class="notif-toggle">
            <span>
              <strong>Notificações de novos agendamentos</strong>
              <span class="text-xs text-muted" style="display:block">Aviso instantâneo quando alguém agenda</span>
            </span>
            <input type="checkbox" id="notif-new" />
          </label>

          <div id="notif-status" class="text-xs text-muted" style="margin-top:10px"></div>
        </div>
      </div>
    </div>

    <!-- Meu Perfil (profissionais / admins com professional_id) -->
    ${currentUser.professional_id ? `
    <div id="settings-profile" class="tab-panel">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Meu Perfil Profissional</div>
        </div>
        <div class="card-body" style="max-width:520px">
          <p class="text-sm text-muted mb-4">Sua foto e biografia poderão ser exibidas para as clientes escolherem a profissional.</p>
          <div id="profile-form-container"><div class="loading"><i class="fa fa-spinner fa-spin"></i></div></div>
        </div>
      </div>

    </div>` : ''}

    <!-- Mensagens (admin e master) -->
    ${isAdminLevel() ? `
    <div id="settings-messages" class="tab-panel">
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fa fa-cake-candles" style="color:#B29661"></i> Mensagem de Aniversário</div>
        </div>
        <div class="card-body" style="max-width:560px">
          <p class="text-sm text-muted mb-4">
            Esta é a mensagem enviada pelo WhatsApp quando você clica em "Parabenizar" no card de aniversários do Dashboard.
            Use a tag <strong style="color:#B29661">{nome}</strong> onde quiser que apareça o primeiro nome da aniversariante.
          </p>
          <form id="birthday-msg-form">
            <div class="form-group">
              <label>Mensagem</label>
              <textarea id="birthday-msg" rows="4" maxlength="500"
                placeholder="Digite a mensagem de aniversário..."></textarea>
              <div class="text-xs text-muted" style="text-align:right;margin-top:4px"><span id="bmsg-count">0</span>/500</div>
            </div>
            <div id="bmsg-preview" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-bottom:12px;font-size:14px;color:#166534;display:none">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;color:#15803d">Prévia (exemplo: Maria)</div>
              <span id="bmsg-preview-text"></span>
            </div>
            <div id="bmsg-error" class="alert alert-error" style="display:none"></div>
            <button type="submit" class="btn btn-primary"><i class="fa fa-save"></i> Salvar Mensagem</button>
          </form>
        </div>
      </div>
    </div>` : ''}

    <!-- Users (admin e master) -->
    ${isAdminLevel() ? `
    <div id="settings-users" class="tab-panel">
      <div class="page-header" style="margin-bottom:8px">
        <h3>Usuários do Sistema</h3>
      </div>
      <p class="text-sm text-muted mb-4">Para adicionar alguém novo, use a aba <strong>Profissionais</strong>. Aqui você ajusta a função de cada usuário.</p>
      <div id="users-table"></div>
    </div>` : ''}
  `;

  document.getElementById('change-pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('pw-error');
    errEl.style.display = 'none';
    const newPw = document.getElementById('pw-new').value;
    const confirm = document.getElementById('pw-confirm').value;
    if (newPw !== confirm) {
      errEl.textContent = 'As senhas não coincidem';
      errEl.style.display = '';
      return;
    }
    try {
      await api.changePassword({
        current_password: document.getElementById('pw-current').value,
        new_password: newPw
      });
      toast('Senha alterada com sucesso!', 'success');
      e.target.reset();
    } catch(err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
    }
  });

  // Inicializa os toggles de notificação
  initNotificationToggles();
}

// ===== NOTIFICAÇÕES WEB PUSH =====
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function initNotificationToggles() {
  const newToggle = document.getElementById('notif-new');
  const statusEl  = document.getElementById('notif-status');
  if (!newToggle) return;

  const suportado = ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  if (!suportado) {
    statusEl.textContent = '⚠️ Este navegador não suporta notificações push.';
    newToggle.disabled = true;
    return;
  }

  // Carrega preferências salvas
  try {
    const prefs = await api.getNotificationPrefs();
    newToggle.checked = prefs.notify_new_appointment;
  } catch (e) {
    newToggle.checked = true;
  }

  // Ao ativar notificações: pede permissão + registra a subscription
  newToggle.addEventListener('change', async () => {
    if (newToggle.checked) {
      const ok = await ativarPush();
      if (!ok) { newToggle.checked = false; return; }
    } else {
      await desativarPush();
    }
    try {
      await api.updateNotificationPrefs({
        notify_new_appointment: newToggle.checked,
      });
      toast('Preferência salva', 'success');
    } catch (e) { toast(e.message, 'error'); }
  });
}

async function ativarPush() {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      toast('Permissão de notificação negada pelo navegador', 'error');
      return false;
    }

    const reg = await navigator.serviceWorker.ready;
    const { publicKey } = await api.getPushPublicKey();
    if (!publicKey) {
      toast('Notificações não configuradas no servidor', 'error');
      return false;
    }

    // Reaproveita a inscrição existente ou cria uma nova
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    await api.subscribePush(sub.toJSON());
    toast('Notificações ativadas!', 'success');
    return true;
  } catch (e) {
    console.error('ativarPush:', e);
    toast('Não foi possível ativar as notificações', 'error');
    return false;
  }
}

async function desativarPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api.unsubscribePush(sub.endpoint);
      await sub.unsubscribe();
    }
  } catch (e) {
    console.warn('desativarPush:', e.message);
  }
}

function switchSettingsTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('settings-account').classList.toggle('active', tab === 'account');

  const profilePanel = document.getElementById('settings-profile');
  if (profilePanel) {
    profilePanel.classList.toggle('active', tab === 'profile');
    if (tab === 'profile') loadMyProfileForm();
  }

  const messagesPanel = document.getElementById('settings-messages');
  if (messagesPanel) {
    messagesPanel.classList.toggle('active', tab === 'messages');
    if (tab === 'messages') loadBirthdayMessageForm();
  }

  const usersPanel = document.getElementById('settings-users');
  if (usersPanel) {
    usersPanel.classList.toggle('active', tab === 'users');
    if (tab === 'users') loadUsersTable();
  }
}

// ===== MENSAGEM DE ANIVERSÁRIO =====
async function loadBirthdayMessageForm() {
  const textarea = document.getElementById('birthday-msg');
  if (!textarea) return;

  const countEl   = document.getElementById('bmsg-count');
  const previewEl = document.getElementById('bmsg-preview');
  const previewTx = document.getElementById('bmsg-preview-text');

  function updatePreview() {
    const val = textarea.value;
    countEl.textContent = val.length;
    if (val.trim()) {
      previewTx.textContent = val.replace(/\{nome\}/g, 'Maria');
      previewEl.style.display = '';
    } else {
      previewEl.style.display = 'none';
    }
  }

  // Carrega a mensagem salva
  try {
    const { message } = await api.getBirthdayMessage();
    textarea.value = message || '';
  } catch (e) {
    textarea.value = '';
  }
  updatePreview();

  textarea.oninput = updatePreview;

  document.getElementById('birthday-msg-form').onsubmit = async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('bmsg-error');
    errEl.style.display = 'none';
    try {
      await api.updateBirthdayMessage(textarea.value);
      toast('Mensagem de aniversário salva!', 'success');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
    }
  };
}

// ===== MEU PERFIL (foto + bio) =====
let _profilePhotoData = null; // data URL da nova foto escolhida (null = não alterou)

async function loadMyProfileForm() {
  const container = document.getElementById('profile-form-container');
  if (!container) return;
  loading(container);
  _profilePhotoData = null;

  let prof;
  try {
    prof = await api.getMyProfile();
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`;
    return;
  }

  const bio = prof.bio || '';
  const avatarInner = prof.photo
    ? `<img id="profile-photo-preview" src="${esc(prof.photo)}" alt="Foto de perfil" style="width:100%;height:100%;object-fit:cover" />`
    : `<span id="profile-photo-initials">${getInitials(prof.name)}</span>`;

  container.innerHTML = `
    <form id="profile-form">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
        <div id="profile-avatar" style="width:88px;height:88px;border-radius:50%;overflow:hidden;background:${prof.color || 'var(--primary)'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;flex-shrink:0">
          ${avatarInner}
        </div>
        <div>
          <input type="file" id="profile-photo-input" accept="image/png,image/jpeg,image/webp" style="display:none" />
          <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('profile-photo-input').click()">
            <i class="fa fa-camera"></i> Escolher foto
          </button>
          ${prof.photo ? `<button type="button" class="btn btn-ghost btn-sm" onclick="removeProfilePhoto()" style="color:var(--danger)"><i class="fa fa-trash"></i> Remover</button>` : ''}
          <div class="text-xs text-muted" style="margin-top:6px">JPG, PNG ou WEBP. A imagem é ajustada automaticamente.</div>
        </div>
      </div>

      <div class="form-group">
        <label>Biografia <span class="text-xs text-muted">(máx. 500 caracteres)</span></label>
        <textarea id="profile-bio" rows="4" maxlength="500" placeholder="Fale um pouco sobre você e seu trabalho...">${esc(bio)}</textarea>
        <div class="text-xs text-muted" style="text-align:right;margin-top:4px"><span id="bio-count">${bio.length}</span>/500</div>
      </div>

      <div id="profile-error" class="alert alert-error" style="display:none"></div>
      <button type="submit" class="btn btn-primary"><i class="fa fa-save"></i> Salvar Perfil</button>
    </form>
  `;

  // Contador de caracteres da bio
  const bioEl = document.getElementById('profile-bio');
  bioEl.addEventListener('input', () => {
    document.getElementById('bio-count').textContent = bioEl.value.length;
  });

  // Seleção e redimensionamento da foto
  document.getElementById('profile-photo-input').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const errEl = document.getElementById('profile-error');
    errEl.style.display = 'none';
    try {
      _profilePhotoData = await resizeImageToDataURL(file, 400, 0.85);
      const avatar = document.getElementById('profile-avatar');
      avatar.innerHTML = `<img src="${_profilePhotoData}" alt="Prévia" style="width:100%;height:100%;object-fit:cover" />`;
    } catch(err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
    }
  });

  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('profile-error');
    errEl.style.display = 'none';
    const payload = { bio: bioEl.value };
    if (_profilePhotoData !== null) payload.photo = _profilePhotoData; // só envia se mudou
    try {
      const res = await api.updateMyProfile(payload);
      toast('Perfil atualizado com sucesso!', 'success');
      // Atualiza a foto na sidebar imediatamente
      if (_profilePhotoData !== null && currentUser) {
        currentUser.professional_photo = res.photo || _profilePhotoData;
        applySidebarAvatar();
      }
      _profilePhotoData = null;
    } catch(err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
    }
  });
}

function removeProfilePhoto() {
  _profilePhotoData = ''; // string vazia sinaliza remoção ao backend
  const avatar = document.getElementById('profile-avatar');
  const name = currentUser ? currentUser.name : '?';
  avatar.innerHTML = `<span>${getInitials(name)}</span>`;
}

async function loadUsersTable() {
  const container = document.getElementById('users-table');
  if (!container) return;
  loading(container);
  try {
    const users = await api.getUsers();
    container.innerHTML = `
      <div class="card">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr><th>Nome</th><th>E-mail</th><th>Função</th><th>Profissional</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr>
                  <td class="font-semibold">${esc(u.name)}</td>
                  <td>${esc(u.email)}</td>
                  <td><span class="badge badge-${u.role}">${ {master:'Mestre', admin:'Administradora', professional:'Profissional'}[u.role] || esc(u.role) }</span></td>
                  <td>${esc(u.professional_name || '-')}</td>
                  <td>
                    <button class="btn btn-xs ${u.active ? 'btn-success' : 'btn-secondary'}"
                      onclick="toggleUserStatus(${u.id}, ${u.active})"
                      ${u.id === currentUser?.id ? 'disabled title="Não pode alterar o próprio status"' : ''}>
                      <i class="fa fa-${u.active ? 'check-circle' : 'ban'}"></i>
                      ${u.active ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                  <td>
                    <div style="display:flex;gap:6px">
                      <button class="btn btn-secondary btn-xs" onclick="openUserModal(${u.id})" title="Editar função"><i class="fa fa-user-gear"></i> Função</button>
                      ${isMaster() ? `<button class="btn btn-secondary btn-xs" onclick="openResetPassword(${u.id}, '${esc(u.name).replace(/'/g,'&#39;')}')" title="Redefinir senha"><i class="fa fa-key"></i></button>` : ''}
                      ${(() => {
                        // Não mostra excluir para si mesmo. Admin não exclui admin/master; só master pode.
                        const isSelf = currentUser && u.id === currentUser.id;
                        const alvoAdmin = u.role === 'admin' || u.role === 'master';
                        const podeExcluir = !isSelf && (isMaster() || !alvoAdmin);
                        return podeExcluir
                          ? `<button class="btn btn-danger btn-xs" onclick="deleteUserConfirm(${u.id}, '${esc(u.name).replace(/'/g,'&#39;')}')" title="Excluir usuário"><i class="fa fa-trash"></i></button>`
                          : '';
                      })()}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch(e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

// Edita apenas a FUNÇÃO (papel) do usuário. Criação de gente é feita na aba Profissionais.
async function openUserModal(id) {
  openModal('Editar Função', '<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>', 'modal-sm');

  let user = null;
  try {
    const users = await api.getUsers();
    user = users.find(u => u.id === id);
  } catch(e) {}

  if (!user) {
    document.getElementById('modal-body').innerHTML = `<div class="alert alert-error">Usuário não encontrado</div>`;
    return;
  }

  // O usuário mestre não tem a função alterada por aqui
  const isMasterUser = user.role === 'master';

  document.getElementById('modal-body').innerHTML = `
    <div style="margin-bottom:16px">
      <div class="font-semibold" style="font-size:16px">${esc(user.name)}</div>
      <div class="text-sm text-muted">${esc(user.email)}</div>
    </div>
    <form id="user-form">
      ${isMasterUser ? `
        <div class="alert alert-info">A função do administrador mestre não pode ser alterada.</div>
      ` : `
        <div class="form-group">
          <label>Função *</label>
          <select id="uf-role">
            <option value="professional" ${user.role === 'professional' ? 'selected' : ''}>Profissional (só atende)</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administradora (atende + gerencia)</option>
          </select>
        </div>
      `}
      <div id="uf-error" class="alert alert-error" style="display:none"></div>
      <div class="modal-footer" style="padding:0;margin-top:16px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Fechar</button>
        ${isMasterUser ? '' : `<button type="submit" class="btn btn-primary"><i class="fa fa-save"></i> Salvar função</button>`}
      </div>
    </form>
  `;

  if (isMasterUser) return;

  document.getElementById('user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('uf-error');
    errEl.style.display = 'none';
    try {
      await api.updateUser(id, { role: document.getElementById('uf-role').value });
      toast('Função atualizada!', 'success');
      closeModal();
      loadUsersTable();
    } catch(err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
    }
  });
}

function openResetPassword(id, name) {
  openModal(`Redefinir Senha — ${name}`, `
    <form id="reset-pw-form">
      <div class="form-group">
        <label>Nova senha *</label>
        <div class="input-icon">
          <i class="fa fa-lock"></i>
          <input type="password" id="reset-pw" required minlength="6" placeholder="Mínimo 6 caracteres" />
          <button type="button" class="btn-eye" onclick="togglePw('reset-pw','eye-reset')"><i class="fa fa-eye" id="eye-reset"></i></button>
        </div>
      </div>
      <div id="reset-error" class="alert alert-error" style="display:none"></div>
      <div class="modal-footer" style="padding:0;margin-top:16px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary"><i class="fa fa-key"></i> Redefinir</button>
      </div>
    </form>
  `, 'modal-sm');

  document.getElementById('reset-pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('reset-error');
    try {
      await api.resetUserPassword(id, document.getElementById('reset-pw').value);
      toast('Senha redefinida com sucesso!', 'success');
      closeModal();
    } catch(err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
    }
  });
}

async function deactivateUser(id) {
  const ok = await confirmDialog('Desativar este usuário?');
  if (!ok) return;
  try {
    await api.deleteUser(id);
    toast('Usuário desativado', 'success');
    closeModal();
    loadUsersTable();
  } catch(e) {
    toast(e.message, 'error');
  }
}

async function toggleUserStatus(id, currentlyActive) {
  const acao = currentlyActive ? 'desativar' : 'ativar';
  const ok = await confirmDialog(`Deseja <strong>${acao}</strong> este usuário?`);
  if (!ok) return;
  try {
    const res = await api.toggleUserStatus(id);
    toast(res.message, 'success');
    loadUsersTable();
  } catch(e) {
    toast(e.message, 'error');
  }
}

async function deleteUserConfirm(id, name) {
  const ok = await confirmDialog(
    `Tem certeza que deseja <strong>excluir permanentemente</strong> o usuário <strong>${esc(name)}</strong>?<br>` +
    `<small style="color:#ef4444">⚠️ Todos os agendamentos, bloqueios e transações vinculados serão excluídos em cascata. Esta ação não pode ser desfeita.</small>`
  );
  if (!ok) return;
  try {
    const res = await api.deleteUser(id);
    toast(res.message || 'Usuário excluído', 'success');
    loadUsersTable();
  } catch(e) {
    toast(e.message, 'error');
  }
}
