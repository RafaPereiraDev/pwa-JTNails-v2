// ===== MAIN APP =====
let currentPage = 'dashboard';

const pageConfig = {
  dashboard:     { title: 'Dashboard',     load: loadDashboard },
  agenda:        { title: 'Agenda',        load: loadAgenda },
  clients:       { title: 'Clientes',      load: loadClients },
  services:      { title: 'Serviços',      load: loadServices },
  professionals: { title: 'Profissionais', load: loadProfessionals, adminOnly: true },
  financial:     { title: 'Financeiro',    load: loadFinancial,     hideNewAppt: true },
  reports:       { title: 'Relatórios',    load: loadReports,       adminOnly: true, hideNewAppt: true },
  settings:      { title: 'Configurações', load: loadSettings,      hideNewAppt: true },
};

function navigateTo(page) {
  if (!pageConfig[page]) return;

  // Check admin-only pages
  if (pageConfig[page].adminOnly && currentUser.role !== 'admin') {
    toast('Esta área é exclusiva para administradores', 'error');
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
