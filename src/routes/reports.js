const express = require('express');
const router  = express.Router();
const { prepare }           = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

router.get('/dashboard', authenticateToken, (req, res) => {
  const today = new Date().toLocaleDateString('en-CA');
  const month = today.slice(0, 7);

  let profWhere = '';
  const profId  = req.user.role === 'professional' ? req.user.professional_id : null;
  if (profId) profWhere = ` AND a.professional_id=${profId}`;

  const todayStats = prepare(`
    SELECT COUNT(*) as total,
      COUNT(CASE WHEN status='completed' THEN 1 END) as completed,
      COALESCE(SUM(CASE WHEN status='completed' THEN price ELSE 0 END),0) as revenue
    FROM appointments a WHERE date=? AND status NOT IN ('cancelled','no_show') ${profWhere}
  `).get(today);

  const monthStats = prepare(`
    SELECT COUNT(*) as total,
      COALESCE(SUM(CASE WHEN status='completed' THEN price ELSE 0 END),0) as revenue,
      COALESCE(AVG(CASE WHEN status='completed' THEN price ELSE NULL END),0) as avg_ticket
    FROM appointments a WHERE date LIKE ? AND status NOT IN ('cancelled','no_show') ${profWhere}
  `).get(`${month}%`);

  const nextAppointments = prepare(`
    SELECT a.*, c.name as client_name, c.phone as client_phone,
      s.name as service_name, p.name as professional_name, p.color as professional_color
    FROM appointments a
    JOIN clients c ON a.client_id=c.id
    JOIN services s ON a.service_id=s.id
    JOIN professionals p ON a.professional_id=p.id
    WHERE a.date>=? AND a.status IN ('scheduled','confirmed','in_progress')
    ${profWhere}
    ORDER BY a.date, a.start_time LIMIT 10
  `).all(today);

  const profStats = prepare(`
    SELECT p.id, p.name, p.color,
      COUNT(a.id) as total,
      COALESCE(SUM(CASE WHEN a.status='completed' THEN a.price ELSE 0 END),0) as revenue
    FROM professionals p
    LEFT JOIN appointments a ON a.professional_id=p.id AND a.date LIKE ?
    WHERE p.active=1 GROUP BY p.id ORDER BY p.name
  `).all(`${month}%`);

  res.json({
    today:             { ...todayStats, date: today },
    month:             { ...monthStats, period: month },
    next_appointments: nextAppointments,
    professionals:     profStats
  });
});

router.get('/appointments', authenticateToken, (req, res) => {
  const { start_date, end_date, professional_id, service_id, status } = req.query;
  let prof = professional_id;
  if (req.user.role === 'professional' && req.user.professional_id) prof = req.user.professional_id;

  let sql = `
    SELECT a.*, c.name as client_name, c.phone as client_phone,
      s.name as service_name, p.name as professional_name
    FROM appointments a
    JOIN clients c ON a.client_id=c.id
    JOIN services s ON a.service_id=s.id
    JOIN professionals p ON a.professional_id=p.id
    WHERE 1=1
  `;
  const params = [];
  if (prof)       { sql += ' AND a.professional_id=?'; params.push(prof); }
  if (service_id) { sql += ' AND a.service_id=?';      params.push(service_id); }
  if (status)     { sql += ' AND a.status=?';          params.push(status); }
  if (start_date) { sql += ' AND a.date>=?';           params.push(start_date); }
  if (end_date)   { sql += ' AND a.date<=?';           params.push(end_date); }
  sql += ' ORDER BY a.date DESC, a.start_time';

  const appointments = prepare(sql).all(...params);
  const summary = {
    total:         appointments.length,
    completed:     appointments.filter(a => a.status === 'completed').length,
    cancelled:     appointments.filter(a => a.status === 'cancelled').length,
    total_revenue: appointments.filter(a => a.status === 'completed').reduce((s, a) => s + a.price, 0)
  };
  res.json({ appointments, summary });
});

module.exports = router;
