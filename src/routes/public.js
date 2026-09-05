const express = require('express');
const router  = express.Router();
const { getOne, getAll } = require('../database/db');

const OPEN_HOUR  = 8;
const CLOSE_MINS = 18 * 60 + 30; // 18:30
const SLOT_STEP  = 30;

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}
function toHHMM(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2,'0')}:${String(mins % 60).padStart(2,'0')}`;
}
function overlaps(aS, aE, bS, bE) { return aS < bE && aE > bS; }

// GET /api/public/professionals
router.get('/professionals', async (req, res) => {
  try {
    res.json(await getAll(
      'SELECT id, name, color, photo, bio FROM professionals WHERE active = TRUE ORDER BY name'
    ));
  } catch (e) {
    console.error('[public/professionals]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/public/services
router.get('/services', async (req, res) => {
  try {
    res.json(await getAll(
      'SELECT id, name, description, price, duration FROM services WHERE active = TRUE ORDER BY name'
    ));
  } catch (e) {
    console.error('[public/services]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/public/available-slots
router.get('/available-slots', async (req, res) => {
  try {
    const { date, professional_id, service_id } = req.query;
    if (!date || !professional_id || !service_id)
      return res.status(400).json({ error: 'Data, profissional e serviço são obrigatórios' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return res.status(400).json({ error: 'Data inválida' });

    const svc = await getOne('SELECT * FROM services WHERE id = $1 AND active = TRUE', [service_id]);
    if (!svc) return res.status(404).json({ error: 'Serviço não encontrado' });

    const prof = await getOne('SELECT id FROM professionals WHERE id = $1 AND active = TRUE', [professional_id]);
    if (!prof) return res.status(404).json({ error: 'Profissional não encontrada' });

    const duration   = svc.duration || 60;
    const now        = new Date();
    const todayStr   = now.toLocaleDateString('en-CA');
    const isToday    = date === todayStr;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const appts = await getAll(
      `SELECT start_time::text AS start_time, end_time::text AS end_time FROM appointments
       WHERE professional_id = $1 AND date = $2 AND status NOT IN ('cancelled','no_show')`,
      [professional_id, date]
    );
    const blocks = await getAll(
      `SELECT start_time::text AS start_time, end_time::text AS end_time FROM blocked_times
       WHERE professional_id = $1 AND date = $2`,
      [professional_id, date]
    );

    const busy = [...appts, ...blocks].map(b => ({
      start: toMinutes(b.start_time),
      end:   toMinutes(b.end_time),
    }));

    const slots = [];
    for (let start = OPEN_HOUR * 60; start <= CLOSE_MINS; start += SLOT_STEP) {
      const end = start + duration;
      if (isToday && start <= nowMinutes) continue;
      if (!busy.some(b => overlaps(start, end, b.start, b.end))) slots.push(toHHMM(start));
    }

    res.json({ date, duration, slots });
  } catch (e) {
    console.error('[public/available-slots]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/public/appointments
router.post('/appointments', async (req, res) => {
  try {
    let { professional_id, service_id, date, start_time, client_name, client_phone, notes } = req.body;

    if (!professional_id || !service_id || !date || !start_time || !client_name || !client_phone)
      return res.status(400).json({ error: 'Preencha todos os campos obrigatórios' });

    client_name       = String(client_name).trim();
    const phoneDigits = String(client_phone).replace(/\D/g, '');

    if (client_name.length < 2)
      return res.status(400).json({ error: 'Informe seu nome completo' });
    if (phoneDigits.length < 10 || phoneDigits.length > 11)
      return res.status(400).json({ error: 'Telefone/WhatsApp inválido' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start_time))
      return res.status(400).json({ error: 'Data ou horário inválidos' });

    const svc = await getOne('SELECT * FROM services WHERE id = $1 AND active = TRUE', [service_id]);
    if (!svc) return res.status(404).json({ error: 'Serviço não encontrado ou inativo' });

    const prof = await getOne('SELECT id FROM professionals WHERE id = $1 AND active = TRUE', [professional_id]);
    if (!prof) return res.status(404).json({ error: 'Profissional não encontrada' });

    const startMin = toMinutes(start_time);
    const now      = new Date();
    const todayStr = now.toLocaleDateString('en-CA');
    if (date < todayStr || (date === todayStr && startMin <= now.getHours() * 60 + now.getMinutes()))
      return res.status(400).json({ error: 'Não é possível agendar em um horário que já passou' });

    const duration = svc.duration || 60;
    const endMin   = startMin + duration;
    if (startMin < OPEN_HOUR * 60 || startMin > CLOSE_MINS)
      return res.status(400).json({ error: 'Horário fora do funcionamento. Agendamentos permitidos das 08:00 às 18:30.' });

    const end_time = toHHMM(endMin);

    const conflictAppt = await getOne(`
      SELECT id FROM appointments
      WHERE professional_id = $1 AND date = $2
        AND status NOT IN ('cancelled','no_show')
        AND ((start_time < $3 AND end_time > $4) OR (start_time >= $4 AND start_time < $3))
    `, [professional_id, date, end_time, start_time]);

    const conflictBlock = await getOne(`
      SELECT id FROM blocked_times
      WHERE professional_id = $1 AND date = $2
        AND ((start_time < $3 AND end_time > $4) OR (start_time >= $4 AND start_time < $3))
    `, [professional_id, date, end_time, start_time]);

    if (conflictAppt || conflictBlock)
      return res.status(409).json({ error: 'Este horário acabou de ser ocupado. Escolha outro, por favor.' });

    // Normaliza telefone: remove tudo que não é dígito para comparar — PostgreSQL usa REGEXP_REPLACE
    let client = await getOne(
      `SELECT id FROM clients WHERE REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $1`,
      [phoneDigits]
    );

    let clientId;
    if (client) {
      clientId = client.id;
    } else {
      const r = await getOne(
        'INSERT INTO clients (name, phone) VALUES ($1,$2) RETURNING id',
        [client_name, phoneDigits]
      );
      clientId = r.id;
    }

    const result = await getOne(`
      INSERT INTO appointments
        (client_id, professional_id, service_id, date, start_time, end_time, price, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled',$8)
      RETURNING id
    `, [clientId, professional_id, service_id, date, start_time, end_time,
        svc.price, notes ? String(notes).slice(0, 300) : null]);

    res.status(201).json({
      message: 'Agendamento solicitado com sucesso',
      appointment_id: result.id,
      date, start_time, end_time,
    });
  } catch (e) {
    console.error('[public/appointments POST]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
