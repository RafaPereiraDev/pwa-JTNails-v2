const express = require('express');
const router  = express.Router();
const { prepare }              = require('../database/db');
const { authenticateToken }    = require('../middleware/auth');

router.get('/', authenticateToken, (req, res) => {
  const { search } = req.query;
  let sql = `
    SELECT c.*,
      (SELECT COUNT(*) FROM appointments WHERE client_id = c.id) as total_appointments,
      (SELECT COALESCE(SUM(price),0) FROM appointments WHERE client_id=c.id AND status='completed') as total_spent,
      (SELECT MAX(date) FROM appointments WHERE client_id = c.id) as last_appointment
    FROM clients c
  `;
  const params = [];
  if (search) { sql += ' WHERE c.name LIKE ? OR c.phone LIKE ?'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY c.name';
  res.json(prepare(sql).all(...params));
});

router.get('/:id', authenticateToken, (req, res) => {
  const client = prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM appointments WHERE client_id=c.id) as total_appointments,
      (SELECT COALESCE(SUM(price),0) FROM appointments WHERE client_id=c.id AND status='completed') as total_spent,
      (SELECT MAX(date) FROM appointments WHERE client_id=c.id) as last_appointment
    FROM clients c WHERE c.id = ?
  `).get(req.params.id);

  if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });

  client.history = prepare(`
    SELECT a.*, s.name as service_name, p.name as professional_name
    FROM appointments a
    JOIN services s ON a.service_id = s.id
    JOIN professionals p ON a.professional_id = p.id
    WHERE a.client_id = ? ORDER BY a.date DESC, a.start_time DESC LIMIT 50
  `).all(req.params.id);

  res.json(client);
});

router.post('/', authenticateToken, (req, res) => {
  const { name, phone, email, birth_date, notes } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'E-mail inválido' });

  const result = prepare(
    'INSERT INTO clients (name, phone, email, birth_date, notes) VALUES (?,?,?,?,?)'
  ).run(name.trim(), phone.trim(), email || null, birth_date || null, notes || null);

  res.status(201).json(prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', authenticateToken, (req, res) => {
  const { name, phone, email, birth_date, notes } = req.body;
  const c = prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Cliente não encontrado' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'E-mail inválido' });

  prepare('UPDATE clients SET name=?,phone=?,email=?,birth_date=?,notes=? WHERE id=?').run(
    name       || c.name,
    phone      || c.phone,
    email      !== undefined ? email      : c.email,
    birth_date !== undefined ? birth_date : c.birth_date,
    notes      !== undefined ? notes      : c.notes,
    req.params.id
  );
  res.json({ message: 'Cliente atualizado com sucesso' });
});

router.delete('/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Apenas administradores podem excluir clientes' });

  const cnt = prepare("SELECT COUNT(*) as c FROM appointments WHERE client_id = ? AND status NOT IN ('cancelled','no_show')").get(req.params.id);
  if (cnt.c > 0) return res.status(400).json({ error: 'Cliente possui agendamentos ativos e não pode ser excluída' });

  // Remove registros dependentes antes de deletar a cliente
  const cancelledAppts = prepare("SELECT id FROM appointments WHERE client_id = ?").all(req.params.id);
  cancelledAppts.forEach(a => {
    prepare('DELETE FROM transactions WHERE appointment_id = ?').run(a.id);
  });
  prepare('DELETE FROM appointments WHERE client_id = ?').run(req.params.id);
  prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);

  res.json({ message: 'Cliente excluída com sucesso' });
});

module.exports = router;
