import { Schema, Types, type Model } from 'mongoose';
import { ESTADOS_CAPACITACION, type EstadoCapacitacion } from '../domain/constants.js';
import { baseSchemaOptions, evidenciaSchema, type Evidencia, registrarModelo } from './shared.js';

export interface Participante {
  puestoId?: Types.ObjectId | null;
  nombre: string;
  asistio: boolean;
}

/** Capacitación programada por el supervisor (punto 12). */
export interface Capacitacion {
  tema: string;
  fechaProgramada: Date;
  hora: string;
  lugar?: string | null;
  capacitador?: string | null;
  puestos: Types.ObjectId[];
  participantes: Participante[];
  fechaRealizada?: Date | null;
  estado: EstadoCapacitacion;
  evidencia: Evidencia[];
  observaciones?: string | null;
  creadoPor: Types.ObjectId;
}

const participanteSchema = new Schema<Participante>(
  {
    puestoId: { type: Schema.Types.ObjectId, ref: 'Puesto', default: null },
    nombre: { type: String, required: true, trim: true, maxlength: 120 },
    asistio: { type: Boolean, default: false },
  },
  { _id: false },
);

const capacitacionSchema = new Schema<Capacitacion>(
  {
    tema: { type: String, required: true, trim: true, maxlength: 200 },
    fechaProgramada: { type: Date, required: true },
    hora: { type: String, required: true },
    lugar: { type: String, trim: true, maxlength: 160, default: null },
    capacitador: { type: String, trim: true, maxlength: 160, default: null },
    puestos: { type: [{ type: Schema.Types.ObjectId, ref: 'Puesto' }], default: [] },
    participantes: { type: [participanteSchema], default: [] },
    fechaRealizada: { type: Date, default: null },
    estado: { type: String, required: true, enum: ESTADOS_CAPACITACION, default: 'programada' },
    evidencia: { type: [evidenciaSchema], default: [] },
    observaciones: { type: String, trim: true, maxlength: 1000, default: null },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
  },
  baseSchemaOptions,
);

capacitacionSchema.index({ estado: 1, fechaProgramada: 1 });

export const CapacitacionModel = registrarModelo<Model<Capacitacion>>(
  'Capacitacion',
  capacitacionSchema,
);
