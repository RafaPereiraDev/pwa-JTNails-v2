const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { prepare }                      = require('../database/db');
const { authenticateToken, requireAdmin, requireMaster } = require('../middleware/auth');

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
  // Só o master pode criar outro master (via role 'master', que não é permitido pela UI comum)
  if (role === 'master' && req.user.role !== 'master')
    return res.status(403).json({ error: 'Apenas o administrador mestre pode criar outro mestre' });
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

  // Ninguém além do master mexe na conta do master
  if (user.role === 'master' && req.user.role !== 'master')
    return res.status(403).json({ error: 'Apenas o administrador mestre pode alterar a conta mestre' });

  // Admin comum não pode promover ninguém a master
  const newRole = role || user.role;
  if (newRole === 'master' && req.user.role !== 'master')
    return res.status(403).json({ error: 'Apenas o administrador mestre pode definir a função mestre' });

  prepare('UPDATE users SET name=?,email=?,role=?,professional_id=?,active=? WHERE id=?').run(
    name || user.name,
    email ? email.toLowerCase().trim() : user.email,
    newRole,
    professional_id !== undefined ? professional_id : user.professional_id,
    active !== undefined ? active : user.active,
    req.params.id
  );
  res.json({ message: 'Usuário atualizado com sucesso' });
});

// Redefinição de senha de outro usuário: exclusivo do administrador mestre
router.put('/:id/reset-password', authenticateToken, requireMaster, (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6)
    return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
  const target = prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });
  prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), req.params.id);
  res.json({ message: 'Senha redefinida com sucesso' });
});

router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'Não é possível excluir seu próprio usuário' });
  const target = prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });
  // Uma admin não pode excluir outra admin nem o master. Só o master pode.
  if ((target.role === 'admin' || target.role === 'master') && req.user.role !== 'master')
    return res.status(403).json({ error: 'Apenas o administrador mestre pode excluir uma administradora' });

  // Se o usuário está vinculado a uma profissional com histórico, não dá para apagar de vez
  // (quebraria a integridade dos agendamentos). Nesse caso, desativa.
  let hasHistory = 0;
  if (target.professional_id) {
    hasHistory = prepare('SELECT COUNT(*) as c FROM appointments WHERE professional_id = ?')
      .get(target.professional_id).c;
  }

  if (hasHistory > 0) {
    prepare('UPDATE users SET active = 0 WHERE id = ?').run(req.params.id);
    prepare('UPDATE professionals SET active = 0 WHERE id = ?').run(target.professional_id);
    return res.json({ message: 'Usuário desativado (possui histórico de agendamentos)' });
  }

  // Sem histórico: remove o usuário de vez (e a ficha de profissional vinculada, se houver)
  prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (target.professional_id) prepare('DELETE FROM professionals WHERE id = ?').run(target.professional_id);
  res.json({ message: 'Usuário excluído com sucesso' });
});

module.exports = router;
