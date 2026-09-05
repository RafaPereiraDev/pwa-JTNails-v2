const express = require('express');
const router  = express.Router();
const { query, getOne, getAll } = require('../database/db');
const { authenticateToken }     = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
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

router.get('/:id', authenticateToken, async (req, res) => {
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

router.post('/', authenticateToken, async (req, res) => {
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

router.put('/:id', authenticateToken, async (req, res) => {
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
