import { crearApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

async function iniciar(): Promise<void> {
  await connectDatabase();

  const app = crearApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`INOCARNE API escuchando en el puerto ${env.PORT} (${env.NODE_ENV})`);
  });

  const cerrar = (senal: string) => {
    logger.info(`${senal} recibido, cerrando el servidor...`);
    server.close(() => {
      void disconnectDatabase().then(() => process.exit(0));
    });
  };

  process.on('SIGTERM', () => cerrar('SIGTERM'));
  process.on('SIGINT', () => cerrar('SIGINT'));
}

iniciar().catch((error: unknown) => {
  logger.error('No se pudo iniciar el servidor', error);
  process.exit(1);
});
