/**
 * Variables de entorno de la suite de pruebas.
 * Se ejecuta antes de importar cualquier módulo de la aplicación, de modo que
 * `src/config/env.ts` lea estos valores y no dependa del archivo .env real.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'clave-de-prueba-no-usar-en-produccion';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DISPLAY_TIMEZONE = 'America/La_Paz';
process.env.CRON_SECRET = 'cron-de-prueba';
process.env.CORS_ORIGINS = 'http://localhost:5173';
