import { Schema, Types, type Model } from 'mongoose';
import { registrarModelo } from './shared.js';

export const ACCIONES_AUDITORIA = ['crear', 'corregir', 'actualizar', 'cerrar'] as const;
export type AccionAuditoria = (typeof ACCIONES_AUDITORIA)[number];

/**
 * Registro de auditoría, solo de inserción (regla R2).
 * Deja constancia de quién creó o corrigió cada registro de control.
 */
export interface Auditoria {
  coleccion: string;
  documentoId: Types.ObjectId;
  accion: AccionAuditoria;
  usuarioId: Types.ObjectId;
  puestoId?: Types.ObjectId | null;
  fecha: Date;
  detalle?: string | null;
}

const auditoriaSchema = new Schema<Auditoria>(
  {
    coleccion: { type: String, required: true },
    documentoId: { type: Schema.Types.ObjectId, required: true },
    accion: { type: String, required: true, enum: ACCIONES_AUDITORIA },
    usuarioId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    puestoId: { type: Schema.Types.ObjectId, ref: 'Puesto', default: null },
    fecha: { type: Date, required: true, default: () => new Date(), immutable: true },
    detalle: { type: String, trim: true, maxlength: 1000, default: null },
  },
  { versionKey: false },
);

auditoriaSchema.index({ coleccion: 1, documentoId: 1 });
auditoriaSchema.index({ usuarioId: 1, fecha: -1 });

export const AuditoriaModel = registrarModelo<Model<Auditoria>>('Auditoria', auditoriaSchema);
