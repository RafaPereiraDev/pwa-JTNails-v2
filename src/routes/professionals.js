const express = require('express');
const router  = express.Router();
const { prepare }                         = require('../database/db');
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

  res.json(stats);
});

router.get('/:id', authenticateToken, (req, res) => {
  const prof = prepare('SELECT * FROM professionals WHERE id = ?').get(req.params.id);
  if (!prof) return res.status(404).json({ error: 'Profissional não encontrada' });
  res.json(prof);
});

router.post('/', authenticateToken, requireAdmin, (req, res) => {
  const { name, phone, email, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

  const result = prepare(
    'INSERT INTO professionals (name, phone, email, color) VALUES (?,?,?,?)'
  ).run(name.trim(), phone || null, email || null, color || '#e91e8c');

  res.status(201).json({ id: result.lastInsertRowid, message: 'Profissional criada com sucesso' });
});

router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
  const { name, phone, email, color, active } = req.body;
  const prof = prepare('SELECT * FROM professionals WHERE id = ?').get(req.params.id);
  if (!prof) return res.status(404).json({ error: 'Profissional não encontrada' });

  prepare('UPDATE professionals SET name=?,phone=?,email=?,color=?,active=? WHERE id=?').run(
    name  || prof.name,
    phone  !== undefined ? phone  : prof.phone,
    email  !== undefined ? email  : prof.email,
    color  || prof.color,
    active !== undefined ? active : prof.active,
    req.params.id
  );
  res.json({ message: 'Profissional atualizada com sucesso' });
});

router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  const cnt = prepare('SELECT COUNT(*) as c FROM appointments WHERE professional_id = ?').get(req.params.id);
  if (cnt.c > 0) {
    prepare('UPDATE professionals SET active = 0 WHERE id = ?').run(req.params.id);
    return res.json({ message: 'Profissional desativada (possui agendamentos vinculados)' });
  }
  prepare('DELETE FROM professionals WHERE id = ?').run(req.params.id);
  res.json({ message: 'Profissional excluída com sucesso' });
});

module.exports = router;
