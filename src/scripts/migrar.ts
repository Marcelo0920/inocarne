/**
 * Adapta los datos guardados al modelo de controles sin horario.
 *
 *   npm run migrar                  informa qué se cambiaría, sin tocar nada
 *   npm run migrar -- --confirmar   lo aplica de verdad
 *
 * Hay que correrla una vez, con la nueva versión de la API ya desplegada y
 * antes de que los puestos registren controles nuevos: hasta entonces el índice
 * único por franja sigue en la base y rechazaría el segundo control del día.
 *
 * Conviene sacar una copia antes:
 *   mongodump --uri "$MONGODB_URI" --out respaldo
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { migrarControlesSinHorario } from './migraciones/controlesSinHorario.js';

async function migrar(): Promise<void> {
  const confirmado = process.argv.includes('--confirmar');

  await connectDatabase();
  console.warn(`Base: ${mongoose.connection.name}\n`);

  const resultado = await migrarControlesSinHorario(confirmado);

  if (!confirmado) {
    console.warn(
      `Ensayo: no se cambió nada. Hay ${resultado.controlesPendientes} controles con horario ` +
        'programado para adaptar.',
    );
    console.warn('Para hacerlo de verdad:  npm run migrar -- --confirmar');
  } else {
    console.warn(`Controles adaptados: ${resultado.controlesMigrados}`);
    console.warn(
      resultado.indiceViejoEliminado
        ? 'Se eliminó el índice único por franja.'
        : 'El índice único por franja ya no existía.',
    );
    console.warn('Índices sincronizados y horarios quitados de la configuración.');
  }

  await disconnectDatabase();
}

migrar().catch((error: unknown) => {
  console.error('No se pudo completar la migración', error);
  process.exitCode = 1;
});
