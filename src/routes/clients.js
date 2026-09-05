const express = require('express');
const router  = express.Router();
const { query, getOne, getAll }           = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Leitura e escrita de clientes: apenas admin e master
// Profissionais sem papel admin não devem ver toda a base de clientes do salão
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { search } = req.query;
    let sql = `
      SELECT c.id, c.name, c.phone, c.email, c.birth_date, c.notes, c.reliability, c.created_at,
        (SELECT COUNT(*) FROM appointments WHERE client_id = c.id) as total_appointments,
        (SELECT COALESCE(SUM(price),0) FROM appointments WHERE client_id = c.id AND status = 'completed') as total_spent,
        (SELECT MAX(date)::text FROM appointments WHERE client_id = c.id) as last_appointment
      FROM clients c
    `;
    const params = [];
    if (search) {
      sql += ' WHERE c.name ILIKE $1 OR c.phone ILIKE $1';
      params.push(`%${search}%`);
    }
    sql += ' ORDER BY c.name';
    res.json(await getAll(sql, params));
  } catch (e) {
    console.error('[clients GET /]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/clients/birthdays — aniversariantes de HOJE (compara MM-DD, ignora o ano).
// IMPORTANTE: precisa vir ANTES de GET /:id, senão o Express casa "birthdays" como :id.
router.get('/birthdays', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const tzRow = await getOne(`SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::date::text AS today`);
    const [, mm, dd] = tzRow.today.split('-');
    const todayMMDD = `${mm}-${dd}`;

    const rows = await getAll(`
      SELECT c.id, c.name, c.phone, c.birth_date::text AS birth_date,
        (SELECT MAX(date)::text FROM appointments WHERE client_id = c.id) AS last_appointment
      FROM clients c
      WHERE c.birth_date IS NOT NULL
        AND TO_CHAR(c.birth_date::date, 'MM-DD') = $1
      ORDER BY c.name
    `, [todayMMDD]);

    // Todos são de hoje → days_until = 0
    const result = rows.map(r => ({ ...r, days_until: 0 }));
    res.json(result);
  } catch (e) {
    console.error('[clients/birthdays]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/clients/inactive?days=30 — clientes sem atendimento completado há X dias.
// IMPORTANTE: precisa vir ANTES de GET /:id.
router.get('/inactive', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const days = Math.max(1, parseInt(req.query.days) || 30);

    const rows = await getAll(`
      SELECT c.id, c.name, c.phone, c.reliability,
        MAX(a.date)::text                                            AS last_appointment,
        COUNT(a.id)                                                  AS total_appointments,
        (NOW() AT TIME ZONE 'America/Sao_Paulo')::date - MAX(a.date) AS days_since,
        (SELECT s.name FROM appointments sa
         JOIN services s ON sa.service_id = s.id
         WHERE sa.client_id = c.id AND sa.status = 'completed'
         ORDER BY sa.date DESC LIMIT 1)                             AS last_service
      FROM clients c
      JOIN appointments a ON a.client_id = c.id AND a.status = 'completed'
      GROUP BY c.id
      HAVING (NOW() AT TIME ZONE 'America/Sao_Paulo')::date - MAX(a.date) >= $1
      ORDER BY MAX(a.date) ASC
    `, [days]);

    res.json(rows);
  } catch (e) {
    console.error('[clients/inactive]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const client = await getOne(`
      SELECT c.id, c.name, c.phone, c.email, c.birth_date, c.notes, c.reliability, c.created_at,
        (SELECT COUNT(*) FROM appointments WHERE client_id = c.id) as total_appointments,
        (SELECT COALESCE(SUM(price),0) FROM appointments WHERE client_id = c.id AND status = 'completed') as total_spent,
        (SELECT MAX(date)::text FROM appointments WHERE client_id = c.id) as last_appointment
      FROM clients c WHERE c.id = $1
    `, [req.params.id]);

    if (!client) return res.status(404).json({ error: 'Cliente não encontrada' });

    client.history = await getAll(`
      SELECT a.id, a.client_id, a.professional_id, a.service_id,
        a.date::text AS date, a.start_time::text AS start_time, a.end_time::text AS end_time,
        a.price, a.status, a.payment_method, a.notes,
        s.name as service_name, p.name as professional_name
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      JOIN professionals p ON a.professional_id = p.id
      WHERE a.client_id = $1 ORDER BY a.date DESC, a.start_time DESC LIMIT 50
    `, [req.params.id]);

    res.json(client);
  } catch (e) {
    console.error('[clients GET /:id]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, phone, email, birth_date, notes } = req.body;
    if (!name || !phone)
      return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'E-mail inválido' });

    const result = await getOne(
      'INSERT INTO clients (name, phone, email, birth_date, notes) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [name.trim(), phone.trim(), email || null, birth_date || null, notes || null]
    );
    res.status(201).json(await getOne('SELECT * FROM clients WHERE id = $1', [result.id]));
  } catch (e) {
    console.error('[clients POST]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, phone, email, birth_date, notes } = req.body;
    const c = await getOne('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Cliente não encontrada' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'E-mail inválido' });

    await query(
      'UPDATE clients SET name=$1, phone=$2, email=$3, birth_date=$4, notes=$5 WHERE id=$6',
      [
        name       || c.name,
        phone      || c.phone,
        email      !== undefined ? email      : c.email,
        birth_date !== undefined ? birth_date : c.birth_date,
        notes      !== undefined ? notes      : c.notes,
        req.params.id,
      ]
    );
    res.json({ message: 'Cliente atualizada com sucesso' });
  } catch (e) {
    console.error('[clients PUT]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'master')
      return res.status(403).json({ error: 'Apenas administradores podem excluir clientes' });

    const { c } = await getOne(
      `SELECT COUNT(*) as c FROM appointments
       WHERE client_id = $1 AND status NOT IN ('cancelled','no_show')`,
      [req.params.id]
    );
    if (parseInt(c) > 0)
      return res.status(400).json({ error: 'Cliente possui agendamentos ativos e não pode ser excluída' });

    // Remove transações e agendamentos vinculados, depois a cliente
    await query(
      'DELETE FROM transactions WHERE appointment_id IN (SELECT id FROM appointments WHERE client_id = $1)',
      [req.params.id]
    );
    await query('DELETE FROM appointments WHERE client_id = $1', [req.params.id]);
    await query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.json({ message: 'Cliente excluída com sucesso' });
  } catch (e) {
    console.error('[clients DELETE]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
