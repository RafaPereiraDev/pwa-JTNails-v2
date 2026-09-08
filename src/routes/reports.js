const express = require('express');
const router  = express.Router();
const { getOne, getAll } = require('../database/db');
const { authenticateToken }    = require('../middleware/auth');

router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    // Usa fuso de Brasília para não mostrar dados errados quando servidor está em UTC
    const tzRow = await getOne(`SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::date::text AS today`);
    const today = tzRow.today;
    const month = today.slice(0, 7); // YYYY-MM

    // Admin/professional com professional_id: vê só os próprios dados.
    // Master e admin SEM professional_id (caso raro): tratados como visão geral,
    // mas limitados ao próprio escopo — admin sem vínculo não deve ver dados globais.
    const profId = req.user.role === 'master'
      ? null
      : req.user.professional_id || -1; // -1 garante que não retorna nada se admin sem vínculo
    const profWhere = profId && profId !== -1 ? ' AND a.professional_id = $2' : (profId === -1 ? ' AND 1=0' : '');
    const pArg      = profId && profId !== -1 ? [profId] : [];

    // Stats de hoje
    const todayStats = await getOne(`
      SELECT COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status='completed') AS completed,
        COALESCE(SUM(CASE WHEN status='completed' THEN price ELSE 0 END),0) AS revenue
      FROM appointments a
      WHERE date = $1 AND status NOT IN ('cancelled','no_show') ${profWhere}
    `, [today, ...pArg]);

    // Despesas do mês (escopo por profissional ou tudo para master)
    const txProfWhere = profId && profId !== -1 ? ' AND professional_id = $2' : (profId === -1 ? ' AND 1=0' : '');
    const monthExpenses = await getOne(`
      SELECT COALESCE(SUM(amount),0) AS expenses
      FROM transactions
      WHERE type = 'expense' AND TO_CHAR(date,'YYYY-MM') = $1 ${txProfWhere}
    `, [month, ...pArg]);

    // Stats do mês
    const monthStats = await getOne(`
      SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN status='completed' THEN price ELSE 0 END),0) AS revenue,
        COALESCE(AVG(CASE WHEN status='completed' THEN price ELSE NULL END),0) AS avg_ticket
      FROM appointments a
      WHERE TO_CHAR(date,'YYYY-MM') = $1
        AND status NOT IN ('cancelled','no_show') ${profWhere}
    `, [month, ...pArg]);

    // Próximos atendimentos do dia
    const nextAppointments = await getAll(`
      SELECT a.id, a.client_id, a.professional_id, a.service_id,
        a.date::text AS date, a.start_time::text AS start_time, a.end_time::text AS end_time,
        a.price, a.status, a.payment_method, a.notes,
        c.name AS client_name, c.phone AS client_phone,
        s.name AS service_name, p.name AS professional_name, p.color AS professional_color
      FROM appointments a
      JOIN clients      c ON a.client_id       = c.id
      JOIN services     s ON a.service_id      = s.id
      JOIN professionals p ON a.professional_id = p.id
      WHERE a.date = $1 AND a.status IN ('scheduled','confirmed','in_progress')
      ${profWhere}
      ORDER BY a.start_time LIMIT 10
    `, [today, ...pArg]);

    // Faturamento individual (admin/professional) ou vazio (master)
    let profStats = [];
    if (profId && profId !== -1) {
      profStats = await getAll(`
        SELECT p.id, p.name, p.color, p.photo,
          COUNT(*) FILTER (WHERE a.status='completed') AS total,
          COALESCE(SUM(CASE WHEN a.status='completed' THEN a.price ELSE 0 END),0) AS revenue
        FROM professionals p
        LEFT JOIN appointments a
          ON a.professional_id = p.id AND TO_CHAR(a.date,'YYYY-MM') = $1
        WHERE p.id = $2
        GROUP BY p.id
      `, [month, profId]);
    }

    res.json({
      today:             { ...todayStats, date: today },
      month:             { ...monthStats, expenses: monthExpenses.expenses, period: month },
      next_appointments: nextAppointments,
      professionals:     profStats,
    });
  } catch (e) {
    console.error('[reports/dashboard]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/appointments', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date, professional_id, service_id, status } = req.query;
    let prof = professional_id;
    if (req.user.role !== 'master' && req.user.professional_id)
      prof = req.user.professional_id;

    let sql = `
      SELECT a.id, a.client_id, a.professional_id, a.service_id,
        a.date::text AS date, a.start_time::text AS start_time, a.end_time::text AS end_time,
        a.price, a.status, a.payment_method, a.notes,
        c.name AS client_name, c.phone AS client_phone,
        s.name AS service_name, p.name AS professional_name
      FROM appointments a
      JOIN clients      c ON a.client_id       = c.id
      JOIN services     s ON a.service_id      = s.id
      JOIN professionals p ON a.professional_id = p.id
      WHERE 1=1
    `;
    const params = [];
    let i = 1;
    if (prof)       { sql += ` AND a.professional_id = $${i++}`; params.push(prof); }
    if (service_id) { sql += ` AND a.service_id = $${i++}`;      params.push(service_id); }
    if (status)     { sql += ` AND a.status = $${i++}`;          params.push(status); }
    if (start_date) { sql += ` AND a.date >= $${i++}`;           params.push(start_date); }
    if (end_date)   { sql += ` AND a.date <= $${i++}`;           params.push(end_date); }
    sql += ' ORDER BY a.date DESC, a.start_time';

    const appointments = await getAll(sql, params);
    const summary = {
      total:         appointments.length,
      completed:     appointments.filter(a => a.status === 'completed').length,
      cancelled:     appointments.filter(a => a.status === 'cancelled').length,
      total_revenue: appointments.filter(a => a.status === 'completed')
                                 .reduce((s, a) => s + parseFloat(a.price), 0),
    };
    res.json({ appointments, summary });
  } catch (e) {
    console.error('[reports/appointments]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
