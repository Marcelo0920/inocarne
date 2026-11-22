import type { AnyBulkWriteOperation, Document } from 'mongodb';
import { ConfiguracionModel } from '../../models/Configuracion.js';
import { ControlModel } from '../../models/Control.js';

/**
 * Pasa los controles guardados con horario programado al modelo sin horario.
 *
 * Antes cada control ocupaba una franja (`franjaProgramada`) y guardaba su
 * puntualidad (`cumplimiento`). Ahora se numera dentro del día y se muestra con
 * la hora del teléfono (`horaDispositivo`). Para los registros viejos esa hora
 * no existe, así que se usa la hora en que el servidor los recibió.
 *
 * El orden importa:
 *  1. Se elimina el índice único por franja: al quitar la franja, dos controles
 *     del mismo día chocarían en él.
 *  2. Se numeran los controles por hora de registro y se quitan los campos viejos.
 *  3. Se sincronizan los índices con el modelo actual, que ya no encuentra
 *     controles sin número ni hora del teléfono.
 *
 * Es idempotente: una segunda ejecución no encuentra nada pendiente.
 */

export interface ResultadoMigracion {
  controlesPendientes: number;
  controlesMigrados: number;
  indiceViejoEliminado: boolean;
}

const CAMPOS_VIEJOS_CONFIGURACION = {
  horariosExhibicion: '',
  horariosRefrigeracion: '',
  toleranciaMinutos: '',
};

export async function migrarControlesSinHorario(confirmar: boolean): Promise<ResultadoMigracion> {
  const coleccion = ControlModel.collection;

  const pendientes = await coleccion
    .find({ numero: { $exists: false } })
    .sort({ registradoEn: 1 })
    .toArray();
  const indiceViejo = (await coleccion.indexes()).find(
    (indice) => indice.key && 'franjaProgramada' in indice.key,
  );

  if (!confirmar) {
    return {
      controlesPendientes: pendientes.length,
      controlesMigrados: 0,
      indiceViejoEliminado: false,
    };
  }

  if (indiceViejo?.name) await coleccion.dropIndex(indiceViejo.name);

  // Números ya ocupados en cada puesto, tipo y día (por registros nuevos, si los hay).
  const ocupados = new Map<string, Set<number>>();
  const claveDe = (control: Document): string =>
    `${String(control.puestoId)}|${String(control.tipo)}|${String(control.dia)}`;

  const yaNumerados = await coleccion
    .find(
      { numero: { $exists: true } },
      { projection: { puestoId: 1, tipo: 1, dia: 1, numero: 1 } },
    )
    .toArray();
  for (const control of yaNumerados) {
    const clave = claveDe(control);
    if (!ocupados.has(clave)) ocupados.set(clave, new Set());
    ocupados.get(clave)!.add(Number(control.numero));
  }

  const operaciones: AnyBulkWriteOperation[] = pendientes.map((control) => {
    const clave = claveDe(control);
    if (!ocupados.has(clave)) ocupados.set(clave, new Set());
    const usados = ocupados.get(clave)!;
    let numero = 1;
    while (usados.has(numero)) numero += 1;
    usados.add(numero);

    return {
      updateOne: {
        filter: { _id: control._id },
        update: {
          $set: { numero, horaDispositivo: control.registradoEn },
          $unset: { franjaProgramada: '', cumplimiento: '' },
        },
      },
    };
  });

  if (operaciones.length > 0) await coleccion.bulkWrite(operaciones);

  // La cantidad de horarios que había configurado el administrador pasa a ser la
  // cantidad de controles por día, salvo que ya exista una cantidad propia.
  const configuraciones = await ConfiguracionModel.collection.find({}).toArray();
  for (const configuracion of configuraciones) {
    const cantidades: Record<string, number> = {};
    const exhibicion = configuracion.horariosExhibicion as unknown;
    const refrigeracion = configuracion.horariosRefrigeracion as unknown;
    if (
      Array.isArray(exhibicion) &&
      exhibicion.length > 0 &&
      !configuracion.controlesExhibicionPorDia
    ) {
      cantidades.controlesExhibicionPorDia = Math.min(exhibicion.length, 12);
    }
    if (
      Array.isArray(refrigeracion) &&
      refrigeracion.length > 0 &&
      !configuracion.controlesRefrigeracionPorDia
    ) {
      cantidades.controlesRefrigeracionPorDia = Math.min(refrigeracion.length, 12);
    }
    await ConfiguracionModel.collection.updateOne(
      { _id: configuracion._id },
      Object.keys(cantidades).length > 0
        ? { $set: cantidades, $unset: CAMPOS_VIEJOS_CONFIGURACION }
        : { $unset: CAMPOS_VIEJOS_CONFIGURACION },
    );
  }
  await ControlModel.syncIndexes();

  return {
    controlesPendientes: pendientes.length,
    controlesMigrados: operaciones.length,
    indiceViejoEliminado: Boolean(indiceViejo),
  };
}
