// ===== SETTINGS PAGE =====
// Helper: alterna visibilidade de qualquer campo de senha
function togglePw(inputId, iconId) {
  const inp = document.getElementById(inputId);
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

    <div class="tabs settings-tabs mb-6">
      <button class="tab-btn active" onclick="switchSettingsTab('account', this)">Minha Conta</button>
      ${currentUser.professional_id ? `<button class="tab-btn" onclick="switchSettingsTab('profile', this)">Meu Perfil</button>` : ''}
      ${isAdminLevel() ? `<button class="tab-btn" onclick="switchSettingsTab('appearance', this)">Cores e Aparência</button>` : ''}
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
          <div class="card-title"><i class="fa fa-bell" style="color:var(--color-primary)"></i> Notificações</div>
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

    <!-- Personalização Visual / Cores e Aparência (admin e master) -->
    ${isAdminLevel() ? `
    <div id="settings-appearance" class="tab-panel">
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fa fa-palette" style="color:var(--primary)"></i> Personalização Visual (Cores e Aparência)</div>
        </div>
        <div class="card-body" style="padding:0">
          <div id="theme-customizer-container">
            <div class="loading" style="padding:24px"><i class="fa fa-spinner fa-spin"></i></div>
          </div>
        </div>
      </div>
    </div>` : ''}

    <!-- Mensagens (admin e master) -->
    ${isAdminLevel() ? `
    <div id="settings-messages" class="tab-panel">
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fa fa-cake-candles" style="color:var(--color-primary)"></i> Mensagem de Aniversário</div>
        </div>
        <div class="card-body" style="max-width:560px">
          <p class="text-sm text-muted mb-4">
            Esta é a mensagem enviada pelo WhatsApp quando você clica em "Parabenizar" no card de aniversários do Dashboard.
            Use a tag <strong style="color:var(--color-primary)">{nome}</strong> onde quiser que apareça o primeiro nome da aniversariante.
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
    } catch (err) {
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
  const statusEl = document.getElementById('notif-status');
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

  const appearancePanel = document.getElementById('settings-appearance');
  if (appearancePanel) {
    appearancePanel.classList.toggle('active', tab === 'appearance');
    if (tab === 'appearance') loadThemeSettingsForm();
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

// ===== PERSONALIZAÇÃO VISUAL (CORES E APARÊNCIA) =====
const THEME_FIELDS_CONFIG = [
  {
    varName: '--color-primary',
    pickerId: 'picker-primary',
    label: 'Cor Principal / Destaques',
    desc: 'Botões principais, abas ativas e links',
    defaultVal: '#4E6754',
  },
  {
    varName: '--color-logo-icon',
    pickerId: 'picker-logo-icon',
    label: 'Ícone da Marca / Mãozinha',
    desc: 'Cor do logótipo de mãos na barra de navegação e cabeçalho',
    defaultVal: '#C5A880',
  },
  {
    varName: '--color-bg-main',
    pickerId: 'picker-bg-main',
    label: 'Fundo Geral do App',
    desc: 'Cor de fundo principal das páginas (Creme / Off-white)',
    defaultVal: '#FAF8F4',
  },
  {
    varName: '--color-card',
    pickerId: 'picker-card',
    label: 'Fundo dos Cards e Caixas',
    desc: 'Cards de agendamentos, tabelas e blocos',
    defaultVal: '#FFFFFF',
  },
  {
    varName: '--color-metric-card',
    pickerId: 'picker-metric-card',
    label: 'Cards de Indicadores',
    desc: 'Fundo dos cards de resumo no topo do Dashboard',
    defaultVal: '#A3B5A0',
  },
  {
    varName: '--color-navbar',
    pickerId: 'picker-navbar',
    label: 'Barra Superior (Topbar)',
    desc: 'Cabeçalho fixo no topo da tela',
    defaultVal: '#FFFFFF',
  },
  {
    varName: '--color-sidebar',
    pickerId: 'picker-sidebar',
    label: 'Menu Lateral (Sidebar)',
    desc: 'Fundo da gaveta de navegação lateral',
    defaultVal: '#4E6754',
  },
  {
    varName: '--color-modal',
    pickerId: 'picker-modal',
    label: 'Fundo dos Modais',
    desc: 'Janelas de confirmação e cadastros',
    defaultVal: '#FFFFFF',
  },
  {
    varName: '--color-text-main',
    pickerId: 'picker-text-main',
    label: 'Títulos e Texto Principal',
    desc: 'Cabeçalhos, nomes de clientes e valores',
    defaultVal: '#212F27',
  },
  {
    varName: '--color-text-muted',
    pickerId: 'picker-text-muted',
    label: 'Subtítulos e Textos Secundários',
    desc: 'Descrições, horários e rótulos auxiliares',
    defaultVal: '#6B7280',
  },
];

async function loadThemeSettingsForm() {
  const container = document.getElementById('theme-customizer-container');
  if (!container) return;

  let currentColors = {};
  let defaults = {};
  THEME_FIELDS_CONFIG.forEach(f => {
    defaults[f.varName] = f.defaultVal;
    currentColors[f.varName] = f.defaultVal;
  });
  defaults.logo_icon = '#C5A880';

  try {
    const cached = localStorage.getItem('jtnails_theme_colors');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === 'object') {
        currentColors = { ...currentColors, ...parsed };
        if (parsed.logo_icon && !parsed['--color-logo-icon']) {
          currentColors['--color-logo-icon'] = parsed.logo_icon;
        }
      }
    }
  } catch (_) {}

  try {
    const res = await api.getThemeSettings();
    if (res && res.defaults) defaults = { ...defaults, ...res.defaults };
    if (res && res.colors) {
      currentColors = { ...defaults, ...currentColors, ...res.colors };
      if (res.colors.logo_icon && !res.colors['--color-logo-icon']) {
        currentColors['--color-logo-icon'] = res.colors.logo_icon;
      }
    }
  } catch (_) {}

  container.innerHTML = `
    <div class="theme-customizer-layout">
      <div class="theme-customizer-main">
        <p class="text-sm text-muted" style="margin:0 0 4px 0;line-height:1.45">
          Personalize as cores do sistema. Ao escolher uma cor abaixo, a prévia no mini-smartphone muda instantaneamente. Clique em <strong>Salvar Alterações de Cor</strong> para aplicar no aplicativo.
        </p>

        <div class="theme-pickers-list">
          ${THEME_FIELDS_CONFIG.map(field => {
            const val = (currentColors[field.varName] || field.defaultVal).toUpperCase();
            const inputId = field.pickerId || `picker-${field.varName.replace('--color-', '')}`;
            return `
              <div class="theme-picker-card">
                <div class="theme-picker-info">
                  <h4 class="theme-picker-title">${esc(field.label)}</h4>
                  <p class="theme-picker-desc">${esc(field.desc)}</p>
                </div>
                <div class="theme-picker-controls">
                  <input
                    type="text"
                    class="theme-hex-input"
                    data-hex-for="${field.varName}"
                    value="${val}"
                    maxlength="7"
                    spellcheck="false"
                    aria-label="Código hexadecimal de ${esc(field.label)}"
                  />
                  <input
                    type="color"
                    id="${inputId}"
                    class="theme-color-input"
                    data-var="${field.varName}"
                    value="${val}"
                    title="Escolher ${esc(field.label)}"
                  />
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="theme-actions-bar">
          <button type="button" class="btn btn-primary btn-theme-save" id="btn-save-theme">
            <i class="fas fa-save"></i> <span>Salvar Alterações de Cor</span>
          </button>
          <button type="button" class="btn btn-secondary btn-theme-reset" id="btn-reset-theme">
            <i class="fas fa-undo-alt"></i> <span>Restaurar Cores Originais</span>
          </button>
        </div>
      </div>

      <!-- Mini-Mockup de Smartphone em Tempo Real -->
      <div class="theme-mockup-wrapper">
        <div class="theme-mockup-caption">
          <i class="fa fa-mobile-screen-button"></i> Prévia ao Vivo
        </div>
        <div class="theme-phone-mockup">
          <div class="theme-phone-notch"></div>
          <div class="theme-phone-screen">
            <div class="theme-phone-navbar">
              <div class="theme-phone-brand">
                <i class="fa fa-hand-sparkles"></i>
                <span>Atelier Nails</span>
              </div>
              <span class="theme-phone-cta-mini">+ Agendar</span>
            </div>
            <div class="theme-phone-body">
              <div class="theme-phone-sidebar">
                <div class="theme-phone-nav-pill active"><i class="fa fa-home"></i></div>
                <div class="theme-phone-nav-pill"><i class="fa fa-calendar"></i></div>
                <div class="theme-phone-nav-pill"><i class="fa fa-users"></i></div>
                <div class="theme-phone-nav-pill"><i class="fa fa-paintbrush"></i></div>
                <div class="theme-phone-nav-pill"><i class="fa fa-cog"></i></div>
              </div>
              <div class="theme-phone-content">
                <div class="theme-phone-metric-row">
                  <div class="theme-phone-metric">
                    <div class="theme-phone-metric-icon"><i class="fa fa-calendar-check"></i></div>
                    <div>
                      <div class="theme-phone-metric-val">12</div>
                      <div class="theme-phone-metric-lbl">Hoje</div>
                    </div>
                  </div>
                  <div class="theme-phone-metric">
                    <div class="theme-phone-metric-icon"><i class="fa fa-coins"></i></div>
                    <div>
                      <div class="theme-phone-metric-val">R$ 840</div>
                      <div class="theme-phone-metric-lbl">Receita</div>
                    </div>
                  </div>
                </div>

                <div class="theme-phone-card">
                  <div class="theme-phone-card-title">14:00 • Carolina Mendes</div>
                  <div class="theme-phone-card-sub">Alongamento em Gel + Esmaltação</div>
                  <span class="theme-phone-badge">Confirmado • R$ 160,00</span>
                </div>

                <div class="theme-phone-card">
                  <div class="theme-phone-card-title">16:00 • Beatriz Souza</div>
                  <div class="theme-phone-card-sub">Manicure + Pedicure Tradicional</div>
                </div>

                <div class="theme-phone-modal-preview">
                  <div class="theme-phone-modal-hdr">
                    <span>Confirmar Atendimento</span>
                    <i class="fa fa-times" style="color:var(--color-text-muted)"></i>
                  </div>
                  <div class="theme-phone-btn">Salvar Alterações</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const inputs = container.querySelectorAll('.theme-color-input');
  const hexInputs = container.querySelectorAll('.theme-hex-input');
  const previewMockup = container.querySelector('.theme-phone-mockup');

  function collectFormColors() {
    const map = {};
    inputs.forEach(inp => {
      map[inp.dataset.var] = inp.value.toUpperCase();
    });
    if (map['--color-logo-icon']) {
      map.logo_icon = map['--color-logo-icon'];
    }
    return map;
  }

  function applyThemeColorsToPreview(colors) {
    if (!previewMockup || !colors) return;
    Object.entries(colors).forEach(([key, val]) => {
      if (key.startsWith('--') && typeof val === 'string' && /^#[0-9A-Fa-f]{6}$/.test(val.trim())) {
        previewMockup.style.setProperty(key, val.trim());
      }
    });
    if (colors.logo_icon && !colors['--color-logo-icon'] && /^#[0-9A-Fa-f]{6}$/.test(colors.logo_icon.trim())) {
      previewMockup.style.setProperty('--color-logo-icon', colors.logo_icon.trim());
    }
    if (colors['--color-primary'] && typeof darkenHex === 'function') {
      previewMockup.style.setProperty('--color-primary-hover', darkenHex(colors['--color-primary'], 0.18));
    }
  }

  // Inicializa o mini-mockup com as cores carregadas nos seletores
  applyThemeColorsToPreview(collectFormColors());

  inputs.forEach(inp => {
    inp.addEventListener('input', () => {
      const varName = inp.dataset.var;
      const val = inp.value.toUpperCase();
      const hexInp = container.querySelector(`[data-hex-for="${varName}"]`);
      if (hexInp) {
        if ('value' in hexInp) hexInp.value = val;
        else hexInp.textContent = val;
      }
      // Atualiza SOMENTE a prévia (mini-smartphone), sem alterar a tela principal até clicar em Salvar
      applyThemeColorsToPreview(collectFormColors());
    });
  });

  hexInputs.forEach(hexInp => {
    hexInp.addEventListener('input', () => {
      let raw = hexInp.value.trim().toUpperCase();
      if (raw && !raw.startsWith('#')) raw = '#' + raw;
      if (/^#[0-9A-F]{6}$/.test(raw)) {
        const varName = hexInp.getAttribute('data-hex-for');
        const colorInp = container.querySelector(`.theme-color-input[data-var="${varName}"]`);
        if (colorInp) colorInp.value = raw;
        applyThemeColorsToPreview(collectFormColors());
      }
    });
    hexInp.addEventListener('blur', () => {
      const varName = hexInp.getAttribute('data-hex-for');
      const colorInp = container.querySelector(`.theme-color-input[data-var="${varName}"]`);
      if (colorInp) hexInp.value = colorInp.value.toUpperCase();
    });
  });

  const btnSave = document.getElementById('btn-save-theme');
  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const colors = collectFormColors();
      btnSave.disabled = true;
      try {
        const res = await api.updateThemeSettings({ colors });
        const saved = (res && res.colors) ? { ...colors, ...res.colors } : colors;
        if (colors['--color-logo-icon']) {
          saved['--color-logo-icon'] = colors['--color-logo-icon'];
          saved.logo_icon = colors['--color-logo-icon'];
        }
        applyThemeColorsToPreview(saved);
        if (typeof applyThemeColorsToRoot === 'function') applyThemeColorsToRoot(saved);
        localStorage.setItem('jtnails_theme_colors', JSON.stringify(saved));
        toast('Cores e aparência salvas com sucesso!', 'success');
      } catch (err) {
        toast(err.message || 'Erro ao salvar cores', 'error');
      } finally {
        btnSave.disabled = false;
      }
    });
  }

  const btnRestore = document.getElementById('btn-reset-theme') || document.getElementById('btn-restore-theme');
  if (btnRestore) {
    btnRestore.addEventListener('click', async () => {
      defaults['--color-logo-icon'] = '#C5A880';
      defaults.logo_icon = '#C5A880';
      defaults['--color-primary'] = '#4E6754';
      defaults['--color-bg-main'] = '#FAF8F4';
      defaults['--color-sidebar'] = '#4E6754';
      inputs.forEach(inp => {
        const defVal = (defaults[inp.dataset.var] || '#FFFFFF').toUpperCase();
        inp.value = defVal;
        const hexInp = container.querySelector(`[data-hex-for="${inp.dataset.var}"]`);
        if (hexInp) {
          if ('value' in hexInp) hexInp.value = defVal;
          else hexInp.textContent = defVal;
        }
      });
      applyThemeColorsToPreview(defaults);
      if (typeof applyThemeColorsToRoot === 'function') applyThemeColorsToRoot(defaults);
      btnRestore.disabled = true;
      try {
        const res = await api.updateThemeSettings({ colors: defaults });
        const saved = (res && res.colors) ? res.colors : defaults;
        localStorage.setItem('jtnails_theme_colors', JSON.stringify(saved));
        toast('Padrão Atelier JT Nails restaurado!', 'success');
      } catch (err) {
        toast(err.message || 'Erro ao restaurar padrão', 'error');
      } finally {
        btnRestore.disabled = false;
      }
    });
  }
}

// ===== MENSAGEM DE ANIVERSÁRIO =====
async function loadBirthdayMessageForm() {
  const textarea = document.getElementById('birthday-msg');
  if (!textarea) return;

  const countEl = document.getElementById('bmsg-count');
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
  } catch (e) {
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

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div class="form-group" style="margin:0">
          <label>Início do Expediente</label>
          <input type="time" id="profile-work-start" value="${prof.work_start_time ? String(prof.work_start_time).slice(0, 5) : '08:00'}" required />
        </div>
        <div class="form-group" style="margin:0">
          <label>Término do Expediente</label>
          <input type="time" id="profile-work-end" value="${prof.work_end_time ? String(prof.work_end_time).slice(0, 5) : '19:30'}" required />
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
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
    }
  });

  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('profile-error');
    errEl.style.display = 'none';
    const payload = {
      bio: bioEl.value,
      work_start_time: document.getElementById('profile-work-start').value || '08:00',
      work_end_time: document.getElementById('profile-work-end').value || '19:30',
    };
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
    } catch (err) {
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
                  <td><span class="badge badge-${u.role}">${{ master: 'Mestre', admin: 'Administradora', professional: 'Profissional', receptionist: 'Recepcionista' }[u.role] || esc(u.role)}</span></td>
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
                      ${isMaster() ? `<button class="btn btn-secondary btn-xs" onclick="openResetPassword(${u.id}, '${esc(u.name).replace(/'/g, '&#39;')}')" title="Redefinir senha"><i class="fa fa-key"></i></button>` : ''}
                      ${(() => {
        // Não mostra excluir para si mesmo. Admin não exclui admin/master; só master pode.
        const isSelf = currentUser && u.id === currentUser.id;
        const alvoAdmin = u.role === 'admin' || u.role === 'master';
        const podeExcluir = !isSelf && (isMaster() || !alvoAdmin);
        return podeExcluir
          ? `<button class="btn btn-danger btn-xs" onclick="deleteUserConfirm(${u.id}, '${esc(u.name).replace(/'/g, '&#39;')}')" title="Excluir usuário"><i class="fa fa-trash"></i></button>`
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
  } catch (e) {
    container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

// Edita apenas a FUNÇÃO (papel) do usuário. Criação de gente é feita na aba Profissionais.
async function openUserModal(id) {
  openModal('Editar Função', '<div class="loading"><i class="fa fa-spinner fa-spin"></i></div>', 'modal-sm modal-edit-role');

  let user = null;
  try {
    const users = await api.getUsers();
    user = users.find(u => u.id === id);
  } catch (e) { }

  if (!user) {
    document.getElementById('modal-body').innerHTML = `<div class="edit-role-body"><div class="alert alert-error">Usuário não encontrado</div></div>`;
    return;
  }

  // O usuário mestre não tem a função alterada por aqui
  const isMasterUser = user.role === 'master';

  document.getElementById('modal-body').innerHTML = `
    <form id="user-form" class="edit-role-form">
      <div class="edit-role-body">
        <!-- Seção de Identificação do Usuário -->
        <div class="user-id-card">
          <div class="user-id-name">${esc(user.name)}</div>
          <div class="user-id-email">${esc(user.email)}</div>
        </div>

        <!-- Campo de Seleção (Função) -->
        ${isMasterUser ? `
          <div class="alert alert-info" style="margin-bottom:0">A função do administrador mestre não pode ser alterada.</div>
        ` : `
          <div class="form-group" style="margin-bottom:0">
            <label for="uf-role" class="form-label">Função *</label>
            <select id="uf-role" class="form-control" required>
              <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administradora (atende + gerencia)</option>
              <option value="professional" ${user.role === 'professional' ? 'selected' : ''}>Profissional (apenas atende)</option>
              <option value="receptionist" ${user.role === 'receptionist' ? 'selected' : ''}>Recepcionista / Suporte</option>
            </select>
          </div>
        `}
        <div id="uf-error" class="alert alert-error" style="display:none;margin-top:14px"></div>
      </div>

      <div class="modal-footer edit-role-footer">
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
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
    }
  });
}

function openResetPassword(id, name) {
  openModal(`Redefinir Senha — ${name}`, `
    <form id="reset-pw-form">
      <div class="modal-form-body" style="padding: 20px 24px; display: flex; flex-direction: column; gap: 16px;">
        <div class="form-group" style="margin-bottom: 0;">
          <label>Nova senha *</label>
          <div class="input-icon">
            <i class="fa fa-lock"></i>
            <input type="password" id="reset-pw" required minlength="6" placeholder="Mínimo 6 caracteres" />
            <button type="button" class="btn-eye" onclick="togglePw('reset-pw','eye-reset')"><i class="fa fa-eye" id="eye-reset"></i></button>
          </div>
        </div>
        <div id="reset-error" class="alert alert-error" style="display:none; margin: 0;"></div>
      </div>
      <div class="modal-footer" style="padding: 14px 24px; border-top: 1px solid var(--gray-100); display: flex; justify-content: flex-end; gap: 12px; background: var(--white); border-radius: 0 0 16px 16px;">
        <button type="button" class="btn btn-secondary btn-cancel" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary btn-appt-confirm"><i class="fa fa-key"></i> Redefinir</button>
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
    } catch (err) {
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
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) {
    toast(e.message, 'error');
  }
}
