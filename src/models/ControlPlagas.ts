import { Schema, Types, type Model } from 'mongoose';
import { ESTADOS_PLAGA, type EstadoPlaga } from '../domain/constants.js';
import { baseSchemaOptions, evidenciaSchema, type Evidencia, registrarModelo } from './shared.js';

/** Actividad de control de plagas / fumigación (punto 13). */
export interface ControlPlagas {
  fechaProgramada: Date;
  hora: string;
  tipoActividad: string;
  empresa?: string | null;
  areas: string[];
  puestos: Types.ObjectId[];
  todosLosPuestos: boolean;
  estado: EstadoPlaga;
  fechaRealizada?: Date | null;
  evidencia: Evidencia[];
  observaciones?: string | null;
  avisosEnviados: number[];
  creadoPor: Types.ObjectId;
}

const controlPlagasSchema = new Schema<ControlPlagas>(
  {
    fechaProgramada: { type: Date, required: true },
    hora: { type: String, required: true },
    tipoActividad: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      default: 'Control integral de plagas y roedores',
    },
    empresa: { type: String, trim: true, maxlength: 160, default: null },
    areas: { type: [String], default: [] },
    puestos: { type: [{ type: Schema.Types.ObjectId, ref: 'Puesto' }], default: [] },
    todosLosPuestos: { type: Boolean, default: false },
    estado: { type: String, required: true, enum: ESTADOS_PLAGA, default: 'programada' },
    fechaRealizada: { type: Date, default: null },
    evidencia: { type: [evidenciaSchema], default: [] },
    observaciones: { type: String, trim: true, maxlength: 1000, default: null },
    // Días de antelación ya notificados (7, 3, 1, 0), para no repetir el aviso.
    avisosEnviados: { type: [Number], default: [] },
    creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
  },
  baseSchemaOptions,
);

controlPlagasSchema.index({ estado: 1, fechaProgramada: 1 });

export const ControlPlagasModel = registrarModelo<Model<ControlPlagas>>(
  'ControlPlagas',
  controlPlagasSchema,
);
