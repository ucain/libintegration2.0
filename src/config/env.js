function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function getDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || '';
}

function validateEnvironment() {
  const isProduction = process.env.NODE_ENV === 'production';
  const issues = [];
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) issues.push('DATABASE_URL (atau POSTGRES_URL) belum dikonfigurasi.');

  const jwtSecret = process.env.JWT_SECRET || '';
  if (isProduction && jwtSecret.length < 32) {
    issues.push('JWT_SECRET production wajib minimal 32 karakter.');
  }

  if (issues.length) {
    const err = new Error(issues.join(' '));
    err.code = 'ENVIRONMENT_INVALID';
    err.status = 503;
    err.details = { issues };
    throw err;
  }

  return {
    isProduction,
    databaseUrl,
    jwtSecret: jwtSecret || 'local-development-secret-change-me',
    sessionTtl: process.env.SESSION_TTL || '8h',
    demoMode: asBool(process.env.DEMO_MODE, !isProduction),
    autoMigrate: asBool(process.env.AUTO_MIGRATE, !isProduction),
    autoSeedDemo: asBool(process.env.AUTO_SEED_DEMO, !isProduction),
    appBaseUrl: process.env.APP_BASE_URL || '',
    cronSecret: process.env.CRON_SECRET || '',
    trustProxy: Number(process.env.TRUST_PROXY || 1),
  };
}

module.exports = { asBool, getDatabaseUrl, validateEnvironment };
