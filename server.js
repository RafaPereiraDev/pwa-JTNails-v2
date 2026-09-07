// Carrega variáveis de ambiente do .env antes de qualquer outra coisa
require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const path      = require('path');

const app    = express();
const PORT   = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Necessário para rate-limit funcionar corretamente atrás de proxy (Render/Railway/nginx)
app.set('trust proxy', 1);

// Cabeçalhos de segurança HTTP
app.use(helmet({ contentSecurityPolicy: false }));

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',').map(o => o.trim()).filter(Boolean);

if (isProd && allowedOrigins.length > 0) {
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Origem não permitida pelo CORS'));
    },
    credentials: true,
  }));
} else {
  app.use(cors());
}

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const { sanitizeBody } = require('./src/middleware/sanitize');
app.use(sanitizeBody);

app.use(express.static(path.join(__dirname, 'public')));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 300,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.' },
});
const publicBookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 30,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitos agendamentos em pouco tempo. Tente novamente mais tarde.' },
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/public/appointments', publicBookingLimiter);

// ── Rotas ─────────────────────────────────────────────────────────────────────
app.use('/api/public',        require('./src/routes/public'));
app.use('/api/auth',          require('./src/routes/auth'));
app.use('/api/users',         require('./src/routes/users'));
app.use('/api/professionals', require('./src/routes/professionals'));
app.use('/api/clients',       require('./src/routes/clients'));
app.use('/api/services',      require('./src/routes/services'));
app.use('/api/appointments',  require('./src/routes/appointments'));
app.use('/api/transactions',  require('./src/routes/transactions'));
app.use('/api/reports',       require('./src/routes/reports'));
app.use('/api/blocked-times', require('./src/routes/blockedTimes'));
app.use('/api/settings',      require('./src/routes/settings'));

app.get(['/agendar', '/agendar/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'agendar.html'));
});
app.get(['/cancelar-agendamento', '/cancelar-agendamento/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cancelar-agendamento.html'));
});
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Rota não encontrada' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Tratador de erros global ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large')    return res.status(413).json({ error: 'Payload muito grande' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido na requisição' });
  if (err.message === 'Origem não permitida pelo CORS')
    return res.status(403).json({ error: 'Origem não permitida' });
  console.error('[ERRO]', err.message);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// ── Inicialização assíncrona ──────────────────────────────────────────────────
const { initDatabase }        = require('./src/database/init');
const { query: dbQuery, pool } = require('./src/database/db');

async function cleanOldHistory() {
  const client = await pool.connect();
  try {
    const now = new Date();
    now.setDate(1);
    now.setMonth(now.getMonth() - 2);
    const cutoff = now.toLocaleDateString('en-CA');

    await client.query('BEGIN');

    // Conta valor financeiro que será removido (para log transparente)
    const sumRow = (await client.query(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total
       FROM transactions
       WHERE type='income' AND appointment_id IN
         (SELECT id FROM appointments WHERE date < $1)`,
      [cutoff]
    )).rows[0];

    const txRes   = await client.query(
      `DELETE FROM transactions
       WHERE appointment_id IN (SELECT id FROM appointments WHERE date < $1)`,
      [cutoff]
    );
    const apptRes = await client.query(
      'DELETE FROM appointments WHERE date < $1',
      [cutoff]
    );

    await client.query('COMMIT');

    if ((apptRes.rowCount || 0) > 0) {
      console.log(
        `[limpeza] ${apptRes.rowCount} agendamento(s), ${txRes.rowCount} transação(ões) ` +
        `(R$ ${parseFloat(sumRow.total).toFixed(2)} em receitas) removidos (anteriores a ${cutoff})`
      );
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[limpeza] Erro ao limpar histórico:', e.message);
  } finally {
    client.release();
  }
}

// Diagnóstico da conexão: mostra se a DATABASE_URL chegou e qual host será usado,
// sem expor a senha nos logs.
function logDbTarget() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[DB] ATENÇÃO: DATABASE_URL não está definida! Configure a variável no Railway (referência ${{Postgres.DATABASE_URL}}).');
    return;
  }
  try {
    const u = new URL(url);
    console.log(`[DB] Conectando em host=${u.hostname} port=${u.port || '5432'} db=${u.pathname.slice(1)} ssl=${require('./src/database/db').sslInfo || 'auto'}`);
  } catch (_) {
    console.log('[DB] DATABASE_URL definida (formato não reconhecido para log).');
  }
}

// Tenta iniciar o banco com algumas retentativas — o Postgres do Railway pode
// ainda estar aceitando conexões quando o app sobe.
async function initWithRetry(attempts = 5, delayMs = 3000) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await initDatabase();
      return;
    } catch (e) {
      console.error(`[DB] Tentativa ${i}/${attempts} falhou: ${e.code || ''} ${e.message}`);
      if (i === attempts) throw e;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

(async () => {
  try {
    logDbTarget();
    await initWithRetry();
    await cleanOldHistory();
    setInterval(cleanOldHistory, 24 * 60 * 60 * 1000);

    app.listen(PORT, '0.0.0.0', () => {
      console.log('\n================================================');
      console.log('   Tainara Nails - Sistema de Gestao');
      console.log(`   http://localhost:${PORT}`);
      console.log('   ================================================\n');
    });
  } catch (e) {
    console.error('[FATAL] Erro na inicialização:', e.code || '', e.message);
    console.error('[FATAL] Verifique: (1) DATABASE_URL definida no serviço do app; (2) usar a URL INTERNA do Postgres do Railway; (3) app e banco no mesmo projeto.');
    process.exit(1);
  }
})();
