const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { query, getOne, getAll }                            = require('../database/db');
const { authenticateToken, requireAdmin, requireMaster }   = require('../middleware/auth');

router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    res.json(await getAll(`
      SELECT u.id, u.name, u.email, u.role, u.active, u.professional_id, u.created_at,
             p.name as professional_name
      FROM users u LEFT JOIN professionals p ON u.professional_id = p.id
      ORDER BY u.name
    `));
  } catch (e) {
    console.error('[users GET]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role, professional_id } = req.body;
    if (!name || !email || !password || !role)
      return res.status(400).json({ error: 'Nome, e-mail, senha e função são obrigatórios' });
    if (!['admin','professional'].includes(role))
      return res.status(400).json({ error: 'Função inválida' });
    if (role === 'master' && req.user.role !== 'master')
      return res.status(403).json({ error: 'Apenas o administrador mestre pode criar outro mestre' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });

    const existing = await getOne('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing) return res.status(400).json({ error: 'E-mail já cadastrado' });

    const result = await getOne(
      'INSERT INTO users (name, email, password, role, professional_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [name.trim(), email.toLowerCase().trim(), bcrypt.hashSync(password, 10), role, professional_id || null]
    );
    res.status(201).json({ id: result.id, message: 'Usuário criado com sucesso' });
  } catch (e) {
    console.error('[users POST]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, email, role, professional_id, active } = req.body;
    const user = await getOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    if (user.role === 'master' && req.user.role !== 'master')
      return res.status(403).json({ error: 'Apenas o administrador mestre pode alterar a conta mestre' });

    const newRole = role || user.role;
    if (newRole === 'master' && req.user.role !== 'master')
      return res.status(403).json({ error: 'Apenas o administrador mestre pode definir a função mestre' });

    await query(
      'UPDATE users SET name=$1, email=$2, role=$3, professional_id=$4, active=$5 WHERE id=$6',
      [
        name  || user.name,
        email ? email.toLowerCase().trim() : user.email,
        newRole,
        professional_id !== undefined ? professional_id : user.professional_id,
        active !== undefined ? active : user.active,
        req.params.id,
      ]
    );
    res.json({ message: 'Usuário atualizado com sucesso' });
  } catch (e) {
    console.error('[users PUT]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/:id/reset-password', authenticateToken, requireMaster, async (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6)
      return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
    const target = await getOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });
    await query('UPDATE users SET password = $1 WHERE id = $2',
      [bcrypt.hashSync(new_password, 10), req.params.id]);
    res.json({ message: 'Senha redefinida com sucesso' });
  } catch (e) {
    console.error('[users reset-password]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/:id/toggle-status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id)
      return res.status(400).json({ error: 'Não é possível alterar o status do próprio usuário' });

    const user = await getOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (user.role === 'master' && req.user.role !== 'master')
      return res.status(403).json({ error: 'Apenas o administrador mestre pode alterar a conta mestre' });

    const newActive = !user.active;
    await query('UPDATE users SET active = $1 WHERE id = $2', [newActive, req.params.id]);
    if (user.professional_id)
      await query('UPDATE professionals SET active = $1 WHERE id = $2', [newActive, user.professional_id]);

    res.json({ message: newActive ? 'Usuário ativado com sucesso' : 'Usuário desativado com sucesso', active: newActive });
  } catch (e) {
    console.error('[users toggle-status]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id)
      return res.status(400).json({ error: 'Não é possível excluir seu próprio usuário' });

    const target = await getOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });
    if ((target.role === 'admin' || target.role === 'master') && req.user.role !== 'master')
      return res.status(403).json({ error: 'Apenas o administrador mestre pode excluir uma administradora' });

    // Exclui em cascata: transações → agendamentos → usuário → profissional
    if (target.professional_id) {
      await query(
        `DELETE FROM transactions WHERE appointment_id IN
           (SELECT id FROM appointments WHERE professional_id = $1)`,
        [target.professional_id]
      );
      await query('DELETE FROM appointments WHERE professional_id = $1', [target.professional_id]);
      await query('DELETE FROM blocked_times WHERE professional_id = $1', [target.professional_id]);
    }
    await query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (target.professional_id)
      await query('DELETE FROM professionals WHERE id = $1', [target.professional_id]);

    res.json({ message: 'Usuário excluído com sucesso' });
  } catch (e) {
    console.error('[users DELETE]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
