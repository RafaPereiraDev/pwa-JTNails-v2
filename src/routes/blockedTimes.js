const express = require('express');
const router  = express.Router();
const { query, getOne, getAll } = require('../database/db');
const { authenticateToken }     = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { professional_id, date, start_date, end_date } = req.query;
    // Agenda compartilhada: filtra por profissional só se vier no seletor.
    const prof = professional_id;

    let sql = `
      SELECT bt.id, bt.professional_id, bt.reason, bt.created_at,
        bt.date::text       AS date,
        bt.start_time::text AS start_time,
        bt.end_time::text   AS end_time,
        p.name AS professional_name, p.color AS professional_color
      FROM blocked_times bt JOIN professionals p ON bt.professional_id = p.id
      WHERE 1=1
    `;
    const params = [];
    let i = 1;
    if (prof)       { sql += ` AND bt.professional_id = $${i++}`; params.push(prof); }
    if (date)       { sql += ` AND bt.date = $${i++}`;            params.push(date); }
    if (start_date) { sql += ` AND bt.date >= $${i++}`;           params.push(start_date); }
    if (end_date)   { sql += ` AND bt.date <= $${i++}`;           params.push(end_date); }
    sql += ' ORDER BY bt.date, bt.start_time';

    res.json(await getAll(sql, params));
  } catch (e) {
    console.error('[blockedTimes GET]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { professional_id, date, start_time, end_time, reason } = req.body;
    if (!professional_id || !date || !start_time || !end_time)
      return res.status(400).json({ error: 'Profissional, data, início e fim são obrigatórios' });

    const conflict = await getOne(`
      SELECT id FROM appointments
      WHERE professional_id = $1 AND date = $2
        AND status NOT IN ('cancelled','no_show')
        AND ((start_time < $3 AND end_time > $4) OR (start_time >= $4 AND start_time < $3))
    `, [professional_id, date, end_time, start_time]);

    if (conflict) return res.status(409).json({ error: 'Existe um agendamento neste horário' });

    const result = await getOne(
      'INSERT INTO blocked_times (professional_id,date,start_time,end_time,reason) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [professional_id, date, start_time, end_time, reason || null]
    );
    res.status(201).json({ id: result.id, message: 'Horário bloqueado com sucesso' });
  } catch (e) {
    console.error('[blockedTimes POST]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const b = await getOne('SELECT * FROM blocked_times WHERE id = $1', [req.params.id]);
    if (!b) return res.status(404).json({ error: 'Bloqueio não encontrado' });

    await query('DELETE FROM blocked_times WHERE id = $1', [req.params.id]);
    res.json({ message: 'Bloqueio removido com sucesso' });
  } catch (e) {
    console.error('[blockedTimes DELETE]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
