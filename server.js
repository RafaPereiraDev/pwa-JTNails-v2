// Carrega variáveis de ambiente do .env antes de qualquer outra coisa
require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const path      = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Necessário para rate-limit funcionar corretamente atrás de proxy (Railway/Render/nginx)
app.set('trust proxy', 1);

// Cabeçalhos de segurança HTTP (proteção contra XSS, clickjacking, etc.)
// contentSecurityPolicy desativado pois o front usa CDN (Font Awesome) e estilos inline
app.use(helmet({ contentSecurityPolicy: false }));

// ── CORS ────────────────────────────────────────────────────────────────
// Em produção, restringe às origens definidas em CORS_ORIGINS (separadas por vírgula).
// Em desenvolvimento, libera geral para facilitar testes locais.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',').map(o => o.trim()).filter(Boolean);

if (isProd && allowedOrigins.length > 0) {
  app.use(cors({
    origin: (origin, cb) => {
      // Permite requisições sem origin (apps mobile, curl, mesmo domínio)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Origem não permitida pelo CORS'));
    },
    credentials: true
  }));
} else {
  app.use(cors());
}

// Limite de tamanho do payload — evita ataques de payload gigante
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Sanitização base de todo corpo de requisição (apara strings, remove control chars)
const { sanitizeBody } = require('./src/middleware/sanitize');
app.use(sanitizeBody);

app.use(express.static(path.join(__dirname, 'public')));

// ── Rate limiting ─────────────────────────────────────────────────────────
// Limite geral para toda a API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300,                  // 300 requisições por IP por janela
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' }
});

// Limite mais restrito para login — protege contra força bruta
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,                   // 10 tentativas de login por IP por janela
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // logins bem-sucedidos não contam
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.' }
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);

app.use('/api/auth',          require('./src/routes/auth'));
app.use('/api/users',         require('./src/routes/users'));
app.use('/api/professionals', require('./src/routes/professionals'));
app.use('/api/clients',       require('./src/routes/clients'));
app.use('/api/services',      require('./src/routes/services'));
app.use('/api/appointments',  require('./src/routes/appointments'));
app.use('/api/transactions',  require('./src/routes/transactions'));
app.use('/api/reports',       require('./src/routes/reports'));
app.use('/api/blocked-times', require('./src/routes/blockedTimes'));

// SPA fallback — apenas para rotas não-API
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Rota não encontrada' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Tratador de erros global ──────────────────────────────────────────────
// Captura JSON malformado, erros de CORS e qualquer exceção não tratada
// sem vazar stack traces para o cliente.
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload muito grande' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido na requisição' });
  }
  if (err.message === 'Origem não permitida pelo CORS') {
    return res.status(403).json({ error: 'Origem não permitida' });
  }
  console.error('[ERRO]', err.message);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Init DB then start
const { initDatabase } = require('./src/database/init');
initDatabase();

app.listen(PORT, () => {
  console.log('\n================================================');
  console.log('   Tainara Nails - Sistema de Gestao');
  console.log(`   http://localhost:${PORT}`);
  console.log('   ================================================\n');
});
