import { pool } from './db/pool.js';
import { startWorker } from './worker.js';

const stop = startWorker();
const shutdown = async () => { stop(); await pool.end(); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
