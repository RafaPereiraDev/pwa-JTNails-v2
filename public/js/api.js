// ===== API Helper =====
const API_BASE = '/api';

async function apiRequest(method, endpoint, data = null) {
  const token = localStorage.getItem('token');
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
  };
  if (data && method !== 'GET') {
    opts.body = JSON.stringify(data);
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(json.error || json.message || 'Não foi possível concluir a operação. Tente novamente.');
    err.status = res.status;
    err.data = json;
    throw err;
  }
  return json;
}

const api = {
  get:    (endpoint)       => apiRequest('GET', endpoint),
  post:   (endpoint, data) => apiRequest('POST', endpoint, data),
  put:    (endpoint, data) => apiRequest('PUT', endpoint, data),
  patch:  (endpoint, data) => apiRequest('PATCH', endpoint, data),
  delete: (endpoint)       => apiRequest('DELETE', endpoint),

  // Auth
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.post('/auth/change-password', data),

  // Professionals
  getProfessionals: (activeOnly = false) =>
    api.get(activeOnly ? '/professionals/active' : '/professionals'),
  getProfessional: (id) => api.get(`/professionals/${id}`),
  getProfessionalStats: (id, month, year) =>
    api.get(`/professionals/${id}/stats?month=${month || ''}&year=${year || ''}`),
  createProfessional: (data) => api.post('/professionals', data),
  updateProfessional: (id, data) => api.put(`/professionals/${id}`, data),
  deleteProfessional: (id) => api.delete(`/professionals/${id}`),
  getMyProfile: () => api.get('/professionals/me/profile'),
  updateMyProfile: (data) => api.put('/professionals/me/profile', data),

  // Clients
  getClients: (search = '', status = 'ativo') => {
    const qs = new URLSearchParams();
    if (search) qs.set('search', search);
    if (status) qs.set('status', status);
    const q = qs.toString();
    return api.get('/clients' + (q ? '?' + q : ''));
  },
  getClient: (id) => api.get(`/clients/${id}`),
  getClientBirthdays: () => api.get('/clients/birthdays'),
  getClientsInactive: (days = 30) => api.get(`/clients/inactive?days=${days}`),
  createClient: (data) => api.post('/clients', data),
  updateClient: (id, data) => api.put(`/clients/${id}`, data),
  deleteClient: (id) => api.delete(`/clients/${id}`),
  setClientStatus: (id, active) => api.patch(`/clients/${id}/status`, { active }),
  resetClientPassword: (id, new_password) => api.post(`/clients/${id}/reset-password`, { new_password }),

  // Services
  getServices: (activeOnly = false) =>
    api.get('/services' + (activeOnly ? '?active_only=true' : '')),
  getService: (id) => api.get(`/services/${id}`),
  createService: (data) => api.post('/services', data),
  updateService: (id, data) => api.put(`/services/${id}`, data),
  deleteService: (id) => api.delete(`/services/${id}`),

  // Appointments
  getAppointments: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api.get('/appointments' + (q ? '?' + q : ''));
  },
  getAppointmentsToday: () => api.get('/appointments/today'),
  getAppointment: (id) => api.get(`/appointments/${id}`),
  createAppointment: (data) => api.post('/appointments', data),
  updateAppointment: (id, data) => api.put(`/appointments/${id}`, data),
  deleteAppointment: (id) => api.delete(`/appointments/${id}`),

  getPendingConfirmation: () => api.get('/appointments/pending-confirmation'),
  bulkConfirmAppointments: (updates) => api.post('/appointments/bulk-confirm', updates),

  // Transactions
  getTransactions: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api.get('/transactions' + (q ? '?' + q : ''));
  },
  getFinancialSummary: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api.get('/transactions/summary' + (q ? '?' + q : ''));
  },
  createTransaction: (data) => api.post('/transactions', data),
  updateTransaction: (id, data) => api.put(`/transactions/${id}`, data),
  deleteTransaction: (id) => api.delete(`/transactions/${id}`),

  // Reports
  getDashboard: () => api.get('/reports/dashboard'),
  getReportAppointments: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api.get('/reports/appointments' + (q ? '?' + q : ''));
  },

  // Blocked times
  getBlockedTimes: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api.get('/blocked-times' + (q ? '?' + q : ''));
  },
  createBlockedTime: (data) => api.post('/blocked-times', data),
  deleteBlockedTime: (id) => api.delete(`/blocked-times/${id}`),

  // Users
  getUsers: () => api.get('/users'),
  createUser: (data) => api.post('/users', data),
  updateUser: (id, data) => api.put(`/users/${id}`, data),
  deleteUser: (id) => api.delete(`/users/${id}`),
  toggleUserStatus: (id) => api.put(`/users/${id}/toggle-status`, {}),
  resetUserPassword: (id, new_password) => api.put(`/users/${id}/reset-password`, { new_password }),

  // Settings
  getBirthdayMessage: () => api.get('/settings/birthday-message'),
  getWelcomeMessage: () => api.get('/settings/welcome-message'),
  getResetMessage: () => api.get('/settings/reset-message'),
  updateBirthdayMessage: (message) => api.put('/settings/birthday-message', { message }),

  // Notificações (Web Push)
  getPushPublicKey: () => api.get('/settings/push/public-key'),
  getNotificationPrefs: () => api.get('/settings/notifications'),
  updateNotificationPrefs: (data) => api.put('/settings/notifications', data),
  subscribePush: (sub) => api.post('/settings/push/subscribe', sub),
  unsubscribePush: (endpoint) => api.post('/settings/push/unsubscribe', { endpoint }),
};
