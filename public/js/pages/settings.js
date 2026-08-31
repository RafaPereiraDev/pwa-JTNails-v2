// ===== SETTINGS PAGE =====
async function loadSettings() {
  const container = document.getElementById('page-settings');

  container.innerHTML = `
    <div class="page-header">
      <h2>Configurações</h2>
    </div>

    <div class="tabs mb-6">
      <button class="tab-btn active" onclick="switchSettingsTab('account', this)">Minha Conta</button>
      ${currentUser.role === 'admin' ? `<button class="tab-btn" onclick="switchSettingsTab('users', this)">Usuários</button>` : ''}
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

    <!-- Users (admin only) -->
    ${currentUser.role === 'admin' ? `
    <div id="settings-users" class="tab-panel">
      <div class="page-header" style="margin-bottom:16px">
        <h3>Usuários do Sistema</h3>
        <button class="btn btn-primary btn-sm" onclick="openUserModal()">
          <i class="fa fa-plus"></i> Novo Usuário
        </button>
      </div>
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
  const usersPanel = document.getElementById('settings-users');
  if (usersPanel) {
    usersPanel.classList.toggle('active', tab === 'users');
    if (tab === 'users') loadUsersTable();
  }
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
                  <td class="font-semibold">${u.name}</td>
                  <td>${u.email}</td>
                  <td><span class="badge badge-${u.role}">${u.role === 'admin' ? 'Administrador' : 'Profissional'}</span></td>
                  <td>${u.professional_name || '-'}</td>
                  <td><span class="badge ${u.active ? 'badge-active' : 'badge-inactive'}">${u.active ? 'Ativo' : 'Inativo'}</span></td>
                  <td>
                    <div style="display:flex;gap:6px">
                      <button class="btn btn-secondary btn-xs" onclick="openUserModal(${u.id})"><i class="fa fa-edit"></i></button>
                      <button class="btn btn-secondary btn-xs" onclick="openResetPassword(${u.id}, '${u.name.replace(/'/g,'')}')"><i class="fa fa-key"></i></button>
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

async function openUserModal(id = null) {
  openModal(id ? 'Editar Usuário' : 'Novo Usuário', '<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>', 'modal-sm');

  let user = null;
  let professionals = [];
  try {
    professionals = await api.getProfessionals(true);
    if (id) {
      const users = await api.getUsers();
      user = users.find(u => u.id === id);
    }
  } catch(e) {}

  const profOptions = professionals.map(p =>
    `<option value="${p.id}" ${user && user.professional_id === p.id ? 'selected' : ''}>${p.name}</option>`
  ).join('');

  document.getElementById('modal-body').innerHTML = `
    <form id="user-form">
      <div class="form-group">
        <label>Nome *</label>
        <input type="text" id="uf-name" value="${user ? user.name : ''}" required />
      </div>
      <div class="form-group">
        <label>E-mail *</label>
        <input type="email" id="uf-email" value="${user ? user.email : ''}" required />
      </div>
      ${!id ? `
      <div class="form-group">
        <label>Senha *</label>
        <input type="password" id="uf-password" required minlength="6" placeholder="Mínimo 6 caracteres" />
      </div>` : ''}
      <div class="form-group">
        <label>Função *</label>
        <select id="uf-role">
          <option value="professional" ${user && user.role === 'professional' ? 'selected' : ''}>Profissional</option>
          <option value="admin" ${user && user.role === 'admin' ? 'selected' : ''}>Administrador</option>
        </select>
      </div>
      <div class="form-group">
        <label>Profissional vinculada</label>
        <select id="uf-prof">
          <option value="">Nenhuma</option>
          ${profOptions}
        </select>
      </div>
      <div id="uf-error" class="alert alert-error" style="display:none"></div>
      <div class="modal-footer" style="padding:0;margin-top:16px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        ${id ? `<button type="button" class="btn btn-danger btn-sm" onclick="deactivateUser(${id})"><i class="fa fa-ban"></i> Desativar</button>` : ''}
        <button type="submit" class="btn btn-primary"><i class="fa fa-save"></i> Salvar</button>
      </div>
    </form>
  `;

  document.getElementById('user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('uf-error');
    errEl.style.display = 'none';
    const data = {
      name: document.getElementById('uf-name').value,
      email: document.getElementById('uf-email').value,
      role: document.getElementById('uf-role').value,
      professional_id: document.getElementById('uf-prof').value || null
    };
    if (!id) data.password = document.getElementById('uf-password').value;
    try {
      if (id) await api.updateUser(id, data);
      else await api.createUser(data);
      toast(id ? 'Usuário atualizado!' : 'Usuário criado!', 'success');
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
