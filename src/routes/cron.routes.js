const express = require('express');
const { runHousekeeping } = require('../jobs/housekeeping');
const { AppError, ok, asyncHandler } = require('../utils/http');
const { validateEnvironment } = require('../config/env');

const router = express.Router();

router.get('/housekeeping', asyncHandler(async (req, res) => {
  const env = validateEnvironment();
  if (!env.cronSecret) throw new AppError(503, 'CRON_SECRET_MISSING', 'CRON_SECRET belum dikonfigurasi.');
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${env.cronSecret}`) throw new AppError(401, 'INVALID_CRON_SECRET', 'Cron secret tidak valid.');
  const result = await runHousekeeping();
  ok(res, result, 'Housekeeping selesai.');
}));

module.exports = router;
