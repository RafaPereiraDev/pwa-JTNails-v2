const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { prepare, exec }                   = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.get('/', authenticateToken, (req, res) => {
  res.json(prepare('SELECT * FROM professionals ORDER BY name').all());
});

router.get('/active', authenticateToken, (req, res) => {
  res.json(prepare('SELECT * FROM professionals WHERE active = 1 ORDER BY name').all());
});

// Dados da própria profissional (para a aba Meu Perfil)
router.get('/me/profile', authenticateToken, (req, res) => {
  const profId = req.user.professional_id;
  if (!profId)
    return res.status(403).json({ error: 'Seu usuário não está vinculado a uma profissional' });
  const prof = prepare('SELECT * FROM professionals WHERE id = ?').get(profId);
  if (!prof) return res.status(404).json({ error: 'Profissional não encontrada' });
  res.json(prof);
});

// Perfil próprio: a profissional (ou admin com professional_id) edita a própria foto e bio.
// Precisa vir ANTES de '/:id' para o Express não interpretar "me" como um id.
router.put('/me/profile', authenticateToken, (req, res) => {
  const profId = req.user.professional_id;
  if (!profId)
    return res.status(403).json({ error: 'Seu usuário não está vinculado a uma profissional' });

  const prof = prepare('SELECT * FROM professionals WHERE id = ?').get(profId);
  if (!prof) return res.status(404).json({ error: 'Profissional não encontrada' });

  let { photo, bio } = req.body;

  // Validação da bio (máx. 500 caracteres)
  if (bio !== undefined && bio !== null) {
    bio = String(bio);
    if (bio.length > 500)
      return res.status(400).json({ error: 'A biografia deve ter no máximo 500 caracteres' });
  }

  // Validação da foto: deve ser um data URL de imagem e caber no limite (~1.5MB em base64)
  if (photo !== undefined && photo !== null && photo !== '') {
    if (!/^data:image\/(png|jpe?g|webp);base64,/.test(photo))
      return res.status(400).json({ error: 'Formato de imagem inválido' });
    if (photo.length > 1500000)
      return res.status(400).json({ error: 'A imagem é muito grande. Escolha uma foto menor.' });
  }

  prepare('UPDATE professionals SET photo = ?, bio = ? WHERE id = ?').run(
    photo !== undefined ? (photo || null) : prof.photo,
    bio   !== undefined ? (bio || null)   : prof.bio,
    profId
  );

  res.json({ message: 'Perfil atualizado com sucesso', photo: photo !== undefined ? (photo || null) : prof.photo });
});

router.get('/:id/stats', authenticateToken, (req, res) => {
  const { month, year } = req.query;
  const d = new Date();
  const m = String(month || d.getMonth() + 1).padStart(2, '0');
  const y = year || d.getFullYear();

  const stats = prepare(`
    SELECT COUNT(*) as total_appointments,
           COALESCE(SUM(CASE WHEN status='completed' THEN price ELSE 0 END),0) as total_revenue,
           AVG(CASE WHEN status='completed' THEN price ELSE NULL END) as avg_ticket
    FROM appointments WHERE professional_id = ? AND date LIKE ?
  `).get(req.params.id, `${y}-${m}%`);

  // Faturamento é privado: cada uma só vê o próprio. Uma admin não vê o de outra,
  // e o master não vê o de ninguém. Para os demais, retorna só a contagem de atendimentos.
  const ehDona = req.user.professional_id && String(req.user.professional_id) === String(req.params.id);
  if (!ehDona) {
    return res.json({ total_appointments: stats.total_appointments, total_revenue: null, avg_ticket: null });
  }

  res.json(stats);
});

router.get('/:id', authenticateToken, (req, res) => {
  const prof = prepare('SELECT * FROM professionals WHERE id = ?').get(req.params.id);
  if (!prof) return res.status(404).json({ error: 'Profissional não encontrada' });
  res.json(prof);
});

// Cria a profissional E o login dela (usuário vinculado) de uma vez.
router.post('/', authenticateToken, requireAdmin, (req, res) => {
  let { name, phone, email, color, password, role } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });

  name  = String(name).trim();
  email = String(email).toLowerCase().trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'E-mail inválido' });
  if (String(password).length < 6)
    return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });

  // Papel: só 'professional' ou 'admin'. Ninguém cria 'master' por aqui.
  role = (role === 'admin') ? 'admin' : 'professional';

  // E-mail não pode já existir como login
  const existing = prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'Este e-mail já está cadastrado' });

  try {
    exec('BEGIN');

    const profResult = prepare(
      'INSERT INTO professionals (name, phone, email, color) VALUES (?,?,?,?)'
    ).run(name, phone || null, email, color || '#e91e8c');
    const profId = profResult.lastInsertRowid;

    prepare(
      'INSERT INTO users (name, email, password, role, professional_id) VALUES (?,?,?,?,?)'
    ).run(name, email, bcrypt.hashSync(String(password), 10), role, profId);

    exec('COMMIT');
    res.status(201).json({ id: profId, message: 'Profissional criada com sucesso' });
  } catch (e) {
    try { exec('ROLLBACK'); } catch(_) {}
    console.error('[ERRO] criar profissional:', e.message);
    res.status(500).json({ error: 'Não foi possível criar a profissional. Tente novamente.' });
  }
});

router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
  const { name, phone, email, color, active } = req.body;
  const prof = prepare('SELECT * FROM professionals WHERE id = ?').get(req.params.id);
  if (!prof) return res.status(404).json({ error: 'Profissional não encontrada' });

  const newName   = name  || prof.name;
  const newEmail  = email !== undefined ? email : prof.email;
  const newActive = active !== undefined ? active : prof.active;

  prepare('UPDATE professionals SET name=?,phone=?,email=?,color=?,active=? WHERE id=?').run(
    newName,
    phone  !== undefined ? phone  : prof.phone,
    newEmail,
    color  || prof.color,
    newActive,
    req.params.id
  );

  // Mantém o login vinculado em sincronia (nome, email e status ativo)
  const linkedUser = prepare('SELECT id FROM users WHERE professional_id = ?').get(req.params.id);
  if (linkedUser) {
    prepare('UPDATE users SET name=?, email=?, active=? WHERE id=?').run(
      newName,
      newEmail ? String(newEmail).toLowerCase().trim() : null,
      newActive,
      linkedUser.id
    );
  }

  res.json({ message: 'Profissional atualizada com sucesso' });
});

router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  const linkedUser = prepare('SELECT id, role FROM users WHERE professional_id = ?').get(req.params.id);

  // Uma admin não pode excluir outra admin (ou master). Só o master pode.
  if (linkedUser && (linkedUser.role === 'admin' || linkedUser.role === 'master') && req.user.role !== 'master') {
    return res.status(403).json({ error: 'Apenas o administrador mestre pode excluir uma administradora' });
  }

  const cnt = prepare('SELECT COUNT(*) as c FROM appointments WHERE professional_id = ?').get(req.params.id);

  if (cnt.c > 0) {
    // Tem histórico: desativa (soft-delete) a profissional e o login dela
    prepare('UPDATE professionals SET active = 0 WHERE id = ?').run(req.params.id);
    if (linkedUser) prepare('UPDATE users SET active = 0 WHERE id = ?').run(linkedUser.id);
    return res.json({ message: 'Profissional desativada (possui agendamentos vinculados)' });
  }

  // Sem histórico: remove a profissional e desativa o login (não apaga o usuário para preservar integridade)
  if (linkedUser) prepare('UPDATE users SET active = 0, professional_id = NULL WHERE id = ?').run(linkedUser.id);
  prepare('DELETE FROM professionals WHERE id = ?').run(req.params.id);
  res.json({ message: 'Profissional excluída com sucesso' });
});

module.exports = router;
