import { Schema, Types, type Model } from 'mongoose';
import {
  RESULTADOS_RECEPCION,
  TIPOS_CARNE,
  type ResultadoRecepcion,
  type TipoCarne,
} from '../domain/constants.js';
import { baseSchemaOptions, evidenciaSchema, type Evidencia, registrarModelo } from './shared.js';

export interface CondicionesOrganolepticas {
  color: boolean;
  olor: boolean;
  textura: boolean;
  grasa: boolean;
}

/** Recepción de carne (punto 6). No tiene horario fijo, por eso no se evalúa retraso (R5). */
export interface Recepcion {
  puestoId: Types.ObjectId;
  usuarioId: Types.ObjectId;
  registradoEn: Date;
  dia: string;
  proveedor: string;
  tipoCarne: TipoCarne;
  cantidad: number;
  unidad: string;
  temperatura: number;
  ph: number;
  organolepticas: CondicionesOrganolepticas;
  resultado: ResultadoRecepcion;
  motivoRechazo?: string | null;
  firma?: Evidencia | null;
  fotos: Evidencia[];
  observaciones?: string | null;
  dentroRango: boolean;
  desviaciones: string[];
}

const organolepticasSchema = new Schema<CondicionesOrganolepticas>(
  {
    color: { type: Boolean, required: true },
    olor: { type: Boolean, required: true },
    textura: { type: Boolean, required: true },
    grasa: { type: Boolean, required: true },
  },
  { _id: false },
);

const recepcionSchema = new Schema<Recepcion>(
  {
    puestoId: { type: Schema.Types.ObjectId, ref: 'Puesto', required: true, index: true },
    usuarioId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    // Fecha y hora las pone el servidor, nunca el cliente (regla R1).
    registradoEn: { type: Date, required: true, default: () => new Date(), immutable: true },
    dia: { type: String, required: true },
    proveedor: { type: String, required: true, trim: true, maxlength: 160 },
    tipoCarne: { type: String, required: true, enum: TIPOS_CARNE },
    cantidad: { type: Number, required: true, min: 0 },
    unidad: { type: String, default: 'kg', trim: true, maxlength: 20 },
    temperatura: { type: Number, required: true },
    ph: { type: Number, required: true },
    organolepticas: { type: organolepticasSchema, required: true },
    resultado: { type: String, required: true, enum: RESULTADOS_RECEPCION },
    motivoRechazo: { type: String, trim: true, maxlength: 1000, default: null },
    firma: { type: evidenciaSchema, default: null },
    fotos: { type: [evidenciaSchema], default: [] },
    observaciones: { type: String, trim: true, maxlength: 1000, default: null },
    dentroRango: { type: Boolean, required: true },
    desviaciones: { type: [String], default: [] },
  },
  baseSchemaOptions,
);

recepcionSchema.index({ puestoId: 1, registradoEn: -1 });
recepcionSchema.index({ dia: 1, puestoId: 1 });
recepcionSchema.index({ resultado: 1, registradoEn: -1 });

export const RecepcionModel = registrarModelo<Model<Recepcion>>('Recepcion', recepcionSchema);
