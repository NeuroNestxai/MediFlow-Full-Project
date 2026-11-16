import { config } from './config.js';
import { buildApp } from './app.js';
import { pool } from './db/pool.js';
import { startListener, stopListener } from './realtime/hub.js';
import { startWorker } from './worker.js';

const app = await buildApp();
await startListener();
const stopWorker = config.RUN_WORKER_IN_PROCESS ? startWorker((m) => app.log.info(m)) : null;
await app.listen({ port: config.PORT, host: config.HOST });

const shutdown = async () => {
  stopWorker?.();
  await app.close();
  await stopListener();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
