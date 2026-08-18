import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/error.js';
import { apiRouter } from './routes.js';

/**
 * Construye la aplicación Express sin ponerla a escuchar.
 * Las pruebas la importan directamente; `server.ts` es el único que abre el puerto.
 */
export function crearApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins.length ? env.corsOrigins : true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (!env.isTest) {
    app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  }

  // Comprobación de vida: también sirve para que el ping programado
  // mantenga despierto el servidor del plan gratuito.
  app.get('/health', (_req, res) => {
    res.json({ estado: 'ok', servicio: 'inocarne-api', fecha: new Date().toISOString() });
  });

  app.use('/api', apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
