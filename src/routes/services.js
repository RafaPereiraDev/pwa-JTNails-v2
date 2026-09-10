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
    const s = await getOne('SELECT id, name, active FROM services WHERE id = $1', [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Serviço não encontrado' });

    // Regra geral: Soft delete obrigatório (nunca remove fisicamente da tabela)
    await query('UPDATE services SET active = FALSE WHERE id = $1', [req.params.id]);
    res.json({ message: 'Serviço desativado com sucesso', id: s.id, active: false });
  } catch (e) {
    console.error('[services DELETE]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.patch('/:id/activate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const s = await getOne('SELECT id, name, active FROM services WHERE id = $1', [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Serviço não encontrado' });

    await query('UPDATE services SET active = TRUE WHERE id = $1', [req.params.id]);
    res.json({ message: 'Serviço reativado com sucesso', id: s.id, active: true });
  } catch (e) {
    console.error('[services PATCH /:id/activate]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Rota pontual para purgar especificamente "Mão + Pé" e desvincular agendamentos
router.post('/purge-mao-pe', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await query('ALTER TABLE appointments ALTER COLUMN service_id DROP NOT NULL');

    const unlinked = await query(
      `UPDATE appointments SET service_id = NULL
       WHERE service_id IN (SELECT id FROM services WHERE name ILIKE '%Mão + Pé%' OR name ILIKE '%Mao + Pe%')`
    );

    const deleted = await query(
      `DELETE FROM services WHERE name ILIKE '%Mão + Pé%' OR name ILIKE '%Mao + Pe%'`
    );

    res.json({
      message: 'Serviço Mão + Pé removido definitivamente',
      unlinked_appointments: unlinked.rowCount || 0,
      deleted_services: deleted.rowCount || 0,
    });
  } catch (e) {
    console.error('[services POST /purge-mao-pe]', e.message);
    res.status(500).json({ error: 'Erro ao remover serviço Mão + Pé: ' + e.message });
  }
});

module.exports = router;
