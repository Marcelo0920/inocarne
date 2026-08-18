import { Schema, Types, type Model } from 'mongoose';
import { ESTADOS_ACCION, type EstadoAccion } from '../domain/constants.js';
import { baseSchemaOptions, evidenciaSchema, type Evidencia, registrarModelo } from './shared.js';

/**
 * No conformidad y su acción correctiva (punto 14).
 * Se crea automáticamente desde un "no cumple" de una inspección (regla R7).
 */
export interface NoConformidad {
  numero: number;
  inspeccionId?: Types.ObjectId | null;
  puestoId?: Types.ObjectId | null;
  supervisorId: Types.ObjectId;
  hallazgo: string;
  origen: string;
  detectadaEn: Date;
  evidencia: Evidencia[];
  accionCorrectiva?: string | null;
  responsable?: string | null;
  fechaLimite?: Date | null;
  estado: EstadoAccion;
  evidenciaCierre: Evidencia[];
  verificadaPor?: Types.ObjectId | null;
  verificadaEn?: Date | null;
  comentarioCierre?: string | null;
  equipoId?: Types.ObjectId | null;
}

const noConformidadSchema = new Schema<NoConformidad>(
  {
    numero: { type: Number, required: true, unique: true },
    inspeccionId: { type: Schema.Types.ObjectId, ref: 'Inspeccion', default: null },
    puestoId: { type: Schema.Types.ObjectId, ref: 'Puesto', default: null },
    supervisorId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    hallazgo: { type: String, required: true, trim: true, maxlength: 1000 },
    origen: { type: String, required: true, trim: true, maxlength: 200 },
    detectadaEn: { type: Date, required: true, default: () => new Date(), immutable: true },
    evidencia: { type: [evidenciaSchema], default: [] },
    accionCorrectiva: { type: String, trim: true, maxlength: 1000, default: null },
    responsable: { type: String, trim: true, maxlength: 160, default: null },
    fechaLimite: { type: Date, default: null },
    estado: { type: String, required: true, enum: ESTADOS_ACCION, default: 'pendiente' },
    evidenciaCierre: { type: [evidenciaSchema], default: [] },
    verificadaPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
    verificadaEn: { type: Date, default: null },
    comentarioCierre: { type: String, trim: true, maxlength: 1000, default: null },
    equipoId: { type: Schema.Types.ObjectId, ref: 'Equipo', default: null },
  },
  baseSchemaOptions,
);

noConformidadSchema.index({ estado: 1, fechaLimite: 1 });
noConformidadSchema.index({ puestoId: 1, detectadaEn: -1 });

export const NoConformidadModel = registrarModelo<Model<NoConformidad>>(
  'NoConformidad',
  noConformidadSchema,
);
