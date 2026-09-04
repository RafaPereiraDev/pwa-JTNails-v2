const express = require('express');
const router  = express.Router();
const { query, getOne, getAll }           = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
  try {
    const sql = req.query.active_only === 'true'
      ? 'SELECT * FROM services WHERE active = TRUE ORDER BY name'
      : 'SELECT * FROM services ORDER BY name';
    res.json(await getAll(sql));
  } catch (e) {
    console.error('[services GET /]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const s = await getOne('SELECT * FROM services WHERE id = $1', [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Serviço não encontrado' });
    res.json(s);
  } catch (e) {
    console.error('[services GET /:id]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, price, duration } = req.body;
    if (!name || price === undefined)
      return res.status(400).json({ error: 'Nome e preço são obrigatórios' });
    if (isNaN(price) || price < 0)
      return res.status(400).json({ error: 'Preço inválido' });

    const result = await getOne(
      'INSERT INTO services (name, description, price, duration) VALUES ($1,$2,$3,$4) RETURNING id',
      [name.trim(), description || null, parseFloat(price), parseInt(duration) || 60]
    );
    res.status(201).json(await getOne('SELECT * FROM services WHERE id = $1', [result.id]));
  } catch (e) {
    console.error('[services POST]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, price, duration, active } = req.body;
    const s = await getOne('SELECT * FROM services WHERE id = $1', [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Serviço não encontrado' });
    if (price !== undefined && (isNaN(price) || price < 0))
      return res.status(400).json({ error: 'Preço inválido' });

    await query(
      'UPDATE services SET name=$1, description=$2, price=$3, duration=$4, active=$5 WHERE id=$6',
      [
        name        || s.name,
        description !== undefined ? description : s.description,
        price       !== undefined ? parseFloat(price) : s.price,
        duration    !== undefined ? parseInt(duration) : s.duration,
        active      !== undefined ? active : s.active,
        req.params.id,
      ]
    );
    res.json({ message: 'Serviço atualizado com sucesso' });
  } catch (e) {
    console.error('[services PUT]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { c } = await getOne(
      'SELECT COUNT(*) as c FROM appointments WHERE service_id = $1',
      [req.params.id]
    );
    if (parseInt(c) > 0) {
      await query('UPDATE services SET active = FALSE WHERE id = $1', [req.params.id]);
      return res.json({ message: 'Serviço desativado (possui agendamentos vinculados)' });
    }
    await query('DELETE FROM services WHERE id = $1', [req.params.id]);
    res.json({ message: 'Serviço excluído com sucesso' });
  } catch (e) {
    console.error('[services DELETE]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
