const jwt = require('jsonwebtoken');
const { AppError } = require('../utils/http');
const { validateEnvironment } = require('../config/env');

function getToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return req.cookies?.pknstan_session || null;
}

function authenticate(req, _res, next) {
  const token = getToken(req);
  if (!token) return next(new AppError(401, 'UNAUTHENTICATED', 'Sesi autentikasi diperlukan.'));
  try {
    const env = validateEnvironment();
    req.user = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'], issuer: 'pknstan-library-system', audience: 'pknstan-library-web' });
    next();
  } catch (_err) {
    next(new AppError(401, 'INVALID_TOKEN', 'Sesi tidak valid atau telah kedaluwarsa.'));
  }
}

function requireRoles(...roles) {
  return (req, _res, next) => {
    const userRoles = req.user?.roles || [];
    if (!roles.some((role) => userRoles.includes(role))) {
      return next(new AppError(403, 'FORBIDDEN', 'Anda tidak memiliki hak untuk menjalankan tindakan ini.'));
    }
    next();
  };
}

module.exports = { authenticate, requireRoles, getToken };
