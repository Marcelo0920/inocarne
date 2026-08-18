import { Schema, Types, type Model } from 'mongoose';
import { TURNOS_LIMPIEZA, type TurnoLimpieza } from '../domain/constants.js';
import {
  baseSchemaOptions,
  evidenciaSchema,
  itemChecklistSchema,
  type Evidencia,
  type ItemChecklist,
  registrarModelo,
} from './shared.js';

/** Checklist de limpieza y desinfección, dos veces al día (punto 9). */
export interface Limpieza {
  puestoId: Types.ObjectId;
  usuarioId: Types.ObjectId;
  turno: TurnoLimpieza;
  dia: string;
  registradoEn: Date;
  items: ItemChecklist[];
  observaciones?: string | null;
  fotos: Evidencia[];
  cumple: boolean;
  incumplimientos: string[];
}

const limpiezaSchema = new Schema<Limpieza>(
  {
    puestoId: { type: Schema.Types.ObjectId, ref: 'Puesto', required: true },
    usuarioId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    turno: { type: String, required: true, enum: TURNOS_LIMPIEZA },
    dia: { type: String, required: true },
    registradoEn: { type: Date, required: true, default: () => new Date(), immutable: true },
    items: { type: [itemChecklistSchema], required: true },
    observaciones: { type: String, trim: true, maxlength: 1000, default: null },
    fotos: { type: [evidenciaSchema], default: [] },
    cumple: { type: Boolean, required: true },
    incumplimientos: { type: [String], default: [] },
  },
  baseSchemaOptions,
);

// Un solo checklist por turno, puesto y día.
limpiezaSchema.index({ puestoId: 1, dia: 1, turno: 1 }, { unique: true });
limpiezaSchema.index({ puestoId: 1, registradoEn: -1 });

export const LimpiezaModel = registrarModelo<Model<Limpieza>>('Limpieza', limpiezaSchema);
