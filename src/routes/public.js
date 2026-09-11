const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { pool, query, getOne, getAll } = require('../database/db');
const { notifyUser, getUserIdByProfessional } = require('../push');
const { JWT_SECRET, authenticateClient } = require('../middleware/auth');
const { validatePassword } = require('../utils/passwordPolicy');

// Gera o JWT de sessão da cliente (payload marcado com type:'client')
function signClientToken(c) {
  return jwt.sign(
    { type: 'client', id: c.id, name: c.name, phone: c.phone },
    JWT_SECRET,
    { expiresIn: process.env.CLIENT_JWT_EXPIRES_IN || '30d' }
  );
}

// Normaliza telefone para só dígitos (10-11)
function onlyDigits(v) { return String(v || '').replace(/\D/g, ''); }
function validPhone(d) { return d.length >= 10 && d.length <= 11; }
// Autocorreção do 9º dígito para celular (DDD + 8 dígitos iniciados por 6-9).
function normalizeBRPhone(v) {
  let d = onlyDigits(v);
  if (d.length === 10 && /[6-9]/.test(d[2])) d = d.slice(0, 2) + '9' + d.slice(2);
  return d.slice(0, 11);
}

// Formata YYYY-MM-DD para DD/MM
function formatDateBR(iso) {
  const [y, m, d] = String(iso).split('-');
  return d && m ? `${d}/${m}` : iso;
}

const OPEN_HOUR  = 8;
const CLOSE_MINS = 18 * 60 + 30; // 18:30
const SLOT_STEP  = 30;

// Dias em que o salão está fechado: 0=Domingo, 1=Segunda
const CLOSED_DOW = [0, 1];
// Recebe uma data 'YYYY-MM-DD' e diz se cai em dia fechado (usa meio-dia UTC
// para evitar deslocamento de fuso ao interpretar a string).
function isClosedDay(dateStr) {
  const dow = new Date(`${dateStr}T12:00:00`).getDay();
  return CLOSED_DOW.includes(dow);
}

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

    // Salão fechado aos domingos e segundas: sem horários nesses dias.
    if (isClosedDay(date))
      return res.json({ date, duration: 0, slots: [] });

    const svc = await getOne('SELECT * FROM services WHERE id = $1 AND active = TRUE', [service_id]);
    if (!svc) return res.status(404).json({ error: 'Serviço não encontrado' });

    const prof = await getOne('SELECT id FROM professionals WHERE id = $1 AND active = TRUE', [professional_id]);
    if (!prof) return res.status(404).json({ error: 'Profissional não encontrada' });

    const duration = svc.duration || 60;
    const nowRow   = await getOne(`SELECT NOW() AT TIME ZONE 'America/Sao_Paulo' AS now_local`);
    const nowLocal   = new Date(nowRow.now_local);
    const todayStr   = nowLocal.toLocaleDateString('en-CA');
    const isToday    = date === todayStr;
    const nowMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();

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
// CORREÇÃO: toda a operação roda dentro de uma transação com SELECT FOR UPDATE
// para eliminar a race condition de double-booking.
router.post('/appointments', async (req, res) => {
  try {
    let { professional_id, service_id, date, start_time, client_name, client_phone, client_birth_date, notes } = req.body;

    // Se a cliente estiver autenticada, usamos os dados da conta dela
    let authedClient = null;
    const authHeader = req.headers['authorization'];
    const jwtToken = authHeader && authHeader.split(' ')[1];
    if (jwtToken) {
      try {
        const payload = jwt.verify(jwtToken, JWT_SECRET);
        if (payload && payload.type === 'client') authedClient = payload;
      } catch (_) { /* ignora token inválido */ }
    }
    if (authedClient) {
      client_name  = authedClient.name;
      client_phone = authedClient.phone;
    }

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
    const nowRow   = await getOne(`SELECT NOW() AT TIME ZONE 'America/Sao_Paulo' AS now_local`);
    const nowLocal  = new Date(nowRow.now_local);
    const todayStr  = nowLocal.toLocaleDateString('en-CA');
    if (date < todayStr || (date === todayStr && startMin <= nowLocal.getHours() * 60 + nowLocal.getMinutes()))
      return res.status(400).json({ error: 'Não é possível agendar em um horário que já passou' });

    if (isClosedDay(date))
      return res.status(400).json({ error: 'O salão não atende aos domingos e segundas-feiras.' });

    // Janela máxima de agendamento para a cliente: 30 dias a partir de hoje.
    const maxLocal = new Date(nowLocal);
    maxLocal.setDate(maxLocal.getDate() + 30);
    const maxStr = maxLocal.toLocaleDateString('en-CA');
    if (date > maxStr)
      return res.status(400).json({ error: 'Agendamentos podem ser feitos com no máximo 30 dias de antecedência.' });

    const duration = svc.duration || 60;
    const endMin   = startMin + duration;
    if (startMin < OPEN_HOUR * 60 || startMin > CLOSE_MINS)
      return res.status(400).json({ error: 'Horário fora do funcionamento. Agendamentos permitidos das 08:00 às 18:30.' });

    const end_time = toHHMM(endMin);

    // Tudo a partir daqui dentro de uma transação serializada
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // LOCK: bloqueia todas as linhas de agendamento da profissional neste dia,
      // impedindo que duas transações simultâneas passem pela checagem de conflito.
      await client.query(
        `SELECT id FROM appointments
         WHERE professional_id = $1 AND date = $2
         FOR UPDATE`,
        [professional_id, date]
      );

      // Verifica conflito dentro da transação (após o lock)
      const conflictAppt = (await client.query(`
        SELECT id FROM appointments
        WHERE professional_id = $1 AND date = $2
          AND status NOT IN ('cancelled','no_show')
          AND ((start_time < $3 AND end_time > $4) OR (start_time >= $4 AND start_time < $3))
      `, [professional_id, date, end_time, start_time])).rows[0];

      const conflictBlock = (await client.query(`
        SELECT id FROM blocked_times
        WHERE professional_id = $1 AND date = $2
          AND ((start_time < $3 AND end_time > $4) OR (start_time >= $4 AND start_time < $3))
      `, [professional_id, date, end_time, start_time])).rows[0];

      if (conflictAppt || conflictBlock) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Este horário acabou de ser ocupado. Escolha outro, por favor.' });
      }

      // Vincula ao cliente: se autenticada, usa a conta dela; senão, upsert por telefone
      let clientId;
      const birthDate = (client_birth_date && /^\d{4}-\d{2}-\d{2}$/.test(client_birth_date))
        ? client_birth_date : null;

      if (authedClient) {
        clientId = authedClient.id;
        // Preenche a data de nascimento se ainda não houver
        if (birthDate) {
          await client.query(
            `UPDATE clients SET birth_date = COALESCE(birth_date, $1) WHERE id = $2`,
            [birthDate, clientId]
          );
        }
      } else {
        let clientRow = (await client.query(
          `SELECT id FROM clients WHERE REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $1`,
          [phoneDigits]
        )).rows[0];

        if (clientRow) {
          clientId = clientRow.id;
          if (birthDate) {
            await client.query(
              `UPDATE clients SET birth_date = COALESCE(birth_date, $1) WHERE id = $2`,
              [birthDate, clientId]
            );
          }
        } else {
          const r = (await client.query(
            'INSERT INTO clients (name, phone, birth_date) VALUES ($1,$2,$3) RETURNING id',
            [client_name, phoneDigits, birthDate]
          )).rows[0];
          clientId = r.id;
        }
      }

      // Token seguro (UUID) para a cliente cancelar o próprio agendamento
      const cancelToken = require('crypto').randomUUID();

      const result = (await client.query(`
        INSERT INTO appointments
          (client_id, professional_id, service_id, date, start_time, end_time, price, status, notes, cancel_token)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled',$8,$9)
        RETURNING id
      `, [clientId, professional_id, service_id, date, start_time, end_time,
          parseFloat(svc.price), notes ? String(notes).slice(0, 300) : null, cancelToken])).rows[0];

      await client.query('COMMIT');

      // Notifica a profissional dona da agenda (não bloqueia a resposta)
      getUserIdByProfessional(professional_id)
        .then(userId => {
          if (userId) {
            notifyUser(userId, {
              title: 'Novo Agendamento! 💅',
              body:  `${client_name} agendou para ${formatDateBR(date)} às ${start_time}.`,
              url:   '/',
            });
          }
        })
        .catch(() => {});

      res.status(201).json({
        message: 'Agendamento solicitado com sucesso',
        appointment_id: result.id,
        cancel_token: cancelToken,
        date, start_time, end_time,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[public/appointments POST]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── GET /api/public/my-appointments ───────────────────────────────────────────
// Consulta os agendamentos da CLIENTE AUTENTICADA (via JWT). Retorna ativos e histórico.
router.get('/my-appointments', authenticateClient, async (req, res) => {
  try {
    const client = await getOne(`SELECT id, name FROM clients WHERE id = $1`, [req.client.id]);
    if (!client) return res.json({ client_name: null, appointments: [] });

    const nowRow = await getOne(`SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo') AS now_local`);
    const now = new Date(nowRow.now_local);

    const rows = await getAll(`
      SELECT a.id,
        a.date::text       AS date,
        a.start_time::text AS start_time,
        a.end_time::text   AS end_time,
        a.status, a.cancel_token,
        COALESCE(s.name, 'Serviço Removido') AS service_name, COALESCE(s.price, a.price) AS price,
        p.name AS professional_name, p.color AS professional_color
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      JOIN professionals p ON a.professional_id = p.id
      WHERE a.client_id = $1
      ORDER BY a.date DESC, a.start_time DESC
      LIMIT 50
    `, [client.id]);

    const appointments = rows.map(a => {
      const dt = new Date(`${a.date}T${a.start_time}`);
      const isActive = dt > now && !['cancelled', 'no_show', 'completed'].includes(a.status);
      return {
        id: a.id,
        date: a.date,
        start_time: a.start_time,
        end_time: a.end_time,
        status: a.status,
        service_name: a.service_name,
        price: a.price,
        professional_name: a.professional_name,
        professional_color: a.professional_color,
        is_active: isActive,
        cancel_token: isActive ? a.cancel_token : null,
      };
    });

    res.json({ client_name: client.name, appointments });
  } catch (e) {
    console.error('[public/my-appointments]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── POST /api/public/cancel-appointment ───────────────────────────────────────
// Cancela um agendamento. Aceita dois modos, ambos seguros:
//  1) Cliente autenticada (JWT) enviando { appointment_id } — valida a posse.
//  2) Link seguro com { token } (cancel_token UUID) — para quem não fez login.
router.post('/cancel-appointment', async (req, res) => {
  try {
    const { token, appointment_id } = req.body;

    // Se veio autenticada, resolve o cliente pelo header (sem falhar se não houver token)
    let authedClientId = null;
    const authHeader = req.headers['authorization'];
    const jwtToken = authHeader && authHeader.split(' ')[1];
    if (jwtToken) {
      try {
        const payload = jwt.verify(jwtToken, JWT_SECRET);
        if (payload && payload.type === 'client') authedClientId = payload.id;
      } catch (_) { /* token inválido é ignorado; cai no fluxo por UUID */ }
    }

    if (!token && !appointment_id)
      return res.status(400).json({ error: 'Informe o agendamento a cancelar' });

    // Monta a busca conforme o modo
    let appt;
    if (appointment_id && authedClientId) {
      // Modo autenticado: só cancela se o agendamento for da própria cliente logada
      appt = await getOne(`
        SELECT a.id, a.status, a.professional_id,
          a.date::text AS date, a.start_time::text AS start_time,
          c.name AS client_name, COALESCE(s.name, 'Serviço') AS service_name
        FROM appointments a
        JOIN clients c       ON a.client_id = c.id
        LEFT JOIN services s ON a.service_id = s.id
        WHERE a.id = $1 AND a.client_id = $2
      `, [appointment_id, authedClientId]);
      if (!appt) return res.status(404).json({ error: 'Agendamento não encontrado' });
    } else if (token) {
      // Modo link seguro: valida a posse do token UUID
      appt = await getOne(`
        SELECT a.id, a.status, a.professional_id,
          a.date::text AS date, a.start_time::text AS start_time,
          c.name AS client_name, COALESCE(s.name, 'Serviço') AS service_name
        FROM appointments a
        JOIN clients c       ON a.client_id = c.id
        LEFT JOIN services s ON a.service_id = s.id
        WHERE a.cancel_token = $1
      `, [token]);
      if (!appt) return res.status(404).json({ error: 'Agendamento não encontrado ou token inválido' });
    } else {
      return res.status(401).json({ error: 'Você precisa entrar para cancelar este agendamento' });
    }

    if (['cancelled', 'no_show'].includes(appt.status))
      return res.status(409).json({ error: 'Este agendamento já foi cancelado' });
    if (appt.status === 'completed')
      return res.status(409).json({ error: 'Este atendimento já foi concluído e não pode ser cancelado' });

    // Cancela e libera o horário; marca que foi a própria cliente
    await query(
      `UPDATE appointments SET status = 'cancelled', cancelled_by = 'client' WHERE id = $1`,
      [appt.id]
    );
    // Remove eventual receita gerada (não deve haver, mas por segurança)
    await query(`DELETE FROM transactions WHERE appointment_id = $1 AND type = 'income'`, [appt.id]);

    // Notifica a profissional que o horário foi liberado
    getUserIdByProfessional(appt.professional_id)
      .then(userId => {
        if (userId) {
          notifyUser(userId, {
            title: 'Horário liberado 🔓',
            body:  `${appt.client_name} cancelou o agendamento de ${formatDateBR(appt.date)} às ${String(appt.start_time).slice(0,5)}.`,
            url:   '/',
          });
        }
      })
      .catch(() => {});

    res.json({
      message: 'Agendamento cancelado com sucesso',
      date: appt.date,
      start_time: String(appt.start_time).slice(0, 5),
      service_name: appt.service_name,
    });
  } catch (e) {
    console.error('[public/cancel-appointment]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── AUTENTICAÇÃO DE CLIENTE ───────────────────────────────────────────────────

// POST /api/public/client/register — cria conta OU define senha de cliente já existente
// Body: { name, birth_date, phone, password }
router.post('/client/register', async (req, res) => {
  try {
    let { name, birth_date, phone, password } = req.body;
    name = String(name || '').trim();
    const phoneDigits = normalizeBRPhone(phone);
    password = String(password || '');

    if (name.length < 2)       return res.status(400).json({ error: 'Informe seu nome completo' });
    if (phoneDigits.length !== 11 || phoneDigits[2] !== '9')
      return res.status(400).json({ error: 'Número de WhatsApp inválido. Inclua o DDD e o dígito 9 (ex: 47 9XXXX-XXXX).' });
    if (birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(birth_date))
      return res.status(400).json({ error: 'Data de nascimento inválida' });

    // Política de senha (comprimento, sequências, repetições, teclado, comuns)
    const pwCheck = validatePassword(password, [name, phoneDigits]);
    if (!pwCheck.valid) return res.status(400).json({ error: pwCheck.error });

    const hash = await bcrypt.hash(password, 10);

    // Já existe cliente com esse telefone?
    const existing = await getOne(
      `SELECT id, name, password FROM clients WHERE REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $1`,
      [phoneDigits]
    );

    let clientRow;
    if (existing) {
      // Cliente antiga sem senha → define a senha agora (primeiro acesso).
      // Se já tiver senha, bloqueia (deve usar login, não registrar de novo).
      if (existing.password)
        return res.status(409).json({ error: 'Já existe uma conta com este WhatsApp. Faça login com sua senha.' });

      await query(
        `UPDATE clients SET password = $1, name = $2,
           birth_date = COALESCE($3, birth_date) WHERE id = $4`,
        [hash, name, birth_date || null, existing.id]
      );
      clientRow = { id: existing.id, name, phone: phoneDigits };
    } else {
      const r = await getOne(
        `INSERT INTO clients (name, phone, birth_date, password) VALUES ($1,$2,$3,$4) RETURNING id`,
        [name, phoneDigits, birth_date || null, hash]
      );
      clientRow = { id: r.id, name, phone: phoneDigits };
    }

    const token = signClientToken(clientRow);
    res.status(201).json({ token, client: clientRow });
  } catch (e) {
    console.error('[public/client/register]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/public/client/check?phone=... — informa se o telefone já tem conta/senha
// Ajuda o frontend a decidir entre "entrar" e "criar conta / definir senha".
router.get('/client/check', async (req, res) => {
  try {
    const phoneDigits = onlyDigits(req.query.phone);
    if (!validPhone(phoneDigits)) return res.status(400).json({ error: 'Telefone inválido' });

    const c = await getOne(
      `SELECT id, password FROM clients
       WHERE REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $1`,
      [phoneDigits]
    );
    res.json({
      exists: !!c,
      has_password: !!(c && c.password),
    });
  } catch (e) {
    console.error('[public/client/check]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/public/client/login — Body: { phone, password }
router.post('/client/login', async (req, res) => {
  try {
    const phoneDigits = onlyDigits(req.body.phone);
    const password = String(req.body.password || '');
    if (!validPhone(phoneDigits) || !password)
      return res.status(400).json({ error: 'Informe WhatsApp e senha' });

    const c = await getOne(
      `SELECT id, name, phone, password FROM clients
       WHERE REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $1`,
      [phoneDigits]
    );

    if (!c || !c.password || !bcrypt.compareSync(password, c.password))
      return res.status(401).json({ error: 'WhatsApp ou senha incorretos' });

    const clientRow = { id: c.id, name: c.name, phone: phoneDigits };
    const token = signClientToken(clientRow);
    res.json({ token, client: clientRow });
  } catch (e) {
    console.error('[public/client/login]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/public/client/me — dados da cliente logada
router.get('/client/me', authenticateClient, async (req, res) => {
  try {
    const c = await getOne(
      `SELECT id, name, phone, birth_date FROM clients WHERE id = $1`,
      [req.client.id]
    );
    if (!c) return res.status(404).json({ error: 'Conta não encontrada' });
    res.json(c);
  } catch (e) {
    console.error('[public/client/me]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
