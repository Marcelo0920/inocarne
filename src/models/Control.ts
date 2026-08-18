import { Schema, Types, type Model } from 'mongoose';
import {
  ESTADOS_CONTROL,
  TIPOS_CARNE,
  TIPOS_CONTROL,
  type EstadoControl,
  type TipoCarne,
  type TipoControl,
} from '../domain/constants.js';
import { baseSchemaOptions, registrarModelo } from './shared.js';

/**
 * Control horario programado: exhibición (07:00, 10:30, 13:30) y
 * refrigeración (07:00, 13:30). Puntos 7 y 8.
 */
export interface Control {
  puestoId: Types.ObjectId;
  usuarioId: Types.ObjectId;
  tipo: TipoControl;
  franjaProgramada: string;
  dia: string;
  registradoEn: Date;
  temperatura: number;
  ph?: number | null;
  tipoCarne?: TipoCarne | null;
  dentroRango: boolean;
  desviaciones: string[];
  cumplimiento: EstadoControl;
  observaciones?: string | null;
}

const controlSchema = new Schema<Control>(
  {
    puestoId: { type: Schema.Types.ObjectId, ref: 'Puesto', required: true },
    usuarioId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    tipo: { type: String, required: true, enum: TIPOS_CONTROL },
    franjaProgramada: { type: String, required: true },
    dia: { type: String, required: true },
    registradoEn: { type: Date, required: true, default: () => new Date(), immutable: true },
    temperatura: { type: Number, required: true },
    ph: { type: Number, default: null },
    tipoCarne: { type: String, enum: [...TIPOS_CARNE, null], default: null },
    dentroRango: { type: Boolean, required: true },
    desviaciones: { type: [String], default: [] },
    // Solo puede ser `a_tiempo` o `con_retraso`: los otros dos estados describen
    // la ausencia de registro y por lo tanto se calculan, no se almacenan (R8).
    cumplimiento: { type: String, required: true, enum: ESTADOS_CONTROL },
    observaciones: { type: String, trim: true, maxlength: 1000, default: null },
  },
  baseSchemaOptions,
);

// Impide dos registros del mismo control, el mismo día, en el mismo puesto.
controlSchema.index({ tipo: 1, puestoId: 1, dia: 1, franjaProgramada: 1 }, { unique: true });
controlSchema.index({ puestoId: 1, registradoEn: -1 });
controlSchema.index({ dia: 1, tipo: 1 });

export const ControlModel = registrarModelo<Model<Control>>('Control', controlSchema);
