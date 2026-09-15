const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { query, getOne, getAll, withTransaction } = require('../database/db');
const { authenticateToken, requireAdmin }        = require('../middleware/auth');

const PROF_SELECT = 'SELECT id, name, phone, email, active, color, photo, bio, work_start_time::text AS work_start_time, work_end_time::text AS work_end_time, created_at FROM professionals';

router.get('/', authenticateToken, async (req, res) => {
  try {
    res.json(await getAll(`${PROF_SELECT} ORDER BY name`));
  } catch (e) {
    console.error('[professionals GET /]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/active', authenticateToken, async (req, res) => {
  try {
    res.json(await getAll(`${PROF_SELECT} WHERE active = TRUE ORDER BY name`));
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
    const prof = await getOne(`${PROF_SELECT} WHERE id = $1`, [profId]);
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

    let { photo, bio, work_start_time, work_end_time } = req.body;
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
    if (work_start_time && !/^\d{2}:\d{2}/.test(String(work_start_time))) {
      return res.status(400).json({ error: 'Horário de início inválido' });
    }
    if (work_end_time && !/^\d{2}:\d{2}/.test(String(work_end_time))) {
      return res.status(400).json({ error: 'Horário de término inválido' });
    }

    const newPhoto = photo !== undefined ? (photo || null) : prof.photo;
    const newBio   = bio   !== undefined ? (bio   || null) : prof.bio;
    const newStart = work_start_time !== undefined ? (work_start_time || '08:00') : prof.work_start_time;
    const newEnd   = work_end_time   !== undefined ? (work_end_time   || '19:30') : prof.work_end_time;

    await query('UPDATE professionals SET photo=$1, bio=$2, work_start_time=$3, work_end_time=$4 WHERE id=$5', [newPhoto, newBio, newStart, newEnd, profId]);
    res.json({ message: 'Perfil atualizado com sucesso', photo: newPhoto, work_start_time: newStart, work_end_time: newEnd });
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
    const prof = await getOne(`${PROF_SELECT} WHERE id = $1`, [req.params.id]);
    if (!prof) return res.status(404).json({ error: 'Profissional não encontrada' });
    res.json(prof);
  } catch (e) {
    console.error('[professionals GET /:id]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    let { name, phone, email, color, password, role, work_start_time, work_end_time } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });

    name  = String(name).trim();
    email = String(email).toLowerCase().trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'E-mail inválido' });
    if (String(password).length < 6)
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });

    if (work_start_time && !/^\d{2}:\d{2}/.test(String(work_start_time))) {
      return res.status(400).json({ error: 'Horário de início inválido' });
    }
    if (work_end_time && !/^\d{2}:\d{2}/.test(String(work_end_time))) {
      return res.status(400).json({ error: 'Horário de término inválido' });
    }

    role = (role === 'admin') ? 'admin' : 'professional';

    const existing = await getOne('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) return res.status(400).json({ error: 'Este e-mail já está cadastrado' });

    const startVal = work_start_time && /^\d{2}:\d{2}/.test(String(work_start_time)) ? String(work_start_time).slice(0, 5) : '08:00';
    const endVal   = work_end_time   && /^\d{2}:\d{2}/.test(String(work_end_time))   ? String(work_end_time).slice(0, 5)   : '19:30';

    const profId = await withTransaction(async (client) => {
      const profResult = await client.query(
        'INSERT INTO professionals (name, phone, email, color, work_start_time, work_end_time) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [name, phone || null, email, color || '#e91e8c', startVal, endVal]
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
    const { name, phone, email, color, active, work_start_time, work_end_time } = req.body;
    const prof = await getOne('SELECT * FROM professionals WHERE id = $1', [req.params.id]);
    if (!prof) return res.status(404).json({ error: 'Profissional não encontrada' });

    // Valida email se foi fornecido (mesmo bug do POST já corrigido)
    if (email !== undefined && email !== null && email !== '') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ error: 'E-mail inválido' });
    }

    if (work_start_time && !/^\d{2}:\d{2}/.test(String(work_start_time))) {
      return res.status(400).json({ error: 'Horário de início inválido' });
    }
    if (work_end_time && !/^\d{2}:\d{2}/.test(String(work_end_time))) {
      return res.status(400).json({ error: 'Horário de término inválido' });
    }

    const newName   = name   || prof.name;
    const newEmail  = email  !== undefined ? email  : prof.email;
    const newActive = active !== undefined ? active : prof.active;
    const newStart  = work_start_time !== undefined ? (work_start_time || '08:00') : prof.work_start_time;
    const newEnd    = work_end_time   !== undefined ? (work_end_time   || '19:30') : prof.work_end_time;

    await query(
      'UPDATE professionals SET name=$1, phone=$2, email=$3, color=$4, active=$5, work_start_time=$6, work_end_time=$7 WHERE id=$8',
      [newName, phone !== undefined ? phone : prof.phone,
       newEmail, color || prof.color, newActive, newStart, newEnd, req.params.id]
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
