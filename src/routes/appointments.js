const express = require('express');
const router  = express.Router();
const { query, getOne, getAll, withTransaction } = require('../database/db');
const { authenticateToken }                      = require('../middleware/auth');

function calcEndTime(start, mins) {
  const [h, m] = start.split(':').map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60) % 24).padStart(2,'0')}:${String(t % 60).padStart(2,'0')}`;
}

async function recalculateClientReliability(client_id) {
  const stats = await getOne(`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('completed','no_show','cancelled')) AS total_closed,
      COUNT(*) FILTER (WHERE status = 'completed')  AS completed,
      COUNT(*) FILTER (WHERE status = 'no_show')    AS no_shows
    FROM appointments WHERE client_id = $1
  `, [client_id]);

  const closed    = parseInt(stats.total_closed) || 0;
  const completed = parseInt(stats.completed)    || 0;
  const noShows   = parseInt(stats.no_shows)     || 0;

  let reliability;
  if (closed < 3)                                           reliability = 'new';
  else if (noShows === 0)                                   reliability = 'good';
  else if (noShows >= 2 || (completed / closed) < 0.6)     reliability = 'unreliable';
  else                                                      reliability = 'irregular';

  await query('UPDATE clients SET reliability = $1 WHERE id = $2', [reliability, client_id]);
}

async function hasConflict(professional_id, date, start_time, end_time, exclude_id = null) {
  let sql = `
    SELECT id FROM appointments
    WHERE professional_id = $1 AND date = $2
      AND status NOT IN ('cancelled','no_show')
      AND ((start_time < $3 AND end_time > $4) OR (start_time >= $4 AND start_time < $3))
  `;
  const args = [professional_id, date, end_time, start_time];
  if (exclude_id) { sql += ` AND id != $${args.length + 1}`; args.push(exclude_id); }
  if (await getOne(sql, args)) return true;

  const blocked = await getOne(`
    SELECT id FROM blocked_times
    WHERE professional_id = $1 AND date = $2
      AND ((start_time < $3 AND end_time > $4) OR (start_time >= $4 AND start_time < $3))
  `, [professional_id, date, end_time, start_time]);
  return !!blocked;
}

const APPT_SELECT = `
  SELECT
    a.id, a.client_id, a.professional_id, a.service_id,
    a.date::text        AS date,
    a.start_time::text  AS start_time,
    a.end_time::text    AS end_time,
    a.price, a.status, a.payment_method, a.notes, a.created_at,
    c.name  AS client_name,  c.phone AS client_phone,
    s.name  AS service_name, s.duration AS service_duration,
    p.name  AS professional_name, p.color AS professional_color
  FROM appointments a
  JOIN clients      c ON a.client_id       = c.id
  JOIN services     s ON a.service_id      = s.id
  JOIN professionals p ON a.professional_id = p.id
`;

// GET /api/appointments/pending-confirmation
router.get('/pending-confirmation', authenticateToken, async (req, res) => {
  try {
    const ehAtendente = req.user.professional_id && req.user.role !== 'master';
    let sql = APPT_SELECT + `
      WHERE a.status IN ('scheduled','confirmed','in_progress')
        AND (a.date::text || ' ' || a.end_time::text)::timestamp
              < (NOW() AT TIME ZONE 'America/Sao_Paulo')
    `;
    const params = [];
    if (ehAtendente) {
      sql += ` AND a.professional_id = $1`;
      params.push(req.user.professional_id);
    }
    sql += ' ORDER BY a.date, a.start_time';
    res.json(await getAll(sql, params));
  } catch (e) {
    console.error('[appointments pending-confirmation]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/appointments/bulk-confirm
router.post('/bulk-confirm', authenticateToken, async (req, res) => {
  try {
    const updates = req.body;
    if (!Array.isArray(updates) || updates.length === 0)
      return res.status(400).json({ error: 'Envie um array com as confirmações' });

    const ehAtendente = req.user.professional_id && req.user.role !== 'master';

    await withTransaction(async (client) => {
      for (const { id, status, payment_method } of updates) {
        if (!id || !['completed','no_show','cancelled'].includes(status)) continue;

        const appt = (await client.query(
          `SELECT *, date::text AS date, start_time::text AS start_time, end_time::text AS end_time
           FROM appointments WHERE id = $1`,
          [id]
        )).rows[0];
        if (!appt) continue;
        if (ehAtendente && appt.professional_id !== req.user.professional_id) continue;

        await client.query(
          'UPDATE appointments SET status=$1, payment_method=COALESCE($2, payment_method) WHERE id=$3',
          [status, payment_method || null, id]
        );

        if (status === 'completed' && appt.status !== 'completed') {
          const existing = (await client.query(
            `SELECT id FROM transactions WHERE appointment_id=$1 AND type='income'`, [id]
          )).rows[0];
          if (!existing) {
            const cl = (await client.query('SELECT name FROM clients WHERE id=$1', [appt.client_id])).rows[0];
            const sv = (await client.query('SELECT name FROM services WHERE id=$1', [appt.service_id])).rows[0];
            await client.query(
              `INSERT INTO transactions
                 (type,appointment_id,professional_id,description,category,amount,payment_method,date)
               VALUES ('income',$1,$2,$3,'Serviço',$4,$5,$6)`,
              [id, appt.professional_id, `${sv.name} - ${cl.name}`,
               appt.price, payment_method || appt.payment_method || null, appt.date]
            );
          }
        }

        if (['no_show','cancelled'].includes(status) && appt.status === 'completed') {
          await client.query(
            `DELETE FROM transactions WHERE appointment_id=$1 AND type='income'`, [id]
          );
        }

        await recalculateClientReliability(appt.client_id);
      }
    });

    res.json({ message: 'Confirmações salvas com sucesso' });
  } catch (e) {
    console.error('[appointments bulk-confirm]', e.message);
    res.status(500).json({ error: 'Erro ao salvar confirmações' });
  }
});

// GET /api/appointments/today
router.get('/today', authenticateToken, async (req, res) => {
  try {
    const tzRow = await getOne(`SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::date::text AS today`);
    const today = tzRow.today;
    let sql = APPT_SELECT + ` WHERE a.date = $1 AND a.status NOT IN ('cancelled','no_show')`;
    const params = [today];
    if (req.user.role === 'professional' && req.user.professional_id) {
      sql += ` AND a.professional_id = $2`; params.push(req.user.professional_id);
    }
    sql += ' ORDER BY a.start_time';
    res.json(await getAll(sql, params));
  } catch (e) {
    console.error('[appointments today]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/appointments
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { date, professional_id, status, start_date, end_date } = req.query;
    let prof = professional_id;
    if (req.user.role === 'professional' && req.user.professional_id)
      prof = req.user.professional_id;

    let sql = APPT_SELECT + ' WHERE 1=1';
    const p = [];
    let i = 1;
    if (prof)       { sql += ` AND a.professional_id = $${i++}`; p.push(prof); }
    if (date)       { sql += ` AND a.date = $${i++}`;            p.push(date); }
    if (start_date) { sql += ` AND a.date >= $${i++}`;           p.push(start_date); }
    if (end_date)   { sql += ` AND a.date <= $${i++}`;           p.push(end_date); }

    if (status) {
      sql += ` AND a.status = $${i++}`; p.push(status);
    } else {
      // Usa fuso de Brasília para calcular "hoje" corretamente no servidor em UTC
      const todayRow = await getOne(`SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::date::text AS today`);
      const today    = todayRow.today;
      const isDayView = date && !start_date && !end_date;
      const isPast    = isDayView && date < today;
      if (!isPast) sql += ` AND a.status NOT IN ('cancelled','no_show')`;
    }
    sql += ' ORDER BY a.date, a.start_time';
    res.json(await getAll(sql, p));
  } catch (e) {
    console.error('[appointments GET /]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/appointments/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const a = await getOne(APPT_SELECT + ' WHERE a.id = $1', [req.params.id]);
    if (!a) return res.status(404).json({ error: 'Agendamento não encontrado' });
    if (req.user.role === 'professional' && a.professional_id !== req.user.professional_id)
      return res.status(403).json({ error: 'Acesso negado' });
    res.json(a);
  } catch (e) {
    console.error('[appointments GET /:id]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/appointments
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { client_id, professional_id, service_id, date, start_time,
            price, payment_method, notes, status } = req.body;

    if (!client_id || !professional_id || !service_id || !date || !start_time)
      return res.status(400).json({ error: 'Cliente, profissional, serviço, data e horário são obrigatórios' });

    // Valida formato de data e hora (igual ao endpoint público)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return res.status(400).json({ error: 'Data inválida. Use o formato YYYY-MM-DD' });
    if (!/^\d{2}:\d{2}$/.test(String(start_time).slice(0, 5)))
      return res.status(400).json({ error: 'Horário inválido. Use o formato HH:MM' });

    // Não permite agendar em datas passadas (usa fuso de Brasília)
    const nowRow = await getOne(`SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::date::text AS today`);
    const today  = nowRow.today;
    if (date < today)
      return res.status(400).json({ error: 'Não é possível agendar em uma data que já passou' });

    if (req.user.professional_id && req.user.role !== 'master' &&
        Number(professional_id) !== Number(req.user.professional_id))
      return res.status(403).json({ error: 'Você só pode criar agendamentos na sua própria agenda' });

    const svc = await getOne('SELECT * FROM services WHERE id = $1 AND active = TRUE', [service_id]);
    if (!svc) return res.status(404).json({ error: 'Serviço não encontrado ou inativo' });

    const finalPrice = price !== undefined ? parseFloat(price) : parseFloat(svc.price);
    const end_time   = calcEndTime(start_time, svc.duration);

    if (await hasConflict(professional_id, date, start_time, end_time))
      return res.status(409).json({ error: 'Horário conflitante. A profissional já tem um compromisso neste horário.' });

    const result = await getOne(`
      INSERT INTO appointments
        (client_id,professional_id,service_id,date,start_time,end_time,price,status,payment_method,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id
    `, [client_id, professional_id, service_id, date, start_time, end_time,
        finalPrice, status || 'scheduled', payment_method || null, notes || null]);

    res.status(201).json(await getOne(APPT_SELECT + ' WHERE a.id = $1', [result.id]));
  } catch (e) {
    console.error('[appointments POST]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/appointments/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const appt = await getOne(
      `SELECT *, date::text AS date, start_time::text AS start_time, end_time::text AS end_time
       FROM appointments WHERE id = $1`,
      [req.params.id]
    );
    if (!appt) return res.status(404).json({ error: 'Agendamento não encontrado' });

    const ehAtendente = req.user.professional_id && req.user.role !== 'master';
    if (ehAtendente && appt.professional_id !== req.user.professional_id)
      return res.status(403).json({ error: 'Você só pode alterar agendamentos da sua própria agenda' });

    const { client_id, professional_id, service_id, date, start_time,
            price, payment_method, notes, status } = req.body;

    if (ehAtendente && professional_id && Number(professional_id) !== Number(req.user.professional_id))
      return res.status(403).json({ error: 'Você não pode transferir agendamentos para outra profissional' });

    // Valida formato de data e hora se fornecidos
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return res.status(400).json({ error: 'Data inválida. Use o formato YYYY-MM-DD' });
    if (start_time && !/^\d{2}:\d{2}$/.test(String(start_time).slice(0, 5)))
      return res.status(400).json({ error: 'Horário inválido. Use o formato HH:MM' });

    const newProfId = professional_id || appt.professional_id;
    const newDate   = date       || appt.date;
    const newStart  = start_time || String(appt.start_time).slice(0, 5);
    const newSvcId  = service_id || appt.service_id;
    const svc       = await getOne('SELECT * FROM services WHERE id = $1', [newSvcId]);
    const newEnd    = calcEndTime(String(newStart).slice(0,5), svc.duration);
    const newPrice  = price !== undefined ? parseFloat(price) : parseFloat(appt.price);

    if (await hasConflict(newProfId, newDate, newStart, newEnd, appt.id))
      return res.status(409).json({ error: 'Horário conflitante. A profissional já tem um compromisso neste horário.' });

    await query(`
      UPDATE appointments SET
        client_id=$1, professional_id=$2, service_id=$3, date=$4,
        start_time=$5, end_time=$6, price=$7, status=$8,
        payment_method=$9, notes=$10
      WHERE id=$11
    `, [
      client_id || appt.client_id,
      newProfId, newSvcId, newDate, newStart, newEnd, newPrice,
      status || appt.status,
      payment_method !== undefined ? payment_method : appt.payment_method,
      notes          !== undefined ? notes          : appt.notes,
      req.params.id,
    ]);

    // Gera receita ao concluir
    if (status === 'completed' && appt.status !== 'completed') {
      const existing = await getOne(
        `SELECT id FROM transactions WHERE appointment_id=$1 AND type='income'`, [req.params.id]
      );
      if (!existing) {
        const updated = await getOne(
          `SELECT *, date::text AS date FROM appointments WHERE id = $1`,
          [req.params.id]
        );
        const cl = await getOne('SELECT name FROM clients  WHERE id = $1', [updated.client_id]);
        const sv = await getOne('SELECT name FROM services WHERE id = $1', [updated.service_id]);
        await query(`
          INSERT INTO transactions
            (type,appointment_id,professional_id,description,category,amount,payment_method,date)
          VALUES ('income',$1,$2,$3,'Serviço',$4,$5,$6)
        `, [req.params.id, updated.professional_id, `${sv.name} - ${cl.name}`,
            updated.price, updated.payment_method || payment_method || null, updated.date]);
      }
    }

    // Remove receita se revertido para cancelado/no_show
    if (appt.status === 'completed' && (status === 'cancelled' || status === 'no_show')) {
      await query(`DELETE FROM transactions WHERE appointment_id=$1 AND type='income'`, [req.params.id]);
    }

    // Recalcula confiabilidade da cliente
    const terminalStatuses = ['completed','no_show','cancelled'];
    if (status && terminalStatuses.includes(status) && status !== appt.status) {
      await recalculateClientReliability(client_id || appt.client_id);
    }

    res.json({ message: 'Agendamento atualizado com sucesso' });
  } catch (e) {
    console.error('[appointments PUT]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/appointments/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const appt = await getOne(
      `SELECT id, professional_id FROM appointments WHERE id = $1`,
      [req.params.id]
    );
    if (!appt) return res.status(404).json({ error: 'Agendamento não encontrado' });

    if (req.user.professional_id && req.user.role !== 'master' &&
        appt.professional_id !== req.user.professional_id)
      return res.status(403).json({ error: 'Você só pode cancelar agendamentos da sua própria agenda' });

    await query(`DELETE FROM transactions WHERE appointment_id=$1 AND type='income'`, [req.params.id]);
    await query(`UPDATE appointments SET status='cancelled' WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Agendamento cancelado com sucesso' });
  } catch (e) {
    console.error('[appointments DELETE]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
