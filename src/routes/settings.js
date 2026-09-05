const express = require('express');
const router  = express.Router();
const { query, getOne }                   = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { PUBLIC_KEY: VAPID_PUBLIC }        = require('../push');

// Emojis em Unicode escaped para não depender do encoding do arquivo-fonte:
// \uD83C\uDF89 = 🎉  \uD83C\uDF82 = 🎂  \u2728 = ✨  \uD83D\uDC96 = 💖
const DEFAULT_BIRTHDAY_MSG =
  'Parab\u00e9ns, {nome}! \uD83C\uDF89\uD83C\uDF82 O Sal\u00e3o Tainara Nails deseja a voc\u00ea um dia maravilhoso, repleto de alegria e momentos especiais! \u2728\uD83D\uDC96';

// GET /api/settings/birthday-message — qualquer usuário autenticado pode ler
// (o dashboard precisa da mensagem para montar o link de WhatsApp)
router.get('/birthday-message', authenticateToken, async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const row = await getOne(`SELECT value FROM settings WHERE key = 'birthday_message'`);
    res.json({ message: row ? row.value : DEFAULT_BIRTHDAY_MSG });
  } catch (e) {
    console.error('[settings/birthday-message GET]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/settings/birthday-message — só admin/master pode alterar
router.put('/birthday-message', authenticateToken, requireAdmin, async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    let { message } = req.body;
    if (!message || !String(message).trim())
      return res.status(400).json({ error: 'A mensagem não pode ficar vazia' });

    message = String(message).slice(0, 500); // limite de tamanho

    await query(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('birthday_message', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
    `, [message]);

    res.json({ message: 'Mensagem de aniversário salva com sucesso', value: message });
  } catch (e) {
    console.error('[settings/birthday-message PUT]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── Web Push (notificações) ───────────────────────────────────────────────────

// GET /api/settings/push/public-key — chave VAPID pública para o front se inscrever
router.get('/push/public-key', authenticateToken, (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC || null });
});

// GET /api/settings/notifications — preferências do usuário logado
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const u = await getOne(
      'SELECT notify_new_appointment, notify_vibrate FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json({
      notify_new_appointment: u ? u.notify_new_appointment !== false : true,
      notify_vibrate:         u ? u.notify_vibrate !== false : true,
    });
  } catch (e) {
    console.error('[settings/notifications GET]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/settings/notifications — salva as preferências
router.put('/notifications', authenticateToken, async (req, res) => {
  try {
    const { notify_new_appointment, notify_vibrate } = req.body;
    await query(
      'UPDATE users SET notify_new_appointment = $1, notify_vibrate = $2 WHERE id = $3',
      [!!notify_new_appointment, !!notify_vibrate, req.user.id]
    );
    res.json({ message: 'Preferências salvas' });
  } catch (e) {
    console.error('[settings/notifications PUT]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/settings/push/subscribe — registra o dispositivo do navegador
router.post('/push/subscribe', authenticateToken, async (req, res) => {
  try {
    const sub = req.body;
    if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth)
      return res.status(400).json({ error: 'Inscrição inválida' });

    await query(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, p256dh = $3, auth = $4
    `, [req.user.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth]);

    res.status(201).json({ message: 'Dispositivo inscrito para notificações' });
  } catch (e) {
    console.error('[settings/push/subscribe]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/settings/push/unsubscribe — remove o dispositivo
router.post('/push/unsubscribe', authenticateToken, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
    res.json({ message: 'Dispositivo removido' });
  } catch (e) {
    console.error('[settings/push/unsubscribe]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
