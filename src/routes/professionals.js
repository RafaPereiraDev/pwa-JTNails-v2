const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { query, getOne, getAll, withTransaction } = require('../database/db');
const { authenticateToken, requireAdmin }        = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
  try {
    res.json(await getAll('SELECT * FROM professionals ORDER BY name'));
  } catch (e) {
    console.error('[professionals GET /]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/active', authenticateToken, async (req, res) => {
  try {
    res.json(await getAll('SELECT * FROM professionals WHERE active = TRUE ORDER BY name'));
  } catch (e) {
    console.error('[professionals GET /active]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/me/profile', authenticateToken, async (req, res) => {
  try {
    const profId = req.user.professional_id;
    if (!profId)
      return res.status(403).json({ error: 'Seu usuário não está vinculado a uma profissional' });
    const prof = await getOne('SELECT * FROM professionals WHERE id = $1', [profId]);
    if (!prof) return res.status(404).json({ error: 'Profissional não encontrada' });
    res.json(prof);
  } catch (e) {
    console.error('[professionals GET /me/profile]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/me/profile', authenticateToken, async (req, res) => {
  try {
    const profId = req.user.professional_id;
    if (!profId)
      return res.status(403).json({ error: 'Seu usuário não está vinculado a uma profissional' });

    const prof = await getOne('SELECT * FROM professionals WHERE id = $1', [profId]);
    if (!prof) return res.status(404).json({ error: 'Profissional não encontrada' });

    let { photo, bio } = req.body;
    if (bio !== undefined && bio !== null) {
      bio = String(bio);
      if (bio.length > 500)
        return res.status(400).json({ error: 'A biografia deve ter no máximo 500 caracteres' });
    }
    if (photo !== undefined && photo !== null && photo !== '') {
      if (!/^data:image\/(png|jpe?g|webp);base64,/.test(photo))
        return res.status(400).json({ error: 'Formato de imagem inválido' });
      if (photo.length > 1500000)
        return res.status(400).json({ error: 'A imagem é muito grande. Escolha uma foto menor.' });
    }

    const newPhoto = photo !== undefined ? (photo || null) : prof.photo;
    const newBio   = bio   !== undefined ? (bio   || null) : prof.bio;
    await query('UPDATE professionals SET photo=$1, bio=$2 WHERE id=$3', [newPhoto, newBio, profId]);
    res.json({ message: 'Perfil atualizado com sucesso', photo: newPhoto });
  } catch (e) {
    console.error('[professionals PUT /me/profile]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/:id/stats', authenticateToken, async (req, res) => {
  try {
    const { month, year } = req.query;
    // Usa fuso de Brasília para não retornar stats do mês errado em virada de mês no servidor UTC
    const tzRow = await getOne(`SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::date::text AS today`);
    const [yDefault, mDefault] = tzRow.today.split('-');
    const m = String(month || parseInt(mDefault)).padStart(2, '0');
    const y = year || yDefault;

    const stats = await getOne(`
      SELECT COUNT(CASE WHEN status='completed' THEN 1 END) AS total_appointments,
             COALESCE(SUM(CASE WHEN status='completed' THEN price ELSE 0 END),0) AS total_revenue,
             AVG(CASE WHEN status='completed' THEN price ELSE NULL END) AS avg_ticket
      FROM appointments
      WHERE professional_id = $1
        AND TO_CHAR(date,'YYYY-MM') = $2
    `, [req.params.id, `${y}-${m}`]);

    const ehDona = req.user.professional_id &&
                   String(req.user.professional_id) === String(req.params.id);
    if (!ehDona)
      return res.json({ total_appointments: stats.total_appointments, total_revenue: null, avg_ticket: null });

    res.json(stats);
  } catch (e) {
    console.error('[professionals GET /:id/stats]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const prof = await getOne('SELECT * FROM professionals WHERE id = $1', [req.params.id]);
    if (!prof) return res.status(404).json({ error: 'Profissional não encontrada' });
    res.json(prof);
  } catch (e) {
    console.error('[professionals GET /:id]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    let { name, phone, email, color, password, role } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });

    name  = String(name).trim();
    email = String(email).toLowerCase().trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'E-mail inválido' });
    if (String(password).length < 6)
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });

    role = (role === 'admin') ? 'admin' : 'professional';

    const existing = await getOne('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) return res.status(400).json({ error: 'Este e-mail já está cadastrado' });

    const profId = await withTransaction(async (client) => {
      const profResult = await client.query(
        'INSERT INTO professionals (name, phone, email, color) VALUES ($1,$2,$3,$4) RETURNING id',
        [name, phone || null, email, color || '#e91e8c']
      );
      const id = profResult.rows[0].id;
      const hash = await require('bcryptjs').hash(String(password), 10);
      await client.query(
        'INSERT INTO users (name, email, password, role, professional_id) VALUES ($1,$2,$3,$4,$5)',
        [name, email, hash, role, id]
      );
      return id;
    });

    res.status(201).json({ id: profId, message: 'Profissional criada com sucesso' });
  } catch (e) {
    console.error('[professionals POST]', e.message);
    res.status(500).json({ error: 'Não foi possível criar a profissional. Tente novamente.' });
  }
});

router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, phone, email, color, active } = req.body;
    const prof = await getOne('SELECT * FROM professionals WHERE id = $1', [req.params.id]);
    if (!prof) return res.status(404).json({ error: 'Profissional não encontrada' });

    // Valida email se foi fornecido (mesmo bug do POST já corrigido)
    if (email !== undefined && email !== null && email !== '') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ error: 'E-mail inválido' });
    }

    const newName   = name   || prof.name;
    const newEmail  = email  !== undefined ? email  : prof.email;
    const newActive = active !== undefined ? active : prof.active;

    await query(
      'UPDATE professionals SET name=$1, phone=$2, email=$3, color=$4, active=$5 WHERE id=$6',
      [newName, phone !== undefined ? phone : prof.phone,
       newEmail, color || prof.color, newActive, req.params.id]
    );

    const linkedUser = await getOne('SELECT id FROM users WHERE professional_id = $1', [req.params.id]);
    if (linkedUser) {
      await query('UPDATE users SET name=$1, email=$2, active=$3 WHERE id=$4', [
        newName,
        newEmail ? String(newEmail).toLowerCase().trim() : null,
        newActive,
        linkedUser.id,
      ]);
    }
    res.json({ message: 'Profissional atualizada com sucesso' });
  } catch (e) {
    console.error('[professionals PUT /:id]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const linkedUser = await getOne('SELECT id, role FROM users WHERE professional_id = $1', [req.params.id]);

    if (linkedUser && (linkedUser.role === 'admin' || linkedUser.role === 'master') &&
        req.user.role !== 'master')
      return res.status(403).json({ error: 'Apenas o administrador mestre pode excluir uma administradora' });

    const { c } = await getOne(
      'SELECT COUNT(*) as c FROM appointments WHERE professional_id = $1', [req.params.id]
    );

    if (parseInt(c) > 0 && req.user.role !== 'master') {
      // Admin não-master: apenas desativa se tem agendamentos
      await query('UPDATE professionals SET active = FALSE WHERE id = $1', [req.params.id]);
      if (linkedUser)
        await query('UPDATE users SET active = FALSE WHERE id = $1', [linkedUser.id]);
      return res.json({ message: 'Profissional desativada (possui agendamentos vinculados)' });
    }

    // Master ou sem agendamentos: exclui em cascata
    await query(
      `DELETE FROM transactions WHERE appointment_id IN
         (SELECT id FROM appointments WHERE professional_id = $1)`,
      [req.params.id]
    );
    await query('DELETE FROM appointments WHERE professional_id = $1', [req.params.id]);
    await query('DELETE FROM blocked_times WHERE professional_id = $1', [req.params.id]);
    if (linkedUser)
      await query('UPDATE users SET active = FALSE, professional_id = NULL WHERE id = $1', [linkedUser.id]);
    await query('DELETE FROM professionals WHERE id = $1', [req.params.id]);
    res.json({ message: 'Profissional excluída com sucesso' });
  } catch (e) {
    console.error('[professionals DELETE /:id]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
