const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('\n[ERRO FATAL] A variável de ambiente JWT_SECRET não está definida.');
  console.error('Crie um arquivo .env na raiz (use .env.example como base) com um JWT_SECRET forte.\n');
  process.exit(1);
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Você precisa estar logada para acessar esta área' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Sua sessão expirou. Faça login novamente.' });
    }
    req.user = user;
    next();
  });
}

// Admin e Master têm poderes administrativos (gerir clientes, serviços, agenda, etc.)
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'master') {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }
  next();
}

// Apenas o Master (admin mestre) — recuperação de senha das admins e visão geral
function requireMaster(req, res, next) {
  if (req.user.role !== 'master') {
    return res.status(403).json({ error: 'Acesso negado. Apenas o administrador mestre.' });
  }
  next();
}

function requireAdminOrSelf(req, res, next) {
  const targetId = parseInt(req.params.id);
  if (req.user.role === 'admin' || req.user.role === 'master' || req.user.id === targetId) {
    return next();
  }
  return res.status(403).json({ error: 'Acesso negado.' });
}

module.exports = { authenticateToken, requireAdmin, requireMaster, requireAdminOrSelf, JWT_SECRET };
