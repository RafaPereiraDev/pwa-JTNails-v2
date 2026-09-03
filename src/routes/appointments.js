const express = require('express');
const router  = express.Router();
const { prepare, getDb }       = require('../database/db');
const { authenticateToken }    = require('../middleware/auth');

function calcEndTime(start, mins) {
  const [h, m] = start.split(':').map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60) % 24).padStart(2,'0')}:${String(t % 60).padStart(2,'0')}`;
}

/**
 * Recalcula e persiste a confiabilidade de uma cliente com base no histórico completo.
 * Lógica:
 *   - Menos de 3 agendamentos finalizados/faltados → 'new'  (sem histórico suficiente)
 *   - 0 no_show                                    → 'good'
 *   - 1 no_show E taxa de comparecimento >= 60%    → 'irregular'
 *   - 2+ no_show OU taxa de comparecimento < 60%   → 'unreliable'
 */
function recalculateClientReliability(client_id) {
  const stats = prepare(`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('completed','no_show','cancelled')) as total_closed,
      COUNT(*) FILTER (WHERE status = 'completed')  as completed,
      COUNT(*) FILTER (WHERE status = 'no_show')    as no_shows
    FROM appointments WHERE client_id = ?
  `).get(client_id);

  let reliability;
  const closed    = stats.total_closed || 0;
  const completed = stats.completed    || 0;
  const noShows   = stats.no_shows     || 0;

  if (closed < 3) {
    reliability = 'new';
  } else if (noShows === 0) {
    reliability = 'good';
  } else if (noShows >= 2 || (completed / closed) < 0.6) {
    reliability = 'unreliable';
  } else {
    reliability = 'irregular';
  }

  prepare('UPDATE clients SET reliability = ? WHERE id = ?').run(reliability, client_id);
}

function hasConflict(professional_id, date, start_time, end_time, exclude_id = null) {
  // Check appointments
  let sql = `
    SELECT id FROM appointments
    WHERE professional_id=? AND date=? AND status NOT IN ('cancelled','no_show')
    AND ((start_time < ? AND end_time > ?) OR (start_time >= ? AND start_time < ?))
  `;
  const args = [professional_id, date, end_time, start_time, start_time, end_time];
  if (exclude_id) { sql += ' AND id != ?'; args.push(exclude_id); }
  if (prepare(sql).get(...args)) return true;

  // Check blocked times
  const blocked = prepare(`
    SELECT id FROM blocked_times
    WHERE professional_id=? AND date=?
    AND ((start_time < ? AND end_time > ?) OR (start_time >= ? AND start_time < ?))
  `).get(professional_id, date, end_time, start_time, start_time, end_time);

  return !!blocked;
}

const APPT_SELECT = `
  SELECT a.*,
    c.name as client_name, c.phone as client_phone,
    s.name as service_name, s.duration as service_duration,
    p.name as professional_name, p.color as professional_color
  FROM appointments a
  JOIN clients c ON a.client_id = c.id
  JOIN services s ON a.service_id = s.id
  JOIN professionals p ON a.professional_id = p.id
`;

router.get('/today', authenticateToken, (req, res) => {
  const today = new Date().toLocaleDateString('en-CA');
  let sql = APPT_SELECT + " WHERE a.date = ? AND a.status NOT IN ('cancelled','no_show')";
  const params = [today];
  if (req.user.role === 'professional' && req.user.professional_id) {
    sql += ' AND a.professional_id = ?'; params.push(req.user.professional_id);
  }
  sql += ' ORDER BY a.start_time';
  res.json(prepare(sql).all(...params));
});

router.get('/', authenticateToken, (req, res) => {
  const { date, professional_id, status, start_date, end_date } = req.query;

  let prof = professional_id;
  if (req.user.role === 'professional' && req.user.professional_id) prof = req.user.professional_id;

  let sql = APPT_SELECT + ' WHERE 1=1';
  const p = [];
  if (prof)       { sql += ' AND a.professional_id=?'; p.push(prof); }
  if (date)       { sql += ' AND a.date=?';            p.push(date); }
  if (start_date) { sql += ' AND a.date>=?';           p.push(start_date); }
  if (end_date)   { sql += ' AND a.date<=?';           p.push(end_date); }
  // Se status explícito foi pedido, filtra por ele; senão esconde cancelados e faltas do calendário
  if (status) {
    sql += ' AND a.status=?'; p.push(status);
  } else {
    sql += " AND a.status NOT IN ('cancelled','no_show')";
  }
  sql += ' ORDER BY a.date, a.start_time';
  res.json(prepare(sql).all(...p));
});

router.get('/:id', authenticateToken, (req, res) => {
  const a = prepare(APPT_SELECT + ' WHERE a.id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Agendamento não encontrado' });
  if (req.user.role === 'professional' && a.professional_id !== req.user.professional_id)
    return res.status(403).json({ error: 'Acesso negado' });
  res.json(a);
});

router.post('/', authenticateToken, (req, res) => {
  const { client_id, professional_id, service_id, date, start_time,
          price, payment_method, notes, status } = req.body;

  if (!client_id || !professional_id || !service_id || !date || !start_time)
    return res.status(400).json({ error: 'Cliente, profissional, serviço, data e horário são obrigatórios' });

  // Uma atendente (com professional_id) só pode criar agendamento na PRÓPRIA agenda.
  // O master gerencia todas.
  if (req.user.professional_id && req.user.role !== 'master' &&
      Number(professional_id) !== Number(req.user.professional_id))
    return res.status(403).json({ error: 'Você só pode criar agendamentos na sua própria agenda' });

  const svc = prepare('SELECT * FROM services WHERE id = ? AND active = 1').get(service_id);
  if (!svc) return res.status(404).json({ error: 'Serviço não encontrado ou inativo' });

  const finalPrice = price !== undefined ? parseFloat(price) : svc.price;
  const end_time   = calcEndTime(start_time, svc.duration);

  if (hasConflict(professional_id, date, start_time, end_time))
    return res.status(409).json({ error: 'Horário conflitante. A profissional já tem um compromisso neste horário.' });

  const result = prepare(`
    INSERT INTO appointments (client_id,professional_id,service_id,date,start_time,end_time,price,status,payment_method,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(client_id, professional_id, service_id, date, start_time, end_time,
         finalPrice, status || 'scheduled', payment_method || null, notes || null);

  res.status(201).json(prepare(APPT_SELECT + ' WHERE a.id = ?').get(result.lastInsertRowid));
});

router.put('/:id', authenticateToken, (req, res) => {
  const appt = prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Agendamento não encontrado' });

  // Atendente (com professional_id, exceto master) só mexe em agendamento da própria agenda
  const ehAtendente = req.user.professional_id && req.user.role !== 'master';
  if (ehAtendente && appt.professional_id !== req.user.professional_id)
    return res.status(403).json({ error: 'Você só pode alterar agendamentos da sua própria agenda' });

  const { client_id, professional_id, service_id, date, start_time,
          price, payment_method, notes, status } = req.body;

  // E não pode transferir o agendamento para a agenda de outra profissional
  if (ehAtendente && professional_id && Number(professional_id) !== Number(req.user.professional_id))
    return res.status(403).json({ error: 'Você não pode transferir agendamentos para outra profissional' });

  const newProfId = professional_id || appt.professional_id;
  const newDate   = date       || appt.date;
  const newStart  = start_time || appt.start_time;
  const newSvcId  = service_id || appt.service_id;

  const svc      = prepare('SELECT * FROM services WHERE id = ?').get(newSvcId);
  const newEnd   = calcEndTime(newStart, svc.duration);
  const newPrice = price !== undefined ? parseFloat(price) : appt.price;

  if (hasConflict(newProfId, newDate, newStart, newEnd, appt.id))
    return res.status(409).json({ error: 'Horário conflitante. A profissional já tem um compromisso neste horário.' });

  prepare(`
    UPDATE appointments SET
      client_id=?,professional_id=?,service_id=?,date=?,start_time=?,end_time=?,
      price=?,status=?,payment_method=?,notes=?
    WHERE id=?
  `).run(
    client_id || appt.client_id,
    newProfId, newSvcId, newDate, newStart, newEnd,
    newPrice,
    status || appt.status,
    payment_method !== undefined ? payment_method : appt.payment_method,
    notes      !== undefined ? notes      : appt.notes,
    req.params.id
  );

  // Auto-create income transaction when completed
  if (status === 'completed' && appt.status !== 'completed') {
    const existing = prepare('SELECT id FROM transactions WHERE appointment_id=? AND type=?').get(req.params.id, 'income');
    if (!existing) {
      const updated = prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
      const cl  = prepare('SELECT name FROM clients WHERE id = ?').get(updated.client_id);
      const sv  = prepare('SELECT name FROM services WHERE id = ?').get(updated.service_id);
      prepare(`INSERT INTO transactions (type,appointment_id,professional_id,description,category,amount,payment_method,date)
               VALUES ('income',?,?,?,'Serviço',?,?,?)`).run(
        req.params.id, updated.professional_id,
        `${sv.name} - ${cl.name}`,
        updated.price,
        updated.payment_method || payment_method || null,
        updated.date
      );
    }
  }

  // Se o agendamento sair de 'completed' para cancelado/não compareceu, remove a receita gerada
  if (appt.status === 'completed' && (status === 'cancelled' || status === 'no_show')) {
    prepare("DELETE FROM transactions WHERE appointment_id = ? AND type = 'income'").run(req.params.id);
  }

  // Recalculate client reliability whenever a terminal status is set
  const terminalStatuses = ['completed', 'no_show', 'cancelled'];
  const finalClientId = client_id || appt.client_id;
  if (status && terminalStatuses.includes(status) && status !== appt.status) {
    recalculateClientReliability(finalClientId);
  }

  res.json({ message: 'Agendamento atualizado com sucesso' });
});

router.delete('/:id', authenticateToken, (req, res) => {
  const appt = prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Agendamento não encontrado' });
  // Atendente (com professional_id, exceto master) só cancela agendamento da própria agenda
  if (req.user.professional_id && req.user.role !== 'master' &&
      appt.professional_id !== req.user.professional_id)
    return res.status(403).json({ error: 'Você só pode cancelar agendamentos da sua própria agenda' });

  // Remove a receita gerada por este agendamento (se houver), para não inflar o faturamento
  prepare("DELETE FROM transactions WHERE appointment_id = ? AND type = 'income'").run(req.params.id);

  prepare("UPDATE appointments SET status='cancelled' WHERE id=?").run(req.params.id);
  res.json({ message: 'Agendamento cancelado com sucesso' });
});

module.exports = router;
