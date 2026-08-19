import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment configuration.
 *
 * Secrets are intentionally optional so the project can be cloned, installed and
 * tested with a blank .env file. Each feature that truly needs a secret checks for
 * it at the moment of use and fails with an explicit, actionable message
 * (see `assertDatabaseConfigured`, `assertJwtConfigured`, `isCloudinaryConfigured`).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DISPLAY_TIMEZONE: z.string().default('America/La_Paz'),

  MONGODB_URI: z.string().default(''),

  JWT_SECRET: z.string().default(''),
  JWT_EXPIRES_IN: z.string().default('12h'),

  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),
  CLOUDINARY_FOLDER: z.string().default('inocarne'),

  CRON_SECRET: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Configuración de entorno inválida:\n${details}`);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  isDevelopment: raw.NODE_ENV === 'development',
};

export const isCloudinaryConfigured = (): boolean =>
  Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

export function assertDatabaseConfigured(): string {
  if (!env.MONGODB_URI) {
    throw new Error(
      'Falta MONGODB_URI. Copie .env.example a .env y complete la cadena de conexión de MongoDB Atlas.',
    );
  }
  return env.MONGODB_URI;
}

export function assertJwtConfigured(): string {
  if (!env.JWT_SECRET) {
    throw new Error(
      "Falta JWT_SECRET. Genere una clave con: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
    );
  }
  return env.JWT_SECRET;
}
