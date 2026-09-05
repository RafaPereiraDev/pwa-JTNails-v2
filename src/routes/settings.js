const express = require('express');
const router  = express.Router();
const { query, getOne }                   = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const DEFAULT_BIRTHDAY_MSG =
  'Parabéns, {nome}! 🎉🎂 O Salão Tainara Nails deseja a você um dia maravilhoso, repleto de alegria e momentos especiais! ✨💖';

// GET /api/settings/birthday-message — qualquer usuário autenticado pode ler
// (o dashboard precisa da mensagem para montar o link de WhatsApp)
router.get('/birthday-message', authenticateToken, async (req, res) => {
  try {
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

module.exports = router;
