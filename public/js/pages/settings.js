// ===== SETTINGS PAGE =====
async function loadSettings() {
  const container = document.getElementById('page-settings');

  container.innerHTML = `
    <div class="page-header">
      <h2>Configurações</h2>
    </div>

    <div class="tabs mb-6">
      <button class="tab-btn active" onclick="switchSettingsTab('account', this)">Minha Conta</button>
      ${currentUser.professional_id ? `<button class="tab-btn" onclick="switchSettingsTab('profile', this)">Meu Perfil</button>` : ''}
      ${isAdminLevel() ? `<button class="tab-btn" onclick="switchSettingsTab('users', this)">Usuários</button>` : ''}
    </div>

    <!-- Account -->
    <div id="settings-account" class="tab-panel active">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Alterar Senha</div>
        </div>
        <div class="card-body" style="max-width:400px">
          <form id="change-pw-form">
            <div class="form-group">
              <label>Senha atual</label>
              <input type="password" id="pw-current" required placeholder="••••••••" />
            </div>
            <div class="form-group">
              <label>Nova senha</label>
              <input type="password" id="pw-new" required placeholder="Mínimo 6 caracteres" minlength="6" />
            </div>
            <div class="form-group">
              <label>Confirmar nova senha</label>
              <input type="password" id="pw-confirm" required placeholder="••••••••" />
            </div>
            <div id="pw-error" class="alert alert-error" style="display:none"></div>
            <button type="submit" class="btn btn-primary"><i class="fa fa-lock"></i> Alterar Senha</button>
          </form>
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

  const usersPanel = document.getElementById('settings-users');
  if (usersPanel) {
    usersPanel.classList.toggle('active', tab === 'users');
    if (tab === 'users') loadUsersTable();
  }
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
                  <td><span class="badge ${u.active ? 'badge-active' : 'badge-inactive'}">${u.active ? 'Ativo' : 'Inativo'}</span></td>
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
        <input type="password" id="reset-pw" required minlength="6" placeholder="Mínimo 6 caracteres" />
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

async function deleteUserConfirm(id, name) {
  const ok = await confirmDialog(
    `Tem certeza que deseja excluir o usuário <strong>${esc(name)}</strong>?<br>` +
    `<small style="color:#9ca3af">Se houver histórico de agendamentos, ele será apenas desativado. O acesso ao sistema é removido.</small>`
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
