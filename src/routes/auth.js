const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { prepare }                    = require('../database/db');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });

  const user = prepare(`
    SELECT u.*, p.name as professional_name, p.color as professional_color
    FROM users u
    LEFT JOIN professionals p ON u.professional_id = p.id
    WHERE u.email = ? AND u.active = 1
  `).get(email.toLowerCase().trim());

  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'E-mail ou senha incorretos' });

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
      professional_name: user.professional_name,
      professional_color: user.professional_color
    }
  });
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  const user = prepare(`
    SELECT u.id, u.name, u.email, u.role, u.professional_id,
           p.name as professional_name, p.color as professional_color
    FROM users u LEFT JOIN professionals p ON u.professional_id = p.id
    WHERE u.id = ?
  `).get(req.user.id);

  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json(user);
});

// POST /api/auth/change-password
router.post('/change-password', authenticateToken, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
  if (new_password.length < 6)
    return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });

  const user = prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password))
    return res.status(401).json({ error: 'Senha atual incorreta' });

  prepare('UPDATE users SET password = ? WHERE id = ?')
    .run(bcrypt.hashSync(new_password, 10), req.user.id);

  res.json({ message: 'Senha alterada com sucesso' });
});

module.exports = router;
