const express = require('express');
const router  = express.Router();
const { getOne, getAll } = require('../database/db');
const { authenticateToken, requireMaster } = require('../middleware/auth');

// Limite do plano do banco (Railway free/hobby costuma ser ~512 MB).
// Configurável via env DB_PLAN_LIMIT_MB.
const PLAN_LIMIT_MB = parseInt(process.env.DB_PLAN_LIMIT_MB || '512', 10);

// GET /api/dev/db-metrics — métricas do banco de dados (somente master/dev)
router.get('/db-metrics', authenticateToken, requireMaster, async (req, res) => {
  try {
    const pingStart = process.hrtime.bigint();
    // Query trivial só para medir latência de ida e volta ao banco
    await getOne('SELECT 1 AS ok');
    const pingMs = Number(process.hrtime.bigint() - pingStart) / 1e6;

    // Tamanho total do banco
    const sizeRow = await getOne(
      `SELECT pg_database_size(current_database()) AS bytes,
              current_database() AS name`
    );
    const totalBytes = Number(sizeRow.bytes) || 0;
    const totalMB    = totalBytes / (1024 * 1024);

    // Contagem de tabelas do schema público
    const tblCountRow = await getOne(
      `SELECT COUNT(*)::int AS count
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const tableCount = tblCountRow.count || 0;

    // Tamanho + estimativa de linhas por tabela (ordenado do maior p/ menor).
    // Usa pg_total_relation_size (tabela + índices + toast) e a contagem viva
    // de linhas do pg_stat_user_tables (n_live_tup).
    const tables = await getAll(
      `SELECT
         c.relname AS name,
         pg_total_relation_size(c.oid) AS bytes,
         COALESCE(s.n_live_tup, 0) AS rows
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY pg_total_relation_size(c.oid) DESC`
    );

    // Total de registros somando as linhas vivas de todas as tabelas
    const totalRecords = tables.reduce((sum, t) => sum + Number(t.rows || 0), 0);

    // Agendamentos do mês vigente (fuso de Brasília)
    let monthAppointments = 0;
    try {
      const apptRow = await getOne(
        `SELECT COUNT(*)::int AS count
         FROM appointments
         WHERE date_trunc('month', date::timestamp)
             = date_trunc('month', (NOW() AT TIME ZONE 'America/Sao_Paulo'))`
      );
      monthAppointments = apptRow.count || 0;
    } catch (_) { /* tabela pode não existir em algum ambiente */ }

    const tablesOut = tables.map(t => {
      const bytes = Number(t.bytes) || 0;
      return {
        name: t.name,
        bytes,
        mb: +(bytes / (1024 * 1024)).toFixed(3),
        kb: +(bytes / 1024).toFixed(1),
        rows: Number(t.rows) || 0,
        percent: totalBytes > 0 ? +((bytes / totalBytes) * 100).toFixed(1) : 0,
      };
    });

    res.json({
      database: sizeRow.name,
      ping_ms: +pingMs.toFixed(1),
      online: true,
      total: {
        bytes: totalBytes,
        mb: +totalMB.toFixed(2),
        limit_mb: PLAN_LIMIT_MB,
        percent: PLAN_LIMIT_MB > 0 ? +((totalMB / PLAN_LIMIT_MB) * 100).toFixed(1) : 0,
      },
      table_count: tableCount,
      total_records: totalRecords,
      month_appointments: monthAppointments,
      tables: tablesOut,
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[dev/db-metrics]', e.message);
    res.status(500).json({ error: 'Erro ao coletar métricas do banco' });
  }
});

module.exports = router;
