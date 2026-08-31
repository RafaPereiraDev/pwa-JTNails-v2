const express = require('express');
const router  = express.Router();
const { prepare }           = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, (req, res) => {
  const { professional_id, date, start_date, end_date } = req.query;
  let prof = professional_id;
  if (req.user.role === 'professional' && req.user.professional_id) prof = req.user.professional_id;

  let sql = `
    SELECT bt.*, p.name as professional_name, p.color as professional_color
    FROM blocked_times bt JOIN professionals p ON bt.professional_id=p.id WHERE 1=1
  `;
  const params = [];
  if (prof)       { sql += ' AND bt.professional_id=?'; params.push(prof); }
  if (date)       { sql += ' AND bt.date=?';            params.push(date); }
  if (start_date) { sql += ' AND bt.date>=?';           params.push(start_date); }
  if (end_date)   { sql += ' AND bt.date<=?';           params.push(end_date); }
  sql += ' ORDER BY bt.date, bt.start_time';

  res.json(prepare(sql).all(...params));
});

router.post('/', authenticateToken, (req, res) => {
  const { professional_id, date, start_time, end_time, reason } = req.body;
  if (!professional_id || !date || !start_time || !end_time)
    return res.status(400).json({ error: 'Profissional, data, início e fim são obrigatórios' });

  if (req.user.role === 'professional' && req.user.professional_id !== parseInt(professional_id))
    return res.status(403).json({ error: 'Você só pode bloquear seu próprio horário' });

  const conflict = prepare(`
    SELECT id FROM appointments
    WHERE professional_id=? AND date=? AND status NOT IN ('cancelled','no_show')
    AND ((start_time < ? AND end_time > ?) OR (start_time >= ? AND start_time < ?))
  `).get(professional_id, date, end_time, start_time, start_time, end_time);

  if (conflict) return res.status(409).json({ error: 'Existe um agendamento neste horário' });

  const result = prepare(
    'INSERT INTO blocked_times (professional_id,date,start_time,end_time,reason) VALUES (?,?,?,?,?)'
  ).run(professional_id, date, start_time, end_time, reason || null);

  res.status(201).json({ id: result.lastInsertRowid, message: 'Horário bloqueado com sucesso' });
});

router.delete('/:id', authenticateToken, (req, res) => {
  const b = prepare('SELECT * FROM blocked_times WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'Bloqueio não encontrado' });
  if (req.user.role === 'professional' && b.professional_id !== req.user.professional_id)
    return res.status(403).json({ error: 'Acesso negado' });

  prepare('DELETE FROM blocked_times WHERE id = ?').run(req.params.id);
  res.json({ message: 'Bloqueio removido com sucesso' });
});

module.exports = router;
