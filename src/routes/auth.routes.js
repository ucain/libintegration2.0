const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { pool } = require('../config/db');
const { validateEnvironment } = require('../config/env');
const { AppError, ok, asyncHandler } = require('../utils/http');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success:false, code:'RATE_LIMITED', message:'Terlalu banyak percobaan masuk. Coba lagi beberapa saat.' }
});

function cookieOptions() {
  const env = validateEnvironment();
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000,
  };
}

async function getUserByInstitutionalId(institutionalId) {
  const { rows } = await pool.query(
    `SELECT m.member_id, m.institutional_id, m.full_name, m.email, m.member_type, m.member_status,
            m.collective_eligibility,
            COALESCE(array_agg(r.role_name ORDER BY r.role_name) FILTER (WHERE r.role_name IS NOT NULL), '{}') AS roles
       FROM library_member m
       LEFT JOIN user_role ur ON ur.member_id=m.member_id
       LEFT JOIN role r ON r.role_id=ur.role_id AND r.active_flag=true
      WHERE m.institutional_id=$1
      GROUP BY m.member_id`,
    [institutionalId]
  );
  return rows[0] || null;
}

router.post('/mock-login', loginLimiter, asyncHandler(async (req, res) => {
  const env = validateEnvironment();
  if (!env.demoMode) throw new AppError(404, 'DEMO_LOGIN_DISABLED', 'Mock SSO dinonaktifkan.');
  const parsed = z.object({ institutionalId: z.string().trim().min(1).max(50) }).safeParse(req.body || {});
  if (!parsed.success) throw new AppError(400, 'INSTITUTIONAL_ID_REQUIRED', 'Institutional ID wajib diisi.');

  const user = await getUserByInstitutionalId(parsed.data.institutionalId);
  if (!user) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Akun dummy tidak ditemukan. Pastikan database demo sudah di-seed.');
  if (user.member_status !== 'ACTIVE') throw new AppError(403, 'MEMBER_INACTIVE', 'Status anggota tidak aktif.');
  if (!user.roles.length) throw new AppError(403, 'ROLE_NOT_ASSIGNED', 'Akun belum memiliki role aplikasi.');

  const token = jwt.sign(
    { sub: user.member_id, institutionalId: user.institutional_id, name: user.full_name, roles: user.roles },
    env.jwtSecret,
    { expiresIn: env.sessionTtl, algorithm: 'HS256', issuer: 'pknstan-library-system', audience: 'pknstan-library-web' }
  );
  res.cookie('pknstan_session', token, cookieOptions());
  ok(res, { user }, 'Mock SSO login berhasil.');
}));

router.post('/logout', (_req, res) => {
  res.clearCookie('pknstan_session', { ...cookieOptions(), maxAge: undefined });
  ok(res, null, 'Logout berhasil.');
});

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT member_id,institutional_id,full_name,email,member_type,member_status,collective_eligibility
       FROM library_member WHERE member_id=$1`,
    [req.user.sub]
  );
  if (!rows[0]) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Pengguna tidak ditemukan.');
  if (rows[0].member_status !== 'ACTIVE') throw new AppError(403, 'MEMBER_INACTIVE', 'Status anggota tidak aktif.');
  ok(res, { ...rows[0], roles: req.user.roles });
}));

module.exports = router;
