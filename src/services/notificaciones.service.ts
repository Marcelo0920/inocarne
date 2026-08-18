import { Types } from 'mongoose';
import {
  NotificacionModel,
  type Notificacion,
  type TipoNotificacion,
} from '../models/Notificacion.js';

export interface NuevaNotificacion {
  puestoId?: string | Types.ObjectId | null;
  paraSupervision?: boolean;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  referencia?: { coleccion: string; documentoId: Types.ObjectId } | null;
  /** Momento en el que el aviso debe estar disponible. Por defecto, ahora. */
  programadaPara?: Date;
}

/** Crea un aviso. Si se programa a futuro, queda pendiente de envío. */
export async function crearNotificacion(entrada: NuevaNotificacion): Promise<Notificacion> {
  const programadaPara = entrada.programadaPara ?? new Date();
  const doc = await NotificacionModel.create({
    puestoId: entrada.puestoId ? new Types.ObjectId(String(entrada.puestoId)) : null,
    paraSupervision: entrada.paraSupervision ?? false,
    tipo: entrada.tipo,
    titulo: entrada.titulo,
    mensaje: entrada.mensaje,
    referencia: entrada.referencia ?? null,
    programadaPara,
    enviada: programadaPara.getTime() <= Date.now(),
    leida: false,
  });
  return doc.toObject();
}

/** Crea el mismo aviso para varios puestos de una sola vez. */
export async function crearNotificaciones(
  puestos: readonly (string | Types.ObjectId)[],
  entrada: Omit<NuevaNotificacion, 'puestoId'>,
): Promise<number> {
  if (puestos.length === 0) return 0;
  const programadaPara = entrada.programadaPara ?? new Date();
  const documentos = puestos.map((puestoId) => ({
    puestoId: new Types.ObjectId(String(puestoId)),
    paraSupervision: entrada.paraSupervision ?? false,
    tipo: entrada.tipo,
    titulo: entrada.titulo,
    mensaje: entrada.mensaje,
    referencia: entrada.referencia ?? null,
    programadaPara,
    enviada: programadaPara.getTime() <= Date.now(),
    leida: false,
  }));
  const creadas = await NotificacionModel.insertMany(documentos);
  return creadas.length;
}

/** Marca como enviados los avisos programados cuyo momento ya llegó. */
export async function despacharPendientes(ahora: Date = new Date()): Promise<number> {
  const resultado = await NotificacionModel.updateMany(
    { enviada: false, programadaPara: { $lte: ahora } },
    { $set: { enviada: true } },
  );
  return resultado.modifiedCount;
}
