/**
 * Deja la base vacía, conservando solo las cuentas que se indican abajo.
 *
 *   npm run limpiar                 informa qué se borraría, sin tocar nada
 *   npm run limpiar -- --confirmar  lo borra de verdad
 *
 * Se recorren las colecciones que existen en la base, no una lista escrita a
 * mano: así no queda nada afuera si mañana se agrega un modelo nuevo.
 *
 * Es una operación sin vuelta atrás. Conviene sacar una copia antes:
 *   mongodump --uri "$MONGODB_URI" --out respaldo
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { UsuarioModel } from '../models/Usuario.js';

/**
 * Las únicas cuentas que sobreviven, por nombre de usuario.
 *
 * El administrador queda porque es el único rol que puede editar los rangos y
 * los horarios, y el único que puede volver a crear cuentas de supervisión: sin
 * él la base limpia no se podría volver a poner en marcha desde la aplicación.
 */
const CUENTAS_QUE_QUEDAN = ['supervisor', 'coordinador', 'admin'];

interface Recuento {
  coleccion: string;
  total: number;
  aBorrar: number;
}

/** Lo que se borra de cada colección: de `usuarios`, todo menos las cuentas que quedan. */
function filtroDe(coleccion: string): Record<string, unknown> {
  return coleccion === UsuarioModel.collection.name
    ? { usuario: { $nin: CUENTAS_QUE_QUEDAN } }
    : {};
}

async function limpiar(): Promise<void> {
  const confirmado = process.argv.includes('--confirmar');

  await connectDatabase();
  const base = mongoose.connection.db;
  if (!base) throw new Error('La conexión no expone la base de datos.');

  console.warn(`Base: ${mongoose.connection.name}`);
  console.warn(`Cuentas que se conservan: ${CUENTAS_QUE_QUEDAN.join(', ')}\n`);

  // Las colecciones internas de MongoDB no son datos de la aplicación.
  const colecciones = (await base.collections()).filter(
    (coleccion) => !coleccion.collectionName.startsWith('system.'),
  );

  const recuentos: Recuento[] = [];
  for (const coleccion of colecciones) {
    const nombre = coleccion.collectionName;
    recuentos.push({
      coleccion: nombre,
      total: await coleccion.countDocuments({}),
      aBorrar: await coleccion.countDocuments(filtroDe(nombre)),
    });
  }

  console.table(recuentos.sort((a, b) => a.coleccion.localeCompare(b.coleccion)));

  const totalABorrar = recuentos.reduce((suma, recuento) => suma + recuento.aBorrar, 0);

  if (!confirmado) {
    console.warn(`\nEnsayo: no se borró nada. Se eliminarían ${totalABorrar} documentos.`);
    console.warn('Para hacerlo de verdad:  npm run limpiar -- --confirmar');
    await disconnectDatabase();
    return;
  }

  for (const coleccion of colecciones) {
    const nombre = coleccion.collectionName;
    const { deletedCount } = await coleccion.deleteMany(filtroDe(nombre));
    console.warn(`${nombre}: ${deletedCount} eliminados`);
  }

  const quedan = await UsuarioModel.find({}, 'usuario rol').lean();
  console.warn(`\nBase limpia. Quedan ${quedan.length} cuentas:`);
  for (const cuenta of quedan) console.warn(`  ${cuenta.usuario} (${cuenta.rol})`);
  console.warn(
    '\nLa configuración se vuelve a crear con los valores por defecto en la primera petición.',
  );

  await disconnectDatabase();
}

limpiar().catch((error: unknown) => {
  console.error('No se pudo limpiar la base', error);
  process.exitCode = 1;
});
