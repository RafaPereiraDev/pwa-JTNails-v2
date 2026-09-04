/**
 * Database layer — PostgreSQL via node-postgres (pg)
 * Conexão via DATABASE_URL (Render / Railway / local).
 *
 * Mantém os helpers query(), getOne(), getAll() com semântica similar
 * ao wrapper SQLite anterior, mas totalmente async/await.
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool:', err.message);
});

/**
 * Executa qualquer query.
 * @param {string} sql  — SQL com $1,$2,… placeholders
 * @param {Array}  params
 * @returns {Promise<pg.QueryResult>}
 */
async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

/** Retorna a primeira linha ou undefined */
async function getOne(sql, params = []) {
  const result = await query(sql, params);
  return result.rows[0];
}

/** Retorna todas as linhas */
async function getAll(sql, params = []) {
  const result = await query(sql, params);
  return result.rows;
}

/**
 * Executa uma série de queries dentro de uma transação.
 * @param {(client: pg.PoolClient) => Promise<any>} fn
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, getOne, getAll, withTransaction };
