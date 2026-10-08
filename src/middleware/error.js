function notFound(req, res) {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} tidak ditemukan.`, details: null });
}

function postgresError(err) {
  if (err.code === '23505') return { status:409, code:'CONFLICT', message:'Data duplikat atau resource sudah digunakan.' };
  if (err.code === '23503') return { status:409, code:'REFERENCE_CONFLICT', message:'Data masih direferensikan oleh transaksi lain.' };
  if (err.code === '23514') return { status:422, code:'INVALID_VALUE', message:'Nilai tidak memenuhi aturan database.' };
  if (err.code === '22P02') return { status:400, code:'INVALID_IDENTIFIER', message:'Format identifier tidak valid.' };
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
    return { status:503, code:'DATABASE_UNAVAILABLE', message:'Database tidak dapat dihubungi. Periksa DATABASE_URL/integrasi database.' };
  }
  return null;
}

function errorHandler(err, _req, res, _next) {
  console.error('[request-error]', {
    code: err.code,
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
  const db = postgresError(err);
  const status = err.status || db?.status || 500;
  const code = err.code && !/^\d{5}$/.test(String(err.code)) ? err.code : (db?.code || 'INTERNAL_SERVER_ERROR');
  const safeMessage = status >= 500
    ? (db?.message || (code === 'ENVIRONMENT_INVALID' || code === 'DATABASE_SCHEMA_MISSING' ? err.message : 'Terjadi kesalahan pada server.'))
    : err.message;
  res.status(status).json({
    success: false,
    code,
    message: safeMessage,
    details: err.details || null,
    requestId: res.locals.requestId || null,
  });
}

module.exports = { notFound, errorHandler };
