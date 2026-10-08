const { pool } = require('../config/db');
const { runHousekeeping } = require('../jobs/housekeeping');

async function maybeRunHousekeeping(_req, _res, next) {
  try {
    const claim = await pool.query(`
      UPDATE system_runtime_state
         SET state_value=now(), updated_at=now()
       WHERE state_key='last_housekeeping_at'
         AND (state_value IS NULL OR state_value < now() - interval '5 minutes')
      RETURNING state_key
    `);
    if (claim.rows[0]) {
      runHousekeeping().catch(err => console.error('[housekeeping-lazy]', err.message));
    }
  } catch (err) {
    console.error('[housekeeping-tick]', err.message);
  }
  next();
}

module.exports = { maybeRunHousekeeping };
