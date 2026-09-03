const express = require('express');
const router  = express.Router();
const { prepare }                         = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// O administrador mestre não tem acesso ao financeiro (não vê faturamento de ninguém).
// Aplica-se a todas as rotas de transações.
router.use(authenticateToken, (req, res, next) => {
  if (req.user.role === 'master')
    return res.status(403).json({ error: 'O administrador mestre não tem acesso ao financeiro' });
  next();
});

router.get('/summary', authenticateToken, (req, res) => {
  const { start_date, end_date, professional_id } = req.query;

  // Apenas o master vê o faturamento geral. Admin e profissional veem só o próprio.
  const isMaster = req.user.role === 'master';
  let prof = professional_id;
  if (!isMaster) {
    prof = req.user.professional_id; // força o próprio ID, ignora query param
  }

  const s = start_date || '1900-01-01';
  const e = end_date   || '9999-12-31';

  let profWhere = '';
  const profArgs = [];
  if (prof) {
    // Não-master (admin/profissional): estritamente o próprio professional_id
    profWhere = ' AND professional_id = ?';
    profArgs.push(prof);
  }

  const income   = prepare(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type='income'  AND date>=? AND date<=?${profWhere}`).get(s, e, ...profArgs);
  const expenses = prepare(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type='expense' AND date>=? AND date<=?${profWhere}`).get(s, e, ...profArgs);
  const byCategory = prepare(`SELECT category, SUM(amount) as total FROM transactions WHERE type='expense' AND date>=? AND date<=?${profWhere} GROUP BY category`).all(s, e, ...profArgs);

  // Faturamento por profissional é visão geral — só o master enxerga
  const byProfessional = isMaster ? prepare(`
    SELECT p.id, p.name, p.color,
      COALESCE(SUM(t.amount),0) as revenue,
      COUNT(t.id) as count
    FROM professionals p
    LEFT JOIN transactions t ON t.professional_id=p.id AND t.type='income' AND t.date>=? AND t.date<=?
    WHERE p.active=1 GROUP BY p.id ORDER BY revenue DESC
  `).all(s, e) : [];

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

  // Apenas o master vê tudo. Admin e profissional veem só as próprias transações.
  const isMaster = req.user.role === 'master';
  let prof = professional_id;
  if (!isMaster) {
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

  if (!isMaster && prof) {
    // Admin/Profissional: só veem as próprias receitas e despesas
    sql += ` AND (
      (t.type = 'income'  AND t.professional_id = ?) OR
      (t.type = 'expense' AND t.professional_id = ?)
    )`;
    params.push(prof, prof);
  } else if (isMaster && prof) {
    // Master pode filtrar por um profissional específico se quiser
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

  const isMaster = req.user.role === 'master';

  // Só o master pode lançar receitas manuais. Admin/profissional só lançam despesas.
  const txType = isMaster ? (type || 'expense') : 'expense';
  if (!isMaster && type && type !== 'expense')
    return res.status(403).json({ error: 'Você só pode lançar despesas' });

  // Não-master vincula a despesa ao próprio professional_id. Master pode escolher (ou geral).
  const profId = isMaster ? (req.body.professional_id || null) : req.user.professional_id;

  const result = prepare(
    'INSERT INTO transactions (type,professional_id,description,category,amount,payment_method,date,notes) VALUES (?,?,?,?,?,?,?,?)'
  ).run(txType, profId, description.trim(), category || 'Outros', parseFloat(amount), payment_method || null, date, notes || null);

  res.status(201).json(prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', authenticateToken, (req, res) => {
  const tx = prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!tx) return res.status(404).json({ error: 'Transação não encontrada' });
  if (tx.appointment_id) return res.status(400).json({ error: 'Não é possível editar receitas geradas automaticamente' });

  // Não-master (admin/profissional) só pode editar as próprias despesas
  if (req.user.role !== 'master') {
    if (tx.type !== 'expense') return res.status(403).json({ error: 'Você só pode editar as suas próprias despesas' });
    if (tx.professional_id !== req.user.professional_id) return res.status(403).json({ error: 'Você só pode editar as suas próprias despesas' });
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

  // Não-master (admin/profissional) só pode excluir as próprias despesas
  if (req.user.role !== 'master') {
    if (tx.type !== 'expense') return res.status(403).json({ error: 'Você só pode excluir as suas próprias despesas' });
    if (tx.professional_id !== req.user.professional_id) return res.status(403).json({ error: 'Você só pode excluir as suas próprias despesas' });
  }

  prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  res.json({ message: 'Transação excluída com sucesso' });
});

module.exports = router;
