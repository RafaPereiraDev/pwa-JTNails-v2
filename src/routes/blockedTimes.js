const express = require('express');
const router  = express.Router();
const { query, getOne, getAll, withTransaction } = require('../database/db');
const { authenticateToken }     = require('../middleware/auth');

function getDateRange(startDateStr, endDateStr) {
  const dates = [];
  const curr = new Date(`${startDateStr}T12:00:00Z`);
  const end = new Date(`${endDateStr}T12:00:00Z`);
  let count = 0;
  while (curr <= end && count <= 366) {
    dates.push(curr.toISOString().slice(0, 10));
    curr.setUTCDate(curr.getUTCDate() + 1);
    count++;
  }
  return dates;
}

// GET /api/blocked-times
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { professional_id, date, start_date, end_date } = req.query;
    const prof = professional_id;

    let sql = `
      SELECT bt.id, bt.professional_id, bt.reason, bt.created_at,
        bt.all_day,
        bt.end_date::text   AS end_date,
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

// POST /api/blocked-times/check-conflicts
// Retorna os agendamentos existentes no período para exibir o aviso inteligente de confirmação
router.post('/check-conflicts', authenticateToken, async (req, res) => {
  try {
    const { professional_id, date, start_date, end_date, all_day, start_time, end_time } = req.body;
    const profId = parseInt(professional_id, 10);
    if (!profId) return res.status(400).json({ error: 'Profissional é obrigatório' });

    const sDate = start_date || date;
    const eDate = end_date || sDate;
    if (!sDate) return res.status(400).json({ error: 'Data de início é obrigatória' });

    const isAllDay = all_day === true || all_day === 'true' || all_day === 1 || (!start_time && !end_time);
    const sTime = isAllDay ? '07:00' : String(start_time || '07:00').slice(0, 5);
    const eTime = isAllDay ? '23:00' : String(end_time || '23:00').slice(0, 5);

    let sql = `
      SELECT a.id, a.date::text AS date,
             a.start_time::text AS start_time,
             a.end_time::text   AS end_time,
             c.name  AS client_name,
             c.phone AS client_phone,
             COALESCE(NULLIF(a.services_summary, ''), s.name, 'Serviço') AS service_name
      FROM appointments a
      JOIN clients c ON a.client_id = c.id
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.professional_id = $1
        AND a.date >= $2 AND a.date <= $3
        AND a.status NOT IN ('cancelled','no_show')
    `;
    const params = [profId, sDate, eDate];

    if (!isAllDay) {
      sql += ` AND ((a.start_time < $5 AND a.end_time > $4) OR (a.start_time >= $4 AND a.start_time < $5))`;
      params.push(sTime, eTime);
    }

    sql += ' ORDER BY a.date, a.start_time';
    const conflicts = await getAll(sql, params);
    res.json({ count: conflicts.length, conflicts });
  } catch (e) {
    console.error('[blockedTimes check-conflicts]', e.message);
    res.status(500).json({ error: 'Erro interno ao verificar conflitos' });
  }
});

// POST /api/blocked-times
// Cria bloqueio para uma data ou intervalo de datas, mesmo que haja agendamentos existentes
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { professional_id, date, start_date, end_date, all_day, start_time, end_time, reason } = req.body;
    const profId = parseInt(professional_id, 10);
    if (!profId) {
      return res.status(400).json({ error: 'Profissional é obrigatório' });
    }

    const sDate = start_date || date;
    const eDate = end_date || sDate;
    if (!sDate) {
      return res.status(400).json({ error: 'A data é obrigatória' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sDate) || !/^\d{4}-\d{2}-\d{2}$/.test(eDate)) {
      return res.status(400).json({ error: 'Data inválida. Use o formato YYYY-MM-DD' });
    }
    if (eDate < sDate) {
      return res.status(400).json({ error: 'A data final não pode ser anterior à data inicial' });
    }

    const isAllDay = all_day === true || all_day === 'true' || all_day === 1 || (!start_time && !end_time);
    const finalStart = isAllDay ? '07:00' : String(start_time || '07:00').slice(0, 5);
    const finalEnd   = isAllDay ? '23:00' : String(end_time || '23:00').slice(0, 5);

    if (!isAllDay) {
      if (!/^\d{2}:\d{2}$/.test(finalStart) || !/^\d{2}:\d{2}$/.test(finalEnd)) {
        return res.status(400).json({ error: 'Horário inválido. Use o formato HH:MM' });
      }
      if (finalEnd <= finalStart) {
        return res.status(400).json({ error: 'O horário de término deve ser posterior ao horário de início' });
      }
    }

    const dates = getDateRange(sDate, eDate);
    if (dates.length === 0) {
      return res.status(400).json({ error: 'Nenhuma data válida no período informado' });
    }

    const createdIds = await withTransaction(async (client) => {
      const ids = [];
      for (const d of dates) {
        // Evita inserção redundante idêntica se já existir no mesmo dia e horário
        const existing = (await client.query(`
          SELECT id FROM blocked_times
          WHERE professional_id = $1 AND date = $2 AND start_time = $3 AND end_time = $4
        `, [profId, d, finalStart, finalEnd])).rows[0];

        if (existing) {
          ids.push(existing.id);
          continue;
        }

        const r = await client.query(`
          INSERT INTO blocked_times (professional_id, date, start_time, end_time, reason, all_day, end_date)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `, [profId, d, finalStart, finalEnd, reason || null, isAllDay, eDate]);
        ids.push(r.rows[0].id);
      }
      return ids;
    });

    const msg = dates.length > 1
      ? `Período bloqueado com sucesso (${dates.length} dias)`
      : 'Horário bloqueado com sucesso';

    res.status(201).json({ ids: createdIds, count: dates.length, message: msg });
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
