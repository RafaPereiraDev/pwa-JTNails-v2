const express = require('express');
const router  = express.Router();
const { query, getOne, getAll, withTransaction } = require('../database/db');
const { authenticateToken }                      = require('../middleware/auth');

// Dias fechados: 0=Domingo, 1=Segunda. Usa meio-dia para não sofrer com fuso.
function isClosedDay(dateStr) {
  const dow = new Date(`${dateStr}T12:00:00`).getDay();
  return dow === 0 || dow === 1;
}

function calcEndTime(start, mins) {
  const [h, m] = start.split(':').map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60) % 24).padStart(2,'0')}:${String(t % 60).padStart(2,'0')}`;
}

// ── PLANO ANUAL ───────────────────────────────────────────────────────────────
// Frequências suportadas: cada uma define o passo (em dias, ou 'month') e o total
// de sessões que cobrem 12 meses.
const PLAN_FREQUENCIES = {
  weekly:     { stepDays: 7,  count: 52 }, // Semanal (52 semanas)
  biweekly:   { stepDays: 14, count: 26 }, // Quinzenal (a cada 14 dias)
  every21:    { stepDays: 21, count: 17 }, // A cada 21 dias
  monthly:    { stepMonth: true, count: 12 }, // Mensal (1x por mês)
};

// Soma dias a uma data 'YYYY-MM-DD' e devolve 'YYYY-MM-DD' (sem fuso: usa UTC).
function addDaysStr(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// Soma meses mantendo o dia (com clamp no fim do mês).
function addMonthsStr(dateStr, months) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}
// Gera as datas da série a partir da data inicial (inclusive), conforme a frequência.
function generatePlanDates(startDate, plan) {
  const freq = PLAN_FREQUENCIES[plan];
  if (!freq) return [startDate];
  const dates = [];
  for (let i = 0; i < freq.count; i++) {
    dates.push(freq.stepMonth ? addMonthsStr(startDate, i) : addDaysStr(startDate, i * freq.stepDays));
  }
  return dates;
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
    a.series_id, a.is_encaixe, a.services_summary,
    c.name  AS client_name,  c.phone AS client_phone,
    COALESCE(NULLIF(a.services_summary, ''), s.name, 'Serviço Removido') AS service_name,
    COALESCE(
      (SELECT SUM(asv.duration) FROM appointment_services asv WHERE asv.appointment_id = a.id),
      s.duration,
      60
    ) AS service_duration,
    p.name  AS professional_name, p.color AS professional_color
  FROM appointments a
  JOIN clients      c ON a.client_id       = c.id
  LEFT JOIN services s ON a.service_id     = s.id
  JOIN professionals p ON a.professional_id = p.id
`;

// GET /api/appointments/pending-confirmation
router.get('/pending-confirmation', authenticateToken, async (req, res) => {
  try {
    let sql = APPT_SELECT + `
      WHERE a.status IN ('scheduled','confirmed','in_progress')
        AND (a.date::text || ' ' || a.end_time::text)::timestamp
              < (NOW() AT TIME ZONE 'America/Sao_Paulo')
    `;
    const params = [];
    // Agenda compartilhada: opcionalmente filtra por profissional via query.
    if (req.query.professional_id) {
      sql += ` AND a.professional_id = $1`;
      params.push(req.query.professional_id);
    }
    sql += ' ORDER BY a.date, a.start_time';
    res.json(await getAll(sql, params));
  } catch (e) {
    console.error('[appointments pending-confirmation]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/appointments/plans-ending — planos anuais em que resta apenas 1
// agendamento futuro pendente (penúltimo já passou). Serve para avisar a renovação.
router.get('/plans-ending', authenticateToken, async (req, res) => {
  try {
    const rows = await getAll(`
      SELECT a.series_id,
             MIN(c.name)               AS client_name,
             MIN(a.client_id)          AS client_id,
             MIN(a.professional_id)    AS professional_id,
             COUNT(*)                  AS restantes
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      WHERE a.series_id IS NOT NULL
        AND a.status IN ('scheduled','confirmed')
        AND (a.date::text || ' ' || a.start_time::text)::timestamp
              >= (NOW() AT TIME ZONE 'America/Sao_Paulo')
      GROUP BY a.series_id
      HAVING COUNT(*) = 1
      ORDER BY MIN(c.name)
    `);
    res.json(rows);
  } catch (e) {
    console.error('[appointments plans-ending]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/appointments/bulk-confirm
router.post('/bulk-confirm', authenticateToken, async (req, res) => {
  try {
    const updates = req.body;
    if (!Array.isArray(updates) || updates.length === 0)
      return res.status(400).json({ error: 'Envie um array com as confirmações' });

    await withTransaction(async (client) => {
      for (const { id, status, payment_method } of updates) {
        if (!id || !['completed','no_show','cancelled'].includes(status)) continue;

        const appt = (await client.query(
          `SELECT *, date::text AS date, start_time::text AS start_time, end_time::text AS end_time
           FROM appointments WHERE id = $1`,
          [id]
        )).rows[0];
        if (!appt) continue;

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
            const sv = appt.service_id ? (await client.query('SELECT name FROM services WHERE id=$1', [appt.service_id])).rows[0] : null;
            const svcTitle = sv?.name || 'Serviço';
            const clTitle  = cl?.name || 'Cliente';
            await client.query(
              `INSERT INTO transactions
                 (type,appointment_id,professional_id,description,category,amount,payment_method,date)
               VALUES ('income',$1,$2,$3,'Serviço',$4,$5,$6)`,
              [id, appt.professional_id, `${svcTitle} - ${clTitle}`,
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
    // Agenda compartilhada: opcionalmente filtra por profissional via query.
    if (req.query.professional_id) {
      sql += ` AND a.professional_id = $2`; params.push(req.query.professional_id);
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
    // Agenda compartilhada: qualquer usuária do painel pode ver a agenda de
    // qualquer profissional. O filtro `professional_id` vem do seletor da tela.
    const prof = professional_id;

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
    const svcRows = await getAll(
      'SELECT service_id FROM appointment_services WHERE appointment_id = $1 ORDER BY id',
      [a.id]
    );
    a.service_ids = svcRows.length > 0 ? svcRows.map(r => r.service_id) : (a.service_id ? [a.service_id] : []);
    res.json(a);
  } catch (e) {
    console.error('[appointments GET /:id]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/appointments
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { client_id, professional_id, service_id, service_ids, date, start_time,
            price, payment_method, notes, status, plan, allow_overlap } = req.body;

    let sIds = Array.isArray(service_ids) ? service_ids.map(Number).filter(Boolean) : [];
    if (sIds.length === 0 && service_id) {
      sIds = [parseInt(service_id, 10)].filter(Boolean);
    }

    if (!client_id || !professional_id || sIds.length === 0 || !date || !start_time)
      return res.status(400).json({ error: 'Cliente, profissional, serviço, data e horário são obrigatórios' });

    // Valida formato de data e hora (igual ao endpoint público)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return res.status(400).json({ error: 'Data inválida. Use o formato YYYY-MM-DD' });
    if (!/^\d{2}:\d{2}$/.test(String(start_time).slice(0, 5)))
      return res.status(400).json({ error: 'Horário inválido. Use o formato HH:MM' });

    // Não permite agendar em datas/horários que já passaram (usa fuso de Brasília)
    const nowRow    = await getOne(`SELECT NOW() AT TIME ZONE 'America/Sao_Paulo' AS now_local`);
    const nowLocal  = new Date(nowRow.now_local);
    const today     = nowLocal.toLocaleDateString('en-CA');
    const nowMin    = nowLocal.getHours() * 60 + nowLocal.getMinutes();
    const startMin  = (() => {
      const [h, m] = String(start_time).slice(0, 5).split(':').map(Number);
      return h * 60 + m;
    })();
    if (date < today)
      return res.status(400).json({ error: 'Não é possível agendar em uma data que já passou' });
    if (date === today && startMin <= nowMin)
      return res.status(400).json({ error: 'Não é possível agendar em um horário que já passou hoje' });
    // Dom/seg fechados: bloqueia agendamento AVULSO nesses dias. Planos anuais
    // (recorrência) são permitidos em qualquer dia, a critério do admin.
    const isPlan = plan && PLAN_FREQUENCIES[plan];
    if (!isPlan && isClosedDay(date))
      return res.status(400).json({ error: 'O salão não atende aos domingos e segundas-feiras' });

    const svcs = await getAll('SELECT * FROM services WHERE id = ANY($1::int[]) AND active = TRUE ORDER BY id', [sIds]);
    if (!svcs || svcs.length === 0) return res.status(404).json({ error: 'Nenhum serviço válido ou ativo selecionado' });

    const totalDuration = svcs.reduce((acc, s) => acc + (parseInt(s.duration, 10) || 60), 0);
    const totalDefaultPrice = svcs.reduce((acc, s) => acc + parseFloat(s.price || 0), 0);
    const servicesSummary = svcs.map(s => s.name).join(' + ');
    const primaryServiceId = svcs[0].id;

    const finalPrice = price !== undefined && price !== null && price !== '' ? parseFloat(price) : totalDefaultPrice;
    const end_time   = calcEndTime(start_time, totalDuration);
    const overlap    = allow_overlap === true || allow_overlap === 'true';

    // ── PLANO ANUAL: cria a série inteira numa transação ─────────────────────
    if (plan && PLAN_FREQUENCIES[plan]) {
      const dates = generatePlanDates(date, plan);
      const seriesId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const created = await withTransaction(async (client) => {
        const skipped = [];
        const insertedIds = [];
        for (const d of dates) {
          if (!overlap && await hasConflict(professional_id, d, start_time, end_time)) {
            skipped.push(d);
            continue;
          }
          const r = await client.query(`
            INSERT INTO appointments
              (client_id,professional_id,service_id,date,start_time,end_time,price,status,payment_method,notes,series_id,is_encaixe,services_summary)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            RETURNING id
          `, [client_id, professional_id, primaryServiceId, d, start_time, end_time,
              finalPrice, status || 'scheduled', payment_method || null, notes || null,
              seriesId, overlap, servicesSummary]);

          const apptId = r.rows[0].id;
          insertedIds.push(apptId);
          for (const s of svcs) {
            await client.query(
              `INSERT INTO appointment_services (appointment_id, service_id, price, duration) VALUES ($1, $2, $3, $4)`,
              [apptId, s.id, s.price, s.duration]
            );
          }
        }
        return { insertedIds, skipped };
      });

      return res.status(201).json({
        message: `Plano criado: ${created.insertedIds.length} agendamento(s).`,
        series_id: seriesId,
        created: created.insertedIds.length,
        skipped: created.skipped,
      });
    }

    // ── Agendamento único ────────────────────────────────────────────────────
    if (!overlap && await hasConflict(professional_id, date, start_time, end_time))
      return res.status(409).json({ error: 'Horário conflitante. A profissional já tem um compromisso neste horário.' });

    const createdAppt = await withTransaction(async (client) => {
      const result = await client.query(`
        INSERT INTO appointments
          (client_id,professional_id,service_id,date,start_time,end_time,price,status,payment_method,notes,is_encaixe,services_summary)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING id
      `, [client_id, professional_id, primaryServiceId, date, start_time, end_time,
          finalPrice, status || 'scheduled', payment_method || null, notes || null, overlap, servicesSummary]);

      const apptId = result.rows[0].id;
      for (const s of svcs) {
        await client.query(
          `INSERT INTO appointment_services (appointment_id, service_id, price, duration) VALUES ($1, $2, $3, $4)`,
          [apptId, s.id, s.price, s.duration]
        );
      }
      return apptId;
    });

    res.status(201).json(await getOne(APPT_SELECT + ' WHERE a.id = $1', [createdAppt]));
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

    const { client_id, professional_id, service_id, service_ids, date, start_time,
            price, payment_method, notes, status } = req.body;

    // Valida formato de data e hora se fornecidos
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return res.status(400).json({ error: 'Data inválida. Use o formato YYYY-MM-DD' });
    if (start_time && !/^\d{2}:\d{2}$/.test(String(start_time).slice(0, 5)))
      return res.status(400).json({ error: 'Horário inválido. Use o formato HH:MM' });

    const newProfId = professional_id || appt.professional_id;
    const newDate   = date       || appt.date;
    const newStart  = start_time || String(appt.start_time).slice(0, 5);

    let sIds = Array.isArray(service_ids) ? service_ids.map(Number).filter(Boolean) : null;
    if (!sIds && service_id) {
      sIds = [parseInt(service_id, 10)].filter(Boolean);
    }

    let svcs = [];
    let newDuration = 60;
    let newSummary = appt.services_summary;
    let newSvcId = appt.service_id;

    if (sIds && sIds.length > 0) {
      svcs = await getAll('SELECT * FROM services WHERE id = ANY($1::int[])', [sIds]);
      if (svcs.length > 0) {
        newDuration = svcs.reduce((acc, s) => acc + (parseInt(s.duration, 10) || 60), 0);
        newSummary = svcs.map(s => s.name).join(' + ');
        newSvcId = svcs[0].id;
      }
    } else if (newSvcId) {
      const svc = await getOne('SELECT * FROM services WHERE id = $1', [newSvcId]);
      newDuration = svc ? svc.duration : 60;
      newSummary = appt.services_summary || svc?.name || null;
    }

    // Se a data/horário estiver sendo ALTERADA, não permite mover para o passado.
    // Mudanças que mantêm a data/hora original (ex.: só trocar status) são permitidas.
    const dateOrTimeChanged = (date && date !== appt.date) ||
      (start_time && start_time !== String(appt.start_time).slice(0, 5));
    if (dateOrTimeChanged) {
      const nowRow   = await getOne(`SELECT NOW() AT TIME ZONE 'America/Sao_Paulo' AS now_local`);
      const nowLocal = new Date(nowRow.now_local);
      const today    = nowLocal.toLocaleDateString('en-CA');
      const nowMin   = nowLocal.getHours() * 60 + nowLocal.getMinutes();
      const [sh, sm] = String(newStart).slice(0, 5).split(':').map(Number);
      const startMin = sh * 60 + sm;
      if (newDate < today || (newDate === today && startMin <= nowMin))
        return res.status(400).json({ error: 'Não é possível remarcar para uma data ou horário que já passou' });
      if (isClosedDay(newDate))
        return res.status(400).json({ error: 'O salão não atende aos domingos e segundas-feiras' });
    }

    const newEnd   = calcEndTime(String(newStart).slice(0,5), newDuration);
    const newPrice = price !== undefined && price !== null && price !== '' ? parseFloat(price) : parseFloat(appt.price);

    const allowOverlap = req.body.allow_overlap === true || req.body.allow_overlap === 'true';
    if (!allowOverlap && await hasConflict(newProfId, newDate, newStart, newEnd, appt.id))
      return res.status(409).json({ error: 'Horário conflitante. A profissional já tem um compromisso neste horário.' });

    await withTransaction(async (client) => {
      await client.query(`
        UPDATE appointments SET
          client_id=$1, professional_id=$2, service_id=$3, date=$4,
          start_time=$5, end_time=$6, price=$7, status=$8,
          payment_method=$9, notes=$10, services_summary=$11
        WHERE id=$12
      `, [
        client_id || appt.client_id,
        newProfId, newSvcId, newDate, newStart, newEnd, newPrice,
        status || appt.status,
        payment_method !== undefined ? payment_method : appt.payment_method,
        notes          !== undefined ? notes          : appt.notes,
        newSummary,
        req.params.id,
      ]);

      if (svcs.length > 0) {
        await client.query('DELETE FROM appointment_services WHERE appointment_id = $1', [req.params.id]);
        for (const s of svcs) {
          await client.query(
            'INSERT INTO appointment_services (appointment_id, service_id, price, duration) VALUES ($1, $2, $3, $4)',
            [req.params.id, s.id, s.price, s.duration]
          );
        }
      }
    });

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
        const sv = updated.service_id ? await getOne('SELECT name FROM services WHERE id = $1', [updated.service_id]) : null;
        const svcTitle = updated.services_summary || sv?.name || 'Serviço';
        const clTitle  = cl?.name || 'Cliente';
        await query(`
          INSERT INTO transactions
            (type,appointment_id,professional_id,description,category,amount,payment_method,date)
          VALUES ('income',$1,$2,$3,'Serviço',$4,$5,$6)
        `, [req.params.id, updated.professional_id, `${svcTitle} - ${clTitle}`,
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
    console.error('[appointments PUT /:id]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/appointments/:id
// Aceita ?tipo_cancelamento=APENAS_ESTE (padrão) ou SERIE_COMPLETA.
//  - APENAS_ESTE:   cancela somente este agendamento.
//  - SERIE_COMPLETA: cancela este E todos os agendamentos posteriores da mesma
//                    série (series_id), a partir da data/hora deste (inclusive).
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const tipo = String(req.query.tipo_cancelamento || 'APENAS_ESTE').toUpperCase();
    const appt = await getOne(
      `SELECT id, professional_id, series_id,
              date::text AS date, start_time::text AS start_time
       FROM appointments WHERE id = $1`,
      [req.params.id]
    );
    if (!appt) return res.status(404).json({ error: 'Agendamento não encontrado' });

    if (tipo === 'SERIE_COMPLETA' && appt.series_id) {
      // Cancela este e todos os futuros da série (mesma série, data/hora >= a deste).
      const result = await withTransaction(async (client) => {
        const rows = (await client.query(
          `SELECT id FROM appointments
           WHERE series_id = $1
             AND (date::text || ' ' || start_time::text) >= ($2 || ' ' || $3)`,
          [appt.series_id, appt.date, appt.start_time]
        )).rows;
        const ids = rows.map(r => r.id);
        if (ids.length) {
          await client.query(
            `DELETE FROM transactions WHERE appointment_id = ANY($1) AND type='income'`, [ids]
          );
          await client.query(
            `UPDATE appointments SET status='cancelled' WHERE id = ANY($1)`, [ids]
          );
        }
        return ids.length;
      });
      return res.json({ message: `${result} agendamento(s) da série cancelado(s).`, cancelled: result });
    }

    // Padrão: cancela apenas este agendamento.
    await query(`DELETE FROM transactions WHERE appointment_id=$1 AND type='income'`, [req.params.id]);
    await query(`UPDATE appointments SET status='cancelled' WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Agendamento cancelado com sucesso', cancelled: 1 });
  } catch (e) {
    console.error('[appointments DELETE]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
