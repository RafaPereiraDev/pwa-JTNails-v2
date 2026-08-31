const express = require('express');
const router  = express.Router();
const { prepare }                         = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.get('/summary', authenticateToken, (req, res) => {
  const { start_date, end_date, professional_id } = req.query;

  // Profissional só pode ver o próprio faturamento — ignora qualquer professional_id passado
  let prof = professional_id;
  if (req.user.role === 'professional') {
    prof = req.user.professional_id; // força o próprio ID, ignora query param
  }

  const s = start_date || '1900-01-01';
  const e = end_date   || '9999-12-31';

  let profWhere = '';
  const profArgs = [];
  if (prof) {
    profWhere = req.user.role === 'professional'
      ? ' AND professional_id = ?'
      : ' AND (professional_id = ? OR professional_id IS NULL)';
    profArgs.push(prof);
  }

  const income   = prepare(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type='income'  AND date>=? AND date<=?${profWhere}`).get(s, e, ...profArgs);
  const expenses = prepare(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type='expense' AND date>=? AND date<=?${profWhere}`).get(s, e, ...profArgs);
  const byCategory = prepare(`SELECT category, SUM(amount) as total FROM transactions WHERE type='expense' AND date>=? AND date<=?${profWhere} GROUP BY category`).all(s, e, ...profArgs);

  const byProfessional = prepare(`
    SELECT p.id, p.name, p.color,
      COALESCE(SUM(t.amount),0) as revenue,
      COUNT(t.id) as count
    FROM professionals p
    LEFT JOIN transactions t ON t.professional_id=p.id AND t.type='income' AND t.date>=? AND t.date<=?
    WHERE p.active=1 GROUP BY p.id ORDER BY revenue DESC
  `).all(s, e);

  res.json({
    total_income:    income.total,
    total_expenses:  expenses.total,
    result:          income.total - expenses.total,
    by_category:     byCategory,
    by_professional: byProfessional
  });
});

router.get('/', authenticateToken, (req, res) => {
  const { type, professional_id, start_date, end_date, category } = req.query;

  // Profissional só vê as próprias receitas (despesas são gerais — visíveis a todos)
  let prof = professional_id;
  if (req.user.role === 'professional') {
    prof = req.user.professional_id;
  }

  let sql = `
    SELECT t.*, p.name as professional_name, c.name as client_name, s.name as service_name
    FROM transactions t
    LEFT JOIN professionals p ON t.professional_id = p.id
    LEFT JOIN appointments  a ON t.appointment_id  = a.id
    LEFT JOIN clients       c ON a.client_id = c.id
    LEFT JOIN services      s ON a.service_id = s.id
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role === 'professional' && prof) {
    // Profissional: só vê as próprias receitas e as próprias despesas
    sql += ` AND (
      (t.type = 'income'  AND t.professional_id = ?) OR
      (t.type = 'expense' AND t.professional_id = ?)
    )`;
    params.push(prof, prof);
  } else if (prof) {
    sql += ' AND (t.professional_id=? OR t.professional_id IS NULL)';
    params.push(prof);
  }

  if (type)       { sql += ' AND t.type=?';       params.push(type); }
  if (start_date) { sql += ' AND t.date>=?';       params.push(start_date); }
  if (end_date)   { sql += ' AND t.date<=?';       params.push(end_date); }
  if (category)   { sql += ' AND t.category=?';   params.push(category); }
  sql += ' ORDER BY t.date DESC, t.created_at DESC';

  res.json(prepare(sql).all(...params));
});

router.post('/', authenticateToken, (req, res) => {
  const { type, description, category, amount, payment_method, date, notes } = req.body;
  if (!description || !amount || !date)
    return res.status(400).json({ error: 'Descrição, valor e data são obrigatórios' });
  if (isNaN(amount) || amount <= 0)
    return res.status(400).json({ error: 'Valor inválido' });

  // Profissional só pode criar despesas (não receitas manuais)
  const txType = req.user.role === 'professional' ? 'expense' : (type || 'expense');
  if (req.user.role === 'professional' && type && type !== 'expense')
    return res.status(403).json({ error: 'Profissionais só podem lançar despesas' });

  // Vincula ao professional_id da profissional logada
  const profId = req.user.role === 'professional' ? req.user.professional_id : (req.body.professional_id || null);

  const result = prepare(
    'INSERT INTO transactions (type,professional_id,description,category,amount,payment_method,date,notes) VALUES (?,?,?,?,?,?,?,?)'
  ).run(txType, profId, description.trim(), category || 'Outros', parseFloat(amount), payment_method || null, date, notes || null);

  res.status(201).json(prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', authenticateToken, (req, res) => {
  const tx = prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!tx) return res.status(404).json({ error: 'Transação não encontrada' });
  if (tx.appointment_id) return res.status(400).json({ error: 'Não é possível editar receitas geradas automaticamente' });

  // Profissional só pode editar as próprias despesas
  if (req.user.role === 'professional') {
    if (tx.type !== 'expense') return res.status(403).json({ error: 'Acesso negado' });
    if (tx.professional_id !== req.user.professional_id) return res.status(403).json({ error: 'Acesso negado' });
  }

  const { description, category, amount, payment_method, date, notes } = req.body;
  prepare('UPDATE transactions SET description=?,category=?,amount=?,payment_method=?,date=?,notes=? WHERE id=?').run(
    description    || tx.description,
    category       || tx.category,
    amount ? parseFloat(amount) : tx.amount,
    payment_method !== undefined ? payment_method : tx.payment_method,
    date           || tx.date,
    notes          !== undefined ? notes : tx.notes,
    req.params.id
  );
  res.json({ message: 'Transação atualizada com sucesso' });
});

router.delete('/:id', authenticateToken, (req, res) => {
  const tx = prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!tx) return res.status(404).json({ error: 'Transação não encontrada' });
  if (tx.appointment_id) return res.status(400).json({ error: 'Não é possível excluir receitas geradas por agendamentos' });

  // Profissional só pode excluir as próprias despesas
  if (req.user.role === 'professional') {
    if (tx.type !== 'expense') return res.status(403).json({ error: 'Acesso negado' });
    if (tx.professional_id !== req.user.professional_id) return res.status(403).json({ error: 'Acesso negado' });
  }

  prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  res.json({ message: 'Transação excluída com sucesso' });
});

module.exports = router;
