import { Schema, Types, type Model } from 'mongoose';
import { TIPOS_MANTENIMIENTO, type TipoMantenimiento } from '../domain/constants.js';
import { baseSchemaOptions, evidenciaSchema, type Evidencia, registrarModelo } from './shared.js';

/** Mantenimiento realizado sobre un equipo (puntos 10.3 y 10.4). */
export interface Mantenimiento {
  equipoId: Types.ObjectId;
  puestoId: Types.ObjectId;
  usuarioId: Types.ObjectId;
  registradoEn: Date;
  fecha: Date;
  tipo: TipoMantenimiento;
  descripcion: string;
  tecnico?: string | null;
  documentos: Evidencia[];
  fotos: Evidencia[];
  proximoMantenimiento?: Date | null;
  noConformidadId?: Types.ObjectId | null;
  observaciones?: string | null;
}

const mantenimientoSchema = new Schema<Mantenimiento>(
  {
    equipoId: { type: Schema.Types.ObjectId, ref: 'Equipo', required: true },
    puestoId: { type: Schema.Types.ObjectId, ref: 'Puesto', required: true },
    usuarioId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    registradoEn: { type: Date, required: true, default: () => new Date(), immutable: true },
    fecha: { type: Date, required: true },
    tipo: { type: String, required: true, enum: TIPOS_MANTENIMIENTO },
    descripcion: { type: String, required: true, trim: true, maxlength: 1000 },
    tecnico: { type: String, trim: true, maxlength: 160, default: null },
    documentos: { type: [evidenciaSchema], default: [] },
    fotos: { type: [evidenciaSchema], default: [] },
    proximoMantenimiento: { type: Date, default: null },
    noConformidadId: { type: Schema.Types.ObjectId, ref: 'NoConformidad', default: null },
    observaciones: { type: String, trim: true, maxlength: 1000, default: null },
  },
  baseSchemaOptions,
);

mantenimientoSchema.index({ equipoId: 1, fecha: -1 });
mantenimientoSchema.index({ puestoId: 1, fecha: -1 });

export const MantenimientoModel = registrarModelo<Model<Mantenimiento>>(
  'Mantenimiento',
  mantenimientoSchema,
);
