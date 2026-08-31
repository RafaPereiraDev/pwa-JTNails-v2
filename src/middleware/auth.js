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

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }
  next();
}

function requireAdminOrSelf(req, res, next) {
  const targetId = parseInt(req.params.id);
  if (req.user.role === 'admin' || req.user.id === targetId) {
    return next();
  }
  return res.status(403).json({ error: 'Acesso negado.' });
}

module.exports = { authenticateToken, requireAdmin, requireAdminOrSelf, JWT_SECRET };
