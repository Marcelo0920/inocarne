import mongoose from 'mongoose';
import { assertDatabaseConfigured } from './env.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);

export async function connectDatabase(uri?: string): Promise<typeof mongoose> {
  const connectionString = uri ?? assertDatabaseConfigured();
  const connection = await mongoose.connect(connectionString, {
    serverSelectionTimeoutMS: 10_000,
    autoIndex: true,
  });
  logger.info(`MongoDB conectado: ${connection.connection.name}`);
  return connection;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
