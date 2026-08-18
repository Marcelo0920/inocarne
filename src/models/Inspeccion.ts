import { Schema, Types, type Model } from 'mongoose';
import {
  TIPOS_CARNE,
  TIPOS_INSPECCION,
  type TipoCarne,
  type TipoInspeccion,
} from '../domain/constants.js';
import {
  baseSchemaOptions,
  evidenciaSchema,
  itemChecklistSchema,
  type Evidencia,
  type ItemChecklist,
  registrarModelo,
} from './shared.js';

/** Medición tomada por el supervisor durante una inspección (punto 11.3). */
export interface MedicionInspeccion {
  temperatura?: number | null;
  ph?: number | null;
  tipoCarne?: TipoCarne | null;
  dentroRango: boolean;
  desviaciones: string[];
}

/** Inspección del supervisor: del mercado o de un puesto (punto 11). */
export interface Inspeccion {
  tipo: TipoInspeccion;
  supervisorId: Types.ObjectId;
  puestoId?: Types.ObjectId | null;
  registradoEn: Date;
  dia: string;
  items: ItemChecklist[];
  medicion?: MedicionInspeccion | null;
  observaciones?: string | null;
  fotos: Evidencia[];
  cumple: boolean;
  incumplimientos: string[];
}

const medicionSchema = new Schema<MedicionInspeccion>(
  {
    temperatura: { type: Number, default: null },
    ph: { type: Number, default: null },
    tipoCarne: { type: String, enum: [...TIPOS_CARNE, null], default: null },
    dentroRango: { type: Boolean, default: true },
    desviaciones: { type: [String], default: [] },
  },
  { _id: false },
);

const inspeccionSchema = new Schema<Inspeccion>(
  {
    tipo: { type: String, required: true, enum: TIPOS_INSPECCION },
    supervisorId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    puestoId: { type: Schema.Types.ObjectId, ref: 'Puesto', default: null },
    registradoEn: { type: Date, required: true, default: () => new Date(), immutable: true },
    dia: { type: String, required: true },
    items: { type: [itemChecklistSchema], required: true },
    medicion: { type: medicionSchema, default: null },
    observaciones: { type: String, trim: true, maxlength: 2000, default: null },
    fotos: { type: [evidenciaSchema], default: [] },
    cumple: { type: Boolean, required: true },
    incumplimientos: { type: [String], default: [] },
  },
  baseSchemaOptions,
);

// Una inspección de puesto exige indicar el puesto; la del mercado no lo lleva.
inspeccionSchema.pre('validate', function (next) {
  if (this.tipo === 'puesto' && !this.puestoId) {
    next(new Error('Una inspección de puesto debe indicar el puesto inspeccionado.'));
    return;
  }
  if (this.tipo === 'mercado' && this.puestoId) this.puestoId = null;
  next();
});

inspeccionSchema.index({ tipo: 1, registradoEn: -1 });
inspeccionSchema.index({ puestoId: 1, registradoEn: -1 });

export const InspeccionModel = registrarModelo<Model<Inspeccion>>('Inspeccion', inspeccionSchema);
