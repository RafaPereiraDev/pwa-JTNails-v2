/**
 * Database layer — PostgreSQL via node-postgres (pg)
 * Conexão via DATABASE_URL (Render / Railway / local).
 *
 * Mantém os helpers query(), getOne(), getAll() com semântica similar
 * ao wrapper SQLite anterior, mas totalmente async/await.
 */
const { Pool } = require('pg');

// Configuração de SSL do banco.
// - localhost: sem SSL.
// - Se DATABASE_CA (certificado CA do provedor) estiver definido: verificação
//   completa do certificado (rejectUnauthorized: true) — protege contra MITM.
// - Caso contrário: SSL ativo sem verificação de CA (comportamento herdado do
//   Render, que não expõe o CA por padrão). Para forçar verificação estrita
//   sem CA customizado, defina DATABASE_SSL_STRICT=true.
function buildSslConfig() {
  const url = process.env.DATABASE_URL || '';
  if (url.includes('localhost') || url.includes('127.0.0.1')) return false;

  const ca = process.env.DATABASE_CA;
  if (ca) {
    return { rejectUnauthorized: true, ca: ca.replace(/\\n/g, '\n') };
  }
  const strict = String(process.env.DATABASE_SSL_STRICT || '').toLowerCase() === 'true';
  return { rejectUnauthorized: strict };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSslConfig(),
  client_encoding: 'UTF8',
});

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool:', err.message);
});

// Garante que toda nova conexão use UTF-8 explicitamente (emojis, acentos)
pool.on('connect', (client) => {
  client.query("SET client_encoding TO 'UTF8'").catch(() => {});
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
