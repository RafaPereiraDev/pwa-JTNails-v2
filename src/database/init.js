/**
 * Inicialização do banco PostgreSQL.
 * Cria as tabelas se não existirem e popula os dados iniciais (seed).
 * Chamado uma vez na inicialização do servidor.
 */
const bcrypt = require('bcryptjs');
const { query, getOne, withTransaction } = require('./db');

async function initDatabase() {
  // ── Schema ──────────────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS professionals (
      id         SERIAL PRIMARY KEY,
      name       TEXT    NOT NULL,
      phone      TEXT,
      email      TEXT,
      active     BOOLEAN DEFAULT TRUE,
      color      TEXT    DEFAULT '#e91e8c',
      photo      TEXT,
      bio        TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id              SERIAL PRIMARY KEY,
      name            TEXT    NOT NULL,
      email           TEXT    UNIQUE NOT NULL,
      password        TEXT    NOT NULL,
      role            TEXT    NOT NULL CHECK(role IN ('master','admin','professional')),
      professional_id INTEGER REFERENCES professionals(id),
      active          BOOLEAN DEFAULT TRUE,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clients (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      phone       TEXT NOT NULL,
      email       TEXT,
      birth_date  TEXT,
      notes       TEXT,
      reliability TEXT DEFAULT 'new'
                  CHECK(reliability IN ('new','good','irregular','unreliable')),
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS services (
      id          SERIAL PRIMARY KEY,
      name        TEXT    NOT NULL,
      description TEXT,
      price       NUMERIC(10,2) NOT NULL,
      duration    INTEGER DEFAULT 60,
      active      BOOLEAN DEFAULT TRUE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id              SERIAL PRIMARY KEY,
      client_id       INTEGER NOT NULL REFERENCES clients(id),
      professional_id INTEGER NOT NULL REFERENCES professionals(id),
      service_id      INTEGER NOT NULL REFERENCES services(id),
      date            DATE    NOT NULL,
      start_time      TIME    NOT NULL,
      end_time        TIME    NOT NULL,
      price           NUMERIC(10,2) NOT NULL,
      status          TEXT DEFAULT 'scheduled'
                      CHECK(status IN ('scheduled','confirmed','in_progress','completed','cancelled','no_show')),
      payment_method  TEXT,
      notes           TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id              SERIAL PRIMARY KEY,
      type            TEXT NOT NULL CHECK(type IN ('income','expense')),
      appointment_id  INTEGER REFERENCES appointments(id),
      professional_id INTEGER REFERENCES professionals(id),
      description     TEXT NOT NULL,
      category        TEXT,
      amount          NUMERIC(10,2) NOT NULL,
      payment_method  TEXT,
      date            DATE NOT NULL,
      notes           TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS blocked_times (
      id              SERIAL PRIMARY KEY,
      professional_id INTEGER NOT NULL REFERENCES professionals(id),
      date            DATE NOT NULL,
      start_time      TIME NOT NULL,
      end_time        TIME NOT NULL,
      reason          TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    -- Configurações gerais do sistema (chave/valor)
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Inscrições de Web Push por usuário (um usuário pode ter vários dispositivos)
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      endpoint    TEXT NOT NULL UNIQUE,
      p256dh      TEXT NOT NULL,
      auth        TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    -- Preferências de notificação no usuário
    ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_new_appointment BOOLEAN DEFAULT TRUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_vibrate         BOOLEAN DEFAULT TRUE;

    -- Token seguro para a cliente cancelar o próprio agendamento + quem cancelou
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancel_token TEXT;
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
    CREATE INDEX IF NOT EXISTS idx_appointments_cancel_token ON appointments(cancel_token);

    -- Senha da cliente (bcrypt) para login na área pública de agendamento/consulta
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS password TEXT;

    -- Status ativo/inativo da cliente (inativar preserva o histórico financeiro)
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;

    -- Plano Anual (série de agendamentos recorrentes) e encaixe (permite sobreposição)
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS series_id  TEXT;
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS is_encaixe BOOLEAN DEFAULT FALSE;
    CREATE INDEX IF NOT EXISTS idx_appointments_series ON appointments(series_id);
  `);

  // Mensagem de aniversário padrão (só insere se ainda não existir)
  // Emojis em Unicode escaped: \uD83C\uDF89=🎉 \uD83C\uDF82=🎂 \u2728=✨ \uD83D\uDC96=💖
  await query(`
    INSERT INTO settings (key, value)
    VALUES ('birthday_message', $1)
    ON CONFLICT (key) DO NOTHING
  `, ['Parab\u00e9ns, {nome}! \uD83C\uDF89\uD83C\uDF82 O Sal\u00e3o Tainara Nails deseja a voc\u00ea um dia maravilhoso, repleto de alegria e momentos especiais! \u2728\uD83D\uDC96']);

  // Mensagem de acesso do cadastro de cliente (mesmo padrao do aniversario).
  // Placeholders: {nome} {url} {telefone} {senha}
  // \u2728=✨ \uD83D\uDD17=🔗 \uD83D\uDCF1=📱 \uD83D\uDD11=🔑
  await query(`
    INSERT INTO settings (key, value)
    VALUES ('welcome_message', $1)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `, ['Seja bem-vinda ao *JT Nails*, *{nome}*! \uD83D\uDC85\u2728\n\nSeu cadastro foi realizado com sucesso. Aqui est\u00e3o seus dados de acesso:\n\n\uD83D\uDCF1 *Telefone:* {telefone}\n\uD83D\uDD11 *Senha:* {senha}\n\nPara fazer seus agendamentos, acesse:\n\uD83D\uDC49 {url}\n\nAguardamos voc\u00ea!']);

  await query(`
    INSERT INTO settings (key, value)
    VALUES ('reset_message', $1)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `, ['Ol\u00e1, *{nome}*! \uD83D\uDC85\n\nSua senha do *JT Nails* foi redefinida com sucesso!\n\n\uD83D\uDCF1 *Telefone:* {telefone}\n\uD83D\uDD11 *Nova Senha:* {senha}\n\nAcesse seu painel para agendar seus hor\u00e1rios:\n\uD83D\uDC49 {url}\n\nSe precisar de algo, estamos \u00e0 disposi\u00e7\u00e3o!']);

  // ── Seed (só se o banco estiver vazio) ──────────────────────────────────────
  const { count } = await getOne('SELECT COUNT(*) as count FROM users');
  if (parseInt(count) > 0) {
    console.log('Banco de dados PostgreSQL pronto (dados existentes mantidos).');
    return;
  }

  const isProd = process.env.NODE_ENV === 'production';

  const adminPass   = process.env.SEED_ADMIN_PASSWORD;
  const tainaraPass = process.env.SEED_TAINARA_PASSWORD;
  const prof2Pass   = process.env.SEED_PROF2_PASSWORD;

  if (isProd && (!adminPass || !tainaraPass || !prof2Pass)) {
    console.error('\n[ERRO FATAL] NODE_ENV=production mas as senhas iniciais não estão definidas.');
    console.error('Defina SEED_ADMIN_PASSWORD, SEED_TAINARA_PASSWORD e SEED_PROF2_PASSWORD no ambiente.\n');
    process.exit(1);
  }

  const crypto  = require('crypto');
  const genPass = () => crypto.randomBytes(9).toString('base64url');
  const finalAdminPass   = adminPass   || genPass();
  const finalTainaraPass = tainaraPass || genPass();
  const finalProf2Pass   = prof2Pass   || genPass();

  await withTransaction(async (client) => {
    // Professionals
    const p1 = await client.query(
      'INSERT INTO professionals (name, phone, email, color) VALUES ($1,$2,$3,$4) RETURNING id',
      ['Tainara', '(11) 99999-0001', 'tainara@nails.com', '#e91e8c']
    );
    const p2 = await client.query(
      'INSERT INTO professionals (name, phone, email, color) VALUES ($1,$2,$3,$4) RETURNING id',
      ['Juliana', '(11) 99999-0002', 'juliana@nails.com', '#9c27b0']
    );
    const profId1 = p1.rows[0].id;
    const profId2 = p2.rows[0].id;

    // Master user (sem professional_id)
    await client.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,$4)',
      ['Administrador', 'admin@nails.com', bcrypt.hashSync(finalAdminPass, 10), 'master']
    );

    // Admin users vinculados às profissionais
    await client.query(
      'INSERT INTO users (name, email, password, role, professional_id) VALUES ($1,$2,$3,$4,$5)',
      ['Tainara', 'tainara@nails.com', bcrypt.hashSync(finalTainaraPass, 10), 'admin', profId1]
    );
    await client.query(
      'INSERT INTO users (name, email, password, role, professional_id) VALUES ($1,$2,$3,$4,$5)',
      ['Juliana', 'juliana@nails.com', bcrypt.hashSync(finalProf2Pass, 10), 'admin', profId2]
    );

    // Serviços padrão
    const services = [
      ['Manicure',           'Esmaltação nas mãos',              35,  45],
      ['Pedicure',           'Esmaltação nos pés',               45,  60],
      ['Mão + Pé',           'Manicure e pedicure completo',     75, 100],
      ['Alongamento em Gel', 'Extensão de unhas em gel',        180, 120],
      ['Manutenção de Gel',  'Manutenção das unhas em gel',     120,  90],
      ['Nail Art',           'Arte nas unhas',                   60,  60],
      ['Esmaltação em Gel',  'Esmalte em gel de longa duração',  80,  60],
    ];
    for (const [name, description, price, duration] of services) {
      await client.query(
        'INSERT INTO services (name, description, price, duration) VALUES ($1,$2,$3,$4)',
        [name, description, price, duration]
      );
    }
  });

  if (!isProd) {
    console.log('\n================ CREDENCIAIS INICIAIS (DEV) ================');
    console.log('  ANOTE AGORA — estas senhas não serão exibidas novamente.');
    console.log('  Master       -> admin@nails.com     / ' + finalAdminPass);
    console.log('  Tainara      -> tainara@nails.com   / ' + finalTainaraPass);
    console.log('  Juliana      -> juliana@nails.com   / ' + finalProf2Pass);
    console.log('  Troque essas senhas no primeiro acesso.');
    console.log('============================================================\n');
  } else {
    console.log('\nDados iniciais criados. Use as senhas definidas nas variáveis SEED_*.\n');
  }

  console.log('Banco de dados PostgreSQL pronto e inicializado.');
}

module.exports = { initDatabase };
