const bcrypt   = require('bcryptjs');
const { exec, prepare, getDb } = require('./db');

function initDatabase() {
  getDb(); // ensure DB file + pragmas are set

  // ── Schema ────────────────────────────────────────────────────────────────
  exec(`
    CREATE TABLE IF NOT EXISTS professionals (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      phone      TEXT,
      email      TEXT,
      active     INTEGER DEFAULT 1,
      color      TEXT    DEFAULT '#e91e8c',
      created_at TEXT    DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      email           TEXT    UNIQUE NOT NULL,
      password        TEXT    NOT NULL,
      role            TEXT    NOT NULL CHECK(role IN ('admin','professional')),
      professional_id INTEGER,
      active          INTEGER DEFAULT 1,
      created_at      TEXT    DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (professional_id) REFERENCES professionals(id)
    );

    CREATE TABLE IF NOT EXISTS clients (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      phone       TEXT NOT NULL,
      email       TEXT,
      birth_date  TEXT,
      notes       TEXT,
      reliability TEXT DEFAULT 'new'
                  CHECK(reliability IN ('new','good','irregular','unreliable')),
      created_at  TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS services (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      description TEXT,
      price       REAL    NOT NULL,
      duration    INTEGER DEFAULT 60,
      active      INTEGER DEFAULT 1,
      created_at  TEXT    DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id       INTEGER NOT NULL,
      professional_id INTEGER NOT NULL,
      service_id      INTEGER NOT NULL,
      date            TEXT    NOT NULL,
      start_time      TEXT    NOT NULL,
      end_time        TEXT    NOT NULL,
      price           REAL    NOT NULL,
      status          TEXT    DEFAULT 'scheduled'
                      CHECK(status IN ('scheduled','confirmed','in_progress','completed','cancelled','no_show')),
      payment_method  TEXT,
      notes           TEXT,
      created_at      TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (client_id)       REFERENCES clients(id),
      FOREIGN KEY (professional_id) REFERENCES professionals(id),
      FOREIGN KEY (service_id)      REFERENCES services(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      type            TEXT NOT NULL CHECK(type IN ('income','expense')),
      appointment_id  INTEGER,
      professional_id INTEGER,
      description     TEXT NOT NULL,
      category        TEXT,
      amount          REAL NOT NULL,
      payment_method  TEXT,
      date            TEXT NOT NULL,
      notes           TEXT,
      created_at      TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (appointment_id)  REFERENCES appointments(id),
      FOREIGN KEY (professional_id) REFERENCES professionals(id)
    );

    CREATE TABLE IF NOT EXISTS blocked_times (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      professional_id INTEGER NOT NULL,
      date            TEXT NOT NULL,
      start_time      TEXT NOT NULL,
      end_time        TEXT NOT NULL,
      reason          TEXT,
      created_at      TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (professional_id) REFERENCES professionals(id)
    );
  `);

  // ── Migration: add reliability column if not exists ──────────────────────
  try {
    exec(`ALTER TABLE clients ADD COLUMN reliability TEXT DEFAULT 'new'`);
    console.log('Migration: coluna reliability adicionada em clients');
  } catch(e) {
    // Column already exists — safe to ignore
  }

  // ── Seed (only if DB is empty) ────────────────────────────────────────────
  const userCount = prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const isProd = process.env.NODE_ENV === 'production';

    // Senhas iniciais vêm do .env. Em produção são obrigatórias — sem fallback.
    const adminPass   = process.env.SEED_ADMIN_PASSWORD;
    const tainaraPass = process.env.SEED_TAINARA_PASSWORD;
    const prof2Pass   = process.env.SEED_PROF2_PASSWORD;

    if (isProd && (!adminPass || !tainaraPass || !prof2Pass)) {
      console.error('\n[ERRO FATAL] NODE_ENV=production mas as senhas iniciais não estão definidas.');
      console.error('Defina SEED_ADMIN_PASSWORD, SEED_TAINARA_PASSWORD e SEED_PROF2_PASSWORD no ambiente.\n');
      process.exit(1);
    }

    // Em desenvolvimento, gera senhas aleatórias se não forem fornecidas (nunca hardcoded)
    const crypto = require('crypto');
    const genPass = () => crypto.randomBytes(9).toString('base64url');
    const finalAdminPass   = adminPass   || genPass();
    const finalTainaraPass = tainaraPass || genPass();
    const finalProf2Pass   = prof2Pass   || genPass();

    // Professionals
    const p1 = prepare(
      'INSERT INTO professionals (name, phone, email, color) VALUES (?,?,?,?)'
    ).run('Tainara', '(11) 99999-0001', 'tainara@nails.com', '#e91e8c');

    const p2 = prepare(
      'INSERT INTO professionals (name, phone, email, color) VALUES (?,?,?,?)'
    ).run('Profissional 2', '(11) 99999-0002', 'prof2@nails.com', '#9c27b0');

    // Admin
    prepare(
      'INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)'
    ).run('Administrador', 'admin@nails.com', bcrypt.hashSync(finalAdminPass, 10), 'admin');

    // Professional users
    prepare(
      'INSERT INTO users (name, email, password, role, professional_id) VALUES (?,?,?,?,?)'
    ).run('Tainara', 'tainara@nails.com', bcrypt.hashSync(finalTainaraPass, 10), 'professional', p1.lastInsertRowid);

    prepare(
      'INSERT INTO users (name, email, password, role, professional_id) VALUES (?,?,?,?,?)'
    ).run('Profissional 2', 'prof2@nails.com', bcrypt.hashSync(finalProf2Pass, 10), 'professional', p2.lastInsertRowid);

    // Default services
    const ins = prepare('INSERT INTO services (name, description, price, duration) VALUES (?,?,?,?)');
    [
      ['Manicure',           'Esmaltação nas mãos',              35,  45],
      ['Pedicure',           'Esmaltação nos pés',               45,  60],
      ['Mão + Pé',           'Manicure e pedicure completo',     75, 100],
      ['Alongamento em Gel', 'Extensão de unhas em gel',        180, 120],
      ['Manutenção de Gel',  'Manutenção das unhas em gel',     120,  90],
      ['Nail Art',           'Arte nas unhas',                   60,  60],
      ['Esmaltação em Gel',  'Esmalte em gel de longa duração',  80,  60],
    ].forEach(s => ins.run(...s));

    // Só exibe as credenciais no console em ambiente de desenvolvimento
    if (!isProd) {
      console.log('\n================ CREDENCIAIS INICIAIS (DEV) ================');
      console.log('  ANOTE AGORA — estas senhas não serão exibidas novamente.');
      console.log('  Admin        -> admin@nails.com     / ' + finalAdminPass);
      console.log('  Tainara      -> tainara@nails.com   / ' + finalTainaraPass);
      console.log('  Profissional -> prof2@nails.com     / ' + finalProf2Pass);
      console.log('  Troque essas senhas no primeiro acesso.');
      console.log('============================================================\n');
    } else {
      console.log('\nDados iniciais criados. Use as senhas definidas nas variáveis SEED_*.\n');
    }
  }

  console.log('Banco de dados SQLite pronto ->', require('path').join(__dirname, '../../data/tainara_nails.db'));
}

module.exports = { initDatabase };
