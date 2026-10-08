require('dotenv').config();
const app = require('./src/app');
const { pool } = require('./src/config/db');

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`PKN STAN Library System listening on port ${port}`);
});

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    try { await pool.end(); } catch (_) {}
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
