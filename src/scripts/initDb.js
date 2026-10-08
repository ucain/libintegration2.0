require('dotenv').config();
const { initializeDatabase } = require('../db/bootstrap');
const { pool } = require('../config/db');

initializeDatabase()
  .then(async () => { console.log('Database siap.'); await pool.end(); })
  .catch(async (err) => { console.error(err); try { await pool.end(); } catch (_) {} process.exit(1); });
