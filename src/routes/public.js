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

// Verifica se `targetStr` (YYYY-MM-DD) cai dentro da janela do aniversário de birthDate.
// Regra: vale na semana (segunda a domingo) do aniversário. Se o aniversário cair no
// sábado/domingo, a validade passa para a SEMANA SEGUINTE inteira (seg-dom).
// Compara pelo ano de `targetStr` (o aniversário "deste ano").
function isWithinBirthdayWindow(birthDate, targetStr) {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}/.test(birthDate)) return false;
  const [ , bm, bd] = birthDate.slice(0, 10).split('-').map(Number);
  const [ty] = targetStr.split('-').map(Number);

  // Data do aniversário no ano do agendamento (meio-dia evita problema de fuso)
  const bday = new Date(ty, bm - 1, bd, 12, 0, 0);
  if (isNaN(bday)) return false;

  // Início da semana (segunda) que contém o aniversário
  const dow = bday.getDay(); // 0=dom ... 6=sab
  const isWeekend = dow === 0 || dow === 6;
  const diffToMonday = (dow === 0 ? -6 : 1 - dow); // leva até a segunda daquela semana
  const monday = new Date(bday); monday.setDate(bday.getDate() + diffToMonday);

  // Fim de semana → empurra a janela para a semana seguinte
  if (isWeekend) monday.setDate(monday.getDate() + 7);

  const start = new Date(monday); start.setHours(0, 0, 0, 0);
  const end = new Date(monday); end.setDate(monday.getDate() + 6); end.setHours(23, 59, 59, 999);

  const toStr = (d) => d.toLocaleDateString('en-CA');
  return targetStr >= toStr(start) && targetStr <= toStr(end);
}

// Formata YYYY-MM-DD para DD/MM
function formatDateBR(iso) {
  const [y, m, d] = String(iso).split('-');
  return d && m ? `${d}/${m}` : iso;
}

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
      `SELECT id, name, color, photo, bio,
              fidelidade_ativa, fidelidade_porcentagem,
              aniversario_ativo, aniversario_porcentagem
       FROM professionals WHERE active = TRUE ORDER BY name`
    ));
  } catch (e) {
    console.error('[public/professionals]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/public/loyalty?phone=...&professional_id=...
// Saldo de selos do telefone com aquela profissional + config de fidelidade dela.
router.get('/loyalty', async (req, res) => {
  try {
    const phoneDigits = onlyDigits(req.query.phone);
    const profId = parseInt(req.query.professional_id);
    if (!validPhone(phoneDigits) || !profId)
      return res.status(400).json({ error: 'Telefone e profissional são obrigatórios' });

    const prof = await getOne(
      `SELECT fidelidade_ativa, fidelidade_porcentagem FROM professionals
       WHERE id = $1 AND active = TRUE`, [profId]
    );
    if (!prof) return res.status(404).json({ error: 'Profissional não encontrada' });

    const row = await getOne(
      `SELECT stamps FROM loyalty WHERE phone = $1 AND professional_id = $2`,
      [phoneDigits, profId]
    );
    const stamps = row ? row.stamps : 0;

    res.json({
      fidelidade_ativa:       prof.fidelidade_ativa !== false,
      fidelidade_porcentagem: Number(prof.fidelidade_porcentagem ?? 10),
      stamps,
      goal: 10,
      ready: stamps >= 10, // atingiu a meta → desconto disponível no próximo agendamento
    });
  } catch (e) {
    console.error('[public/loyalty]', e.message);
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

    const prof = await getOne(
      `SELECT id, fidelidade_ativa, fidelidade_porcentagem,
              aniversario_ativo, aniversario_porcentagem, desconto_combo_porcentagem
       FROM professionals WHERE id = $1 AND active = TRUE`, [professional_id]);
    if (!prof) return res.status(404).json({ error: 'Profissional não encontrada' });

    const startMin = toMinutes(start_time);
    const nowRow   = await getOne(`SELECT NOW() AT TIME ZONE 'America/Sao_Paulo' AS now_local`);
    const nowLocal  = new Date(nowRow.now_local);
    const todayStr  = nowLocal.toLocaleDateString('en-CA');
    if (date < todayStr || (date === todayStr && startMin <= nowLocal.getHours() * 60 + nowLocal.getMinutes()))
      return res.status(400).json({ error: 'Não é possível agendar em um horário que já passou' });

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

      // ── Desconto (validado no servidor, nunca confia no cliente) ──────────
      // Fidelidade: saldo de selos >= 10 com ESTA profissional e promoção ativa.
      // Aniversário: cliente faz aniversário hoje (MM-DD) e promoção ativa.
      // Se ambos se aplicam, usa o de MAIOR desconto. Só um é gravado.
      const originalPrice = parseFloat(svc.price);
      let fidelidadeResgatada = false;
      let cupomAniversario    = false;
      let descontoPct         = 0;

      // Selos atuais (lock da linha para não resgatar duas vezes em paralelo)
      const loyaltyRow = (await client.query(
        `SELECT stamps FROM loyalty WHERE phone = $1 AND professional_id = $2 FOR UPDATE`,
        [phoneDigits, professional_id]
      )).rows[0];
      const stamps = loyaltyRow ? loyaltyRow.stamps : 0;
      const fidelidadePct = prof.fidelidade_ativa !== false ? Number(prof.fidelidade_porcentagem ?? 10) : 0;
      const fidelidadeAplicavel = stamps >= 10 && fidelidadePct > 0;

      // Aniversário: vale na SEMANA do aniversário (sáb/dom → semana seguinte),
      // 1 uso por ano (cupom_aniversario_usado_ano). Confere pela data do agendamento.
      let aniversarioAplicavel = false;
      const anoAgendamento = parseInt(date.slice(0, 4));
      if (prof.aniversario_ativo !== false && Number(prof.aniversario_porcentagem ?? 10) > 0) {
        const cli = (await client.query(
          'SELECT birth_date, cupom_aniversario_usado_ano FROM clients WHERE id = $1', [clientId]
        )).rows[0];
        if (cli && isWithinBirthdayWindow(cli.birth_date, date) &&
            Number(cli.cupom_aniversario_usado_ano) !== anoAgendamento) {
          aniversarioAplicavel = true;
        }
      }

      // Decisão do desconto:
      //  - Fidelidade + Aniversário → COMBO (valor fixo, NÃO soma)
      //  - Só fidelidade → % fidelidade
      //  - Só aniversário → % aniversário
      let combo = false;
      if (fidelidadeAplicavel && aniversarioAplicavel) {
        combo = true;
        fidelidadeResgatada = true;
        cupomAniversario    = true;
        descontoPct = Number(prof.desconto_combo_porcentagem ?? 20);
      } else if (fidelidadeAplicavel) {
        fidelidadeResgatada = true;
        descontoPct = fidelidadePct;
      } else if (aniversarioAplicavel) {
        cupomAniversario = true;
        descontoPct = Number(prof.aniversario_porcentagem ?? 10);
      }

      const descontoValor = Math.round(originalPrice * (descontoPct / 100) * 100) / 100;
      const finalPrice    = Math.max(0, Math.round((originalPrice - descontoValor) * 100) / 100);

      // Token seguro (UUID) para a cliente cancelar o próprio agendamento
      const cancelToken = require('crypto').randomUUID();

      const result = (await client.query(`
        INSERT INTO appointments
          (client_id, professional_id, service_id, date, start_time, end_time, price, status, notes, cancel_token,
           fidelidade_resgatada, cupom_aniversario, discount_amount, original_price)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled',$8,$9,$10,$11,$12,$13)
        RETURNING id
      `, [clientId, professional_id, service_id, date, start_time, end_time,
          finalPrice, notes ? String(notes).slice(0, 300) : null, cancelToken,
          fidelidadeResgatada, cupomAniversario, descontoValor, originalPrice])).rows[0];

      await client.query('COMMIT');

      // Notifica a profissional dona da agenda (não bloqueia a resposta)
      const temDesconto = fidelidadeResgatada || cupomAniversario;
      const tipoDesc = combo ? 'PARABÉNS DUPLO (fidelidade + aniversário)'
                     : fidelidadeResgatada ? 'fidelidade' : 'aniversário';
      getUserIdByProfessional(professional_id)
        .then(userId => {
          if (userId) {
            notifyUser(userId, temDesconto ? {
              title: combo ? '🎉 Agendamento com PARABÉNS DUPLO!' : '🎁 Novo agendamento COM DESCONTO!',
              body:  `${client_name} agendou para ${formatDateBR(date)} às ${start_time} — ${tipoDesc} (-${descontoPct}%).`,
              url:   '/',
            } : {
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
        original_price: originalPrice,
        discount_amount: descontoValor,
        discount_pct: descontoPct,
        final_price: finalPrice,
        fidelidade_resgatada: fidelidadeResgatada,
        cupom_aniversario: cupomAniversario,
        combo,
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
        s.name AS service_name, s.price,
        p.name AS professional_name, p.color AS professional_color
      FROM appointments a
      JOIN services s      ON a.service_id = s.id
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
          c.name AS client_name, s.name AS service_name
        FROM appointments a
        JOIN clients c  ON a.client_id = c.id
        JOIN services s ON a.service_id = s.id
        WHERE a.id = $1 AND a.client_id = $2
      `, [appointment_id, authedClientId]);
      if (!appt) return res.status(404).json({ error: 'Agendamento não encontrado' });
    } else if (token) {
      // Modo link seguro: valida a posse do token UUID
      appt = await getOne(`
        SELECT a.id, a.status, a.professional_id,
          a.date::text AS date, a.start_time::text AS start_time,
          c.name AS client_name, s.name AS service_name
        FROM appointments a
        JOIN clients c  ON a.client_id = c.id
        JOIN services s ON a.service_id = s.id
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
    const phoneDigits = onlyDigits(phone);
    password = String(password || '');

    if (name.length < 2)       return res.status(400).json({ error: 'Informe seu nome completo' });
    if (!validPhone(phoneDigits)) return res.status(400).json({ error: 'WhatsApp/telefone inválido' });
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
      `SELECT id, name, password, birth_date FROM clients
       WHERE REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $1`,
      [phoneDigits]
    );
    res.json({
      exists: !!c,
      has_password: !!(c && c.password),
      name: c ? c.name : null,
      birth_date: c ? c.birth_date : null,
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

// ── CRON: lembrete de aniversariantes da semana ───────────────────────────────
// Feito para ser chamado por um agendador externo toda segunda de manhã
// (Render Cron Job ou cron-job.org) com o header/param do CRON_SECRET.
// Como as CLIENTES não têm inscrição de push, notificamos a PROFISSIONAL com a
// lista de aniversariantes da semana para ela avisar o presente.
// GET /api/public/cron/birthday-reminders?secret=XYZ  (ou header x-cron-secret)
router.get('/cron/birthday-reminders', async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET;
    const provided = req.headers['x-cron-secret'] || req.query.secret;
    if (!secret || provided !== secret)
      return res.status(403).json({ error: 'Não autorizado' });

    const { runBirthdayReminders } = require('../scheduler');
    const count = await runBirthdayReminders();
    res.json({ ok: true, count });
  } catch (e) {
    console.error('[public/cron/birthday-reminders]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── CRON: lembrete no HORÁRIO do atendimento (profissional) ───────────────────
// Chamar a cada ~5 min por um agendador externo (alternativa ao cron interno).
// Reusa a mesma lógica do scheduler para evitar duplicação de código.
// GET /api/public/cron/upcoming-reminders?secret=XYZ  (ou header x-cron-secret)
router.get('/cron/upcoming-reminders', async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET;
    const provided = req.headers['x-cron-secret'] || req.query.secret;
    if (!secret || provided !== secret)
      return res.status(403).json({ error: 'Não autorizado' });

    const { runUpcomingReminders } = require('../scheduler');
    const count = await runUpcomingReminders();
    res.json({ ok: true, count });
  } catch (e) {
    console.error('[public/cron/upcoming-reminders]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
