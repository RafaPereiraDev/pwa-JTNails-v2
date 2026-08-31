const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { prepare }                      = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.get('/', authenticateToken, requireAdmin, (req, res) => {
  const users = prepare(`
    SELECT u.id, u.name, u.email, u.role, u.active, u.professional_id, u.created_at,
           p.name as professional_name
    FROM users u LEFT JOIN professionals p ON u.professional_id = p.id
    ORDER BY u.name
  `).all();
  res.json(users);
});

router.post('/', authenticateToken, requireAdmin, (req, res) => {
  const { name, email, password, role, professional_id } = req.body;
  if (!name || !email || !password || !role)
    return res.status(400).json({ error: 'Nome, e-mail, senha e função são obrigatórios' });
  if (!['admin','professional'].includes(role))
    return res.status(400).json({ error: 'Função inválida' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });

  const existing = prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(400).json({ error: 'E-mail já cadastrado' });

  const result = prepare(
    'INSERT INTO users (name, email, password, role, professional_id) VALUES (?,?,?,?,?)'
  ).run(name.trim(), email.toLowerCase().trim(), bcrypt.hashSync(password, 10), role, professional_id || null);

  res.status(201).json({ id: result.lastInsertRowid, message: 'Usuário criado com sucesso' });
});

router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
  const { name, email, role, professional_id, active } = req.body;
  const user = prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  prepare('UPDATE users SET name=?,email=?,role=?,professional_id=?,active=? WHERE id=?').run(
    name || user.name,
    email ? email.toLowerCase().trim() : user.email,
    role  || user.role,
    professional_id !== undefined ? professional_id : user.professional_id,
    active !== undefined ? active : user.active,
    req.params.id
  );
  res.json({ message: 'Usuário atualizado com sucesso' });
});

router.put('/:id/reset-password', authenticateToken, requireAdmin, (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6)
    return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
  prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), req.params.id);
  res.json({ message: 'Senha redefinida com sucesso' });
});

router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'Não é possível excluir seu próprio usuário' });
  prepare('UPDATE users SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Usuário desativado com sucesso' });
});

module.exports = router;
