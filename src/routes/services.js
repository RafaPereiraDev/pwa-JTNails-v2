const express = require('express');
const router  = express.Router();
const { prepare }                         = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.get('/', authenticateToken, (req, res) => {
  const sql = req.query.active_only === 'true'
    ? 'SELECT * FROM services WHERE active = 1 ORDER BY name'
    : 'SELECT * FROM services ORDER BY name';
  res.json(prepare(sql).all());
});

router.get('/:id', authenticateToken, (req, res) => {
  const s = prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Serviço não encontrado' });
  res.json(s);
});

router.post('/', authenticateToken, requireAdmin, (req, res) => {
  const { name, description, price, duration } = req.body;
  if (!name || price === undefined) return res.status(400).json({ error: 'Nome e preço são obrigatórios' });
  if (isNaN(price) || price < 0)    return res.status(400).json({ error: 'Preço inválido' });

  const result = prepare('INSERT INTO services (name, description, price, duration) VALUES (?,?,?,?)').run(
    name.trim(), description || null, parseFloat(price), parseInt(duration) || 60
  );
  res.status(201).json(prepare('SELECT * FROM services WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
  const { name, description, price, duration, active } = req.body;
  const s = prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Serviço não encontrado' });
  if (price !== undefined && (isNaN(price) || price < 0))
    return res.status(400).json({ error: 'Preço inválido' });

  prepare('UPDATE services SET name=?,description=?,price=?,duration=?,active=? WHERE id=?').run(
    name        || s.name,
    description !== undefined ? description : s.description,
    price       !== undefined ? parseFloat(price) : s.price,
    duration    !== undefined ? parseInt(duration) : s.duration,
    active      !== undefined ? active : s.active,
    req.params.id
  );
  res.json({ message: 'Serviço atualizado com sucesso' });
});

router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  const cnt = prepare('SELECT COUNT(*) as c FROM appointments WHERE service_id = ?').get(req.params.id);
  if (cnt.c > 0) {
    prepare('UPDATE services SET active = 0 WHERE id = ?').run(req.params.id);
    return res.json({ message: 'Serviço desativado (possui agendamentos vinculados)' });
  }
  prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
  res.json({ message: 'Serviço excluído com sucesso' });
});

module.exports = router;
