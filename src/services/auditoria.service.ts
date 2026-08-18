import { Types } from 'mongoose';
import { AuditoriaModel, type AccionAuditoria } from '../models/Auditoria.js';
import { logger } from '../config/logger.js';

interface EntradaAuditoria {
  coleccion: string;
  documentoId: Types.ObjectId;
  accion: AccionAuditoria;
  usuarioId: string | Types.ObjectId;
  puestoId?: string | Types.ObjectId | null;
  detalle?: string;
}

/**
 * Deja constancia de una operación (regla R2).
 * Nunca interrumpe la petición: si la auditoría falla, se registra en el log
 * pero el registro de control ya guardado sigue siendo válido.
 */
export async function auditar(entrada: EntradaAuditoria): Promise<void> {
  try {
    await AuditoriaModel.create({
      coleccion: entrada.coleccion,
      documentoId: entrada.documentoId,
      accion: entrada.accion,
      usuarioId: new Types.ObjectId(String(entrada.usuarioId)),
      puestoId: entrada.puestoId ? new Types.ObjectId(String(entrada.puestoId)) : null,
      fecha: new Date(),
      detalle: entrada.detalle ?? null,
    });
  } catch (error) {
    logger.error('No se pudo registrar la auditoría', error);
  }
}
