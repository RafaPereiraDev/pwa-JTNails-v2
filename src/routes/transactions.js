const express = require('express');
const router  = express.Router();
const { query, getOne, getAll } = require('../database/db');
const { authenticateToken }     = require('../middleware/auth');

// Master não tem acesso ao financeiro
router.use(authenticateToken, (req, res, next) => {
  if (req.user.role === 'master')
    return res.status(403).json({ error: 'O administrador mestre não tem acesso ao financeiro' });
  next();
});

router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date, professional_id } = req.query;
    const isMaster = req.user.role === 'master';
    const prof     = isMaster ? professional_id : req.user.professional_id;

    const s = start_date || '1900-01-01';
    const e = end_date   || '9999-12-31';

    let profWhere = '';
    const profArgs = [];
    if (prof) { profWhere = ' AND professional_id = $3'; profArgs.push(prof); }

    const income     = await getOne(
      `SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE type='income'  AND date>=$1 AND date<=$2${profWhere}`,
      [s, e, ...profArgs]
    );
    const expenses   = await getOne(
      `SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE type='expense' AND date>=$1 AND date<=$2${profWhere}`,
      [s, e, ...profArgs]
    );
    const byCategory = await getAll(
      `SELECT category, SUM(amount) AS total FROM transactions WHERE type='expense' AND date>=$1 AND date<=$2${profWhere} GROUP BY category`,
      [s, e, ...profArgs]
    );

    const byProfessional = isMaster ? await getAll(`
      SELECT p.id, p.name, p.color,
        COALESCE(SUM(t.amount),0) AS revenue, COUNT(t.id) AS count
      FROM professionals p
      LEFT JOIN transactions t
        ON t.professional_id = p.id AND t.type = 'income' AND t.date >= $1 AND t.date <= $2
      WHERE p.active = TRUE GROUP BY p.id ORDER BY revenue DESC
    `, [s, e]) : [];

    res.json({
      total_income:    parseFloat(income.total),
      total_expenses:  parseFloat(expenses.total),
      result:          parseFloat(income.total) - parseFloat(expenses.total),
      by_category:     byCategory,
      by_professional: byProfessional,
    });
  } catch (e) {
    console.error('[transactions/summary]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { type, professional_id, start_date, end_date, category } = req.query;
    const isMaster = req.user.role === 'master';
    const prof     = isMaster ? professional_id : req.user.professional_id;

    let sql = `
      SELECT t.*, p.name AS professional_name,
             c.name AS client_name, s.name AS service_name
      FROM transactions t
      LEFT JOIN professionals p ON t.professional_id = p.id
      LEFT JOIN appointments  a ON t.appointment_id  = a.id
      LEFT JOIN clients       c ON a.client_id       = c.id
      LEFT JOIN services      s ON a.service_id      = s.id
      WHERE 1=1
    `;
    const params = [];
    let i = 1;

    if (!isMaster && prof) {
      sql += ` AND ((t.type='income' AND t.professional_id=$${i}) OR (t.type='expense' AND t.professional_id=$${i}))`;
      params.push(prof); i++;
    } else if (isMaster && prof) {
      sql += ` AND (t.professional_id=$${i++} OR t.professional_id IS NULL)`;
      params.push(prof);
    }

    if (type)       { sql += ` AND t.type=$${i++}`;       params.push(type); }
    if (start_date) { sql += ` AND t.date>=$${i++}`;      params.push(start_date); }
    if (end_date)   { sql += ` AND t.date<=$${i++}`;      params.push(end_date); }
    if (category)   { sql += ` AND t.category=$${i++}`;   params.push(category); }
    sql += ' ORDER BY t.date DESC, t.created_at DESC';

    res.json(await getAll(sql, params));
  } catch (e) {
    console.error('[transactions GET /]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { type, description, category, amount, payment_method, date, notes } = req.body;
    if (!description || !amount || !date)
      return res.status(400).json({ error: 'Descrição, valor e data são obrigatórios' });
    if (isNaN(amount) || amount <= 0)
      return res.status(400).json({ error: 'Valor inválido' });

    const isMaster = req.user.role === 'master';
    const txType   = isMaster ? (type || 'expense') : 'expense';
    if (!isMaster && type && type !== 'expense')
      return res.status(403).json({ error: 'Você só pode lançar despesas' });

    const profId = isMaster ? (req.body.professional_id || null) : req.user.professional_id;

    const result = await getOne(
      `INSERT INTO transactions
         (type,professional_id,description,category,amount,payment_method,date,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [txType, profId, description.trim(), category || 'Outros',
       parseFloat(amount), payment_method || null, date, notes || null]
    );
    res.status(201).json(await getOne('SELECT * FROM transactions WHERE id = $1', [result.id]));
  } catch (e) {
    console.error('[transactions POST]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const tx = await getOne('SELECT * FROM transactions WHERE id = $1', [req.params.id]);
    if (!tx) return res.status(404).json({ error: 'Transação não encontrada' });
    if (tx.appointment_id)
      return res.status(400).json({ error: 'Não é possível editar receitas geradas automaticamente' });

    if (req.user.role !== 'master') {
      if (tx.type !== 'expense')
        return res.status(403).json({ error: 'Você só pode editar as suas próprias despesas' });
      if (tx.professional_id !== req.user.professional_id)
        return res.status(403).json({ error: 'Você só pode editar as suas próprias despesas' });
    }

    const { description, category, amount, payment_method, date, notes } = req.body;
    await query(
      'UPDATE transactions SET description=$1,category=$2,amount=$3,payment_method=$4,date=$5,notes=$6 WHERE id=$7',
      [
        description    || tx.description,
        category       || tx.category,
        amount ? parseFloat(amount) : tx.amount,
        payment_method !== undefined ? payment_method : tx.payment_method,
        date           || tx.date,
        notes          !== undefined ? notes : tx.notes,
        req.params.id,
      ]
    );
    res.json({ message: 'Transação atualizada com sucesso' });
  } catch (e) {
    console.error('[transactions PUT]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const tx = await getOne('SELECT * FROM transactions WHERE id = $1', [req.params.id]);
    if (!tx) return res.status(404).json({ error: 'Transação não encontrada' });
    if (tx.appointment_id)
      return res.status(400).json({ error: 'Não é possível excluir receitas geradas por agendamentos' });

    if (req.user.role !== 'master') {
      if (tx.type !== 'expense')
        return res.status(403).json({ error: 'Você só pode excluir as suas próprias despesas' });
      if (tx.professional_id !== req.user.professional_id)
        return res.status(403).json({ error: 'Você só pode excluir as suas próprias despesas' });
    }

    await query('DELETE FROM transactions WHERE id = $1', [req.params.id]);
    res.json({ message: 'Transação excluída com sucesso' });
  } catch (e) {
    console.error('[transactions DELETE]', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
