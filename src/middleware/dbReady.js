const { ensureDatabaseReady } = require('../db/bootstrap');

async function databaseReady(_req, _res, next) {
  try {
    await ensureDatabaseReady();
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { databaseReady };
