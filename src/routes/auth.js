const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { getOne }                         = require('../database/db');
const { JWT_SECRET, authenticateToken }  = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });

    const emailNorm = email.toLowerCase().trim();

    // 1) Busca isolada do hash apenas para verificação. Este objeto (com o hash)
    //    fica em escopo mínimo e nunca é serializado na resposta.
    const cred = await getOne(
      'SELECT id, password FROM users WHERE email = $1 AND active = TRUE',
      [emailNorm]
    );

    if (!cred || !bcrypt.compareSync(password, cred.password))
      return res.status(401).json({ error: 'E-mail ou senha incorretos' });

    // 2) Busca os dados de exibição em query separada — sem a coluna password.
    const user = await getOne(`
      SELECT u.id, u.name, u.email, u.role, u.professional_id,
             p.name  AS professional_name,
             p.color AS professional_color,
             p.photo AS professional_photo
      FROM users u
      LEFT JOIN professionals p ON u.professional_id = p.id
      WHERE u.id = $1
    `, [cred.id]);

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email,
        role: user.role, professional_id: user.professional_id },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
    );

    res.json({
      token,
      user: {
        id: user.id, name: user.name, email: user.email,
        role: user.role, professional_id: user.professional_id,
        professional_name:  user.professional_name,
        professional_color: user.professional_color,
        professional_photo: user.professional_photo,
      }
    });
  } catch (e) {
    console.error('[auth/login]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await getOne(`
      SELECT u.id, u.name, u.email, u.role, u.professional_id,
             p.name  as professional_name,
             p.color as professional_color,
             p.photo as professional_photo
      FROM users u LEFT JOIN professionals p ON u.professional_id = p.id
      WHERE u.id = $1
    `, [req.user.id]);

    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(user);
  } catch (e) {
    console.error('[auth/me]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password)
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
    if (new_password.length < 6)
      return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });

    // Busca só o hash para comparar — não mantém dados desnecessários em memória
    const userRow = await getOne('SELECT id, password FROM users WHERE id = $1', [req.user.id]);
    if (!bcrypt.compareSync(current_password, userRow.password))
      return res.status(401).json({ error: 'Senha atual incorreta' });

    const hash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Senha alterada com sucesso' });
  } catch (e) {
    console.error('[auth/change-password]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
