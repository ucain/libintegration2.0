const { AppError } = require('../utils/http');

function requireSameOrigin(req, _res, next) {
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next(); // CLI/Postman/server-to-server
  try {
    const originUrl = new URL(origin);
    const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    if (originUrl.host !== forwardedHost) {
      return next(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Origin request tidak diizinkan.'));
    }
  } catch (_) {
    return next(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Origin request tidak valid.'));
  }
  next();
}

module.exports = { requireSameOrigin };
