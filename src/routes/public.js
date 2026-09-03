const express = require('express');
const router  = express.Router();
const { prepare } = require('../database/db');

// ── Configuração de horário de funcionamento (para cálculo de slots) ──────────
const OPEN_HOUR   = 8;     // 08:00
const CLOSE_MINS  = 18 * 60 + 30; // 18:30 — último término possível
const SLOT_STEP   = 30;   // intervalo entre horários oferecidos, em minutos

// Helpers de tempo
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function toHHMM(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Sobreposição de dois intervalos [aStart,aEnd) e [bStart,bEnd) em minutos
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

// ── GET /api/public/professionals ─────────────────────────────────────────────
// Só profissionais ativas. Expõe apenas campos públicos (nunca telefone/email internos).
router.get('/professionals', (req, res) => {
  const rows = prepare(`
    SELECT id, name, color, photo, bio
    FROM professionals
    WHERE active = 1
    ORDER BY name
  `).all();
  res.json(rows);
});

// ── GET /api/public/services ──────────────────────────────────────────────────
// Serviços ativos. Aceita ?professional_id (reservado para uso futuro; hoje
// o sistema não vincula serviço a profissional, então retorna todos os ativos).
router.get('/services', (req, res) => {
  const rows = prepare(`
    SELECT id, name, description, price, duration
    FROM services
    WHERE active = 1
    ORDER BY name
  `).all();
  res.json(rows);
});

// ── GET /api/public/available-slots ────────────────────────────────────────────
// Query: date (YYYY-MM-DD), professional_id, service_id
// Retorna a lista de horários (HH:MM) em que o serviço cabe sem conflito.
router.get('/available-slots', (req, res) => {
  const { date, professional_id, service_id } = req.query;
  if (!date || !professional_id || !service_id)
    return res.status(400).json({ error: 'Data, profissional e serviço são obrigatórios' });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({ error: 'Data inválida' });

  const svc = prepare('SELECT * FROM services WHERE id = ? AND active = 1').get(service_id);
  if (!svc) return res.status(404).json({ error: 'Serviço não encontrado' });

  const prof = prepare('SELECT id FROM professionals WHERE id = ? AND active = 1').get(professional_id);
  if (!prof) return res.status(404).json({ error: 'Profissional não encontrada' });

  const duration = svc.duration || 60;

  // Não oferecer horários no passado
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA');
  const isToday = date === todayStr;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Agendamentos ativos da profissional no dia
  const appts = prepare(`
    SELECT start_time, end_time FROM appointments
    WHERE professional_id = ? AND date = ? AND status NOT IN ('cancelled','no_show')
  `).all(professional_id, date);

  // Bloqueios/folgas da profissional no dia
  const blocks = prepare(`
    SELECT start_time, end_time FROM blocked_times
    WHERE professional_id = ? AND date = ?
  `).all(professional_id, date);

  const busy = [...appts, ...blocks].map(b => ({
    start: toMinutes(b.start_time),
    end:   toMinutes(b.end_time)
  }));

  const slots = [];
  for (let start = OPEN_HOUR * 60; start <= CLOSE_MINS; start += SLOT_STEP) {
    const end = start + duration;

    // Se for hoje, não oferecer horários que já passaram
    if (isToday && start <= nowMinutes) continue;

    // Verifica conflito com qualquer intervalo ocupado
    const conflict = busy.some(b => overlaps(start, end, b.start, b.end));
    if (!conflict) slots.push(toHHMM(start));
  }

  res.json({ date, duration, slots });
});

// ── POST /api/public/appointments ──────────────────────────────────────────────
// Cria (ou reaproveita) a cliente pelo telefone e registra o agendamento.
router.post('/appointments', (req, res) => {
  let { professional_id, service_id, date, start_time, client_name, client_phone, notes } = req.body;

  // Validações básicas
  if (!professional_id || !service_id || !date || !start_time || !client_name || !client_phone)
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios' });

  client_name = String(client_name).trim();
  const phoneDigits = String(client_phone).replace(/\D/g, '');

  if (client_name.length < 2)
    return res.status(400).json({ error: 'Informe seu nome completo' });
  if (phoneDigits.length < 10 || phoneDigits.length > 11)
    return res.status(400).json({ error: 'Telefone/WhatsApp inválido' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start_time))
    return res.status(400).json({ error: 'Data ou horário inválidos' });

  const svc = prepare('SELECT * FROM services WHERE id = ? AND active = 1').get(service_id);
  if (!svc) return res.status(404).json({ error: 'Serviço não encontrado ou inativo' });

  const prof = prepare('SELECT id FROM professionals WHERE id = ? AND active = 1').get(professional_id);
  if (!prof) return res.status(404).json({ error: 'Profissional não encontrada' });

  // Não permitir agendar no passado nem fora do horário de funcionamento (08:00–18:30)
  const startMin = toMinutes(start_time);
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA');
  if (date < todayStr || (date === todayStr && startMin <= now.getHours() * 60 + now.getMinutes()))
    return res.status(400).json({ error: 'Não é possível agendar em um horário que já passou' });

  const duration = svc.duration || 60;
  const endMin = startMin + duration;

  if (startMin < OPEN_HOUR * 60 || startMin > CLOSE_MINS)
    return res.status(400).json({ error: 'Horário fora do funcionamento. Agendamentos permitidos das 08:00 às 18:30.' });
  const end_time = toHHMM(endMin);

  // Revalida conflito no servidor (nunca confiar só no front)
  const conflictAppt = prepare(`
    SELECT id FROM appointments
    WHERE professional_id = ? AND date = ? AND status NOT IN ('cancelled','no_show')
    AND ((start_time < ? AND end_time > ?) OR (start_time >= ? AND start_time < ?))
  `).get(professional_id, date, end_time, start_time, start_time, end_time);
  const conflictBlock = prepare(`
    SELECT id FROM blocked_times
    WHERE professional_id = ? AND date = ?
    AND ((start_time < ? AND end_time > ?) OR (start_time >= ? AND start_time < ?))
  `).get(professional_id, date, end_time, start_time, start_time, end_time);

  if (conflictAppt || conflictBlock)
    return res.status(409).json({ error: 'Este horário acabou de ser ocupado. Escolha outro, por favor.' });

  // Reaproveita a cliente pelo telefone, ou cria uma nova.
  // Normaliza o telefone removendo (), -, espaços e + para comparar só os dígitos.
  let client = prepare(`
    SELECT id FROM clients
    WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,'(',''),')',''),'-',''),' ',''),'+','') = ?
  `).get(phoneDigits);
  let clientId;
  if (client) {
    clientId = client.id;
  } else {
    const r = prepare('INSERT INTO clients (name, phone) VALUES (?, ?)').run(client_name, phoneDigits);
    clientId = r.lastInsertRowid;
  }

  const result = prepare(`
    INSERT INTO appointments
      (client_id, professional_id, service_id, date, start_time, end_time, price, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)
  `).run(clientId, professional_id, service_id, date, start_time, end_time, svc.price, notes ? String(notes).slice(0, 300) : null);

  res.status(201).json({
    message: 'Agendamento solicitado com sucesso',
    appointment_id: result.lastInsertRowid,
    date, start_time, end_time
  });
});

module.exports = router;
