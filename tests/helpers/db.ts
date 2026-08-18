import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let servidor: MongoMemoryServer | null = null;

/**
 * Levanta una instancia de MongoDB en memoria y conecta Mongoose.
 * No hace falta ninguna credencial ni un Atlas real para correr las pruebas.
 */
export async function conectarBaseDePrueba(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  servidor = await MongoMemoryServer.create();
  await mongoose.connect(servidor.getUri(), { dbName: 'inocarne-test' });
}

/** Borra todas las colecciones entre pruebas, sin recrear la conexión. */
export async function limpiarBaseDePrueba(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((coleccion) => coleccion.deleteMany({})));
}

export async function cerrarBaseDePrueba(): Promise<void> {
  await mongoose.disconnect();
  if (servidor) {
    await servidor.stop();
    servidor = null;
  }
}
