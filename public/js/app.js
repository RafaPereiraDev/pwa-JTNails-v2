// ===== MAIN APP =====
let currentPage = 'dashboard';

const pageConfig = {
  dashboard:     { title: 'Dashboard',     load: loadDashboard },
  agenda:        { title: 'Agenda',        load: loadAgenda },
  clients:       { title: 'Clientes',      load: loadClients },
  services:      { title: 'Serviços',      load: loadServices },
  professionals: { title: 'Profissionais', load: loadProfessionals, adminOnly: true },
  financial:     { title: 'Financeiro',    load: loadFinancial,     hideNewAppt: true, hideMaster: true },
  reports:       { title: 'Relatórios',    load: loadReports,       adminOnly: true, hideNewAppt: true },
  settings:      { title: 'Configurações', load: loadSettings,      hideNewAppt: true },
};

function navigateTo(page) {
  if (!pageConfig[page]) return;

  // Check admin-only pages (admin e master têm acesso)
  const isAdminLevel = currentUser.role === 'admin' || currentUser.role === 'master';
  if (pageConfig[page].adminOnly && !isAdminLevel) {
    toast('Esta área é exclusiva para administradores', 'error');
    return;
  }
  // Check master-only pages
  if (pageConfig[page].masterOnly && currentUser.role !== 'master') {
    toast('Esta área é exclusiva para o administrador mestre', 'error');
    return;
  }
  // Páginas escondidas do master (ex: Financeiro)
  if (pageConfig[page].hideMaster && currentUser.role === 'master') {
    toast('Esta área não está disponível para o administrador mestre', 'error');
    return;
  }

  // Hide all pages
  document.querySelectorAll('.page-content').forEach(el => el.style.display = 'none');

  // Show target page
  const el = document.getElementById(`page-${page}`);
  if (el) el.style.display = '';

  // Update nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  // Update topbar title
  document.getElementById('topbar-title').textContent = pageConfig[page].title;

  // Show/hide the global + Agendamento button
  const newApptBtn = document.querySelector('.topbar-actions .btn');
  if (newApptBtn) newApptBtn.style.display = pageConfig[page].hideNewAppt ? 'none' : '';

  currentPage = page;
  pageConfig[page].load();
  closeSidebar();
}

function refreshCurrentPage() {
  if (pageConfig[currentPage]) {
    pageConfig[currentPage].load();
  }
}

// Sidebar
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

// Navigation clicks
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  });
});

// Boot
document.addEventListener('DOMContentLoaded', async () => {
  await initAuth();
  if (getToken()) {
    navigateTo('dashboard');
  }
});

// WhatsApp reminder from appointment
function sendAppointmentReminder(phone, name, date, time, service) {
  const msg = `Olá, ${name}! Seu atendimento está confirmado para ${formatDate(date)} às ${time}. Serviço: ${service}. Até lá!`;
  window.open(whatsappLink(phone, msg), '_blank');
}

// ===== SERVICE WORKER (PWA) =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .catch(err => console.warn('SW registro falhou:', err));
  });
}

// ===== PULL TO REFRESH =====
(function initPullToRefresh() {
  // Cria o indicador visual
  const indicator = document.createElement('div');
  indicator.id = 'ptr-indicator';
  indicator.innerHTML = '<i class="fa fa-arrow-down ptr-icon"></i><span class="ptr-label">Solte para atualizar</span>';
  document.body.appendChild(indicator);

  const THRESHOLD = 70; // px necessários para disparar o refresh
  let startY = 0;
  let pulling = false;
  let triggered = false;

  document.addEventListener('touchstart', (e) => {
    // Só ativa se estiver no topo da página
    if (window.scrollY === 0) {
      startY = e.touches[0].clientY;
      pulling = true;
      triggered = false;
    }
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const delta = e.touches[0].clientY - startY;
    if (delta <= 0) { pulling = false; return; }

    indicator.classList.toggle('ptr-ready', delta >= THRESHOLD);
    indicator.querySelector('.ptr-label').textContent =
      delta >= THRESHOLD ? 'Solte para atualizar' : 'Puxe para atualizar';
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;

    if (indicator.classList.contains('ptr-ready') && !triggered) {
      triggered = true;
      indicator.classList.remove('ptr-ready');
      indicator.classList.add('ptr-loading');
      indicator.querySelector('.ptr-label').textContent = 'Atualizando...';
      indicator.querySelector('.ptr-icon').className = 'fa fa-spinner ptr-icon';
      indicator.style.height = '56px';

      // Recarrega a página atual
      setTimeout(() => {
        refreshCurrentPage();
        setTimeout(() => {
          indicator.classList.remove('ptr-loading');
          indicator.style.height = '';
          indicator.querySelector('.ptr-icon').className = 'fa fa-arrow-down ptr-icon';
          indicator.querySelector('.ptr-label').textContent = 'Solte para atualizar';
        }, 800);
      }, 300);
    } else {
      indicator.classList.remove('ptr-ready');
      indicator.style.height = '';
    }
  });
})();
