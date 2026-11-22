import { Schema, Types, type Model } from 'mongoose';
import {
  TIPOS_CARNE,
  TIPOS_CONTROL,
  type TipoCarne,
  type TipoControl,
} from '../domain/constants.js';
import { baseSchemaOptions, registrarModelo } from './shared.js';

/**
 * Control diario de exhibición y de refrigeración (puntos 7 y 8).
 *
 * No tiene horario fijo: el vendedor lo hace cuando puede y la hora que se
 * muestra es la de su teléfono (`horaDispositivo`). La hora del servidor
 * (`registradoEn`) se guarda igual, inmutable, pero no se muestra: sirve para
 * auditar si la hora del teléfono no coincide.
 */
export interface Control {
  puestoId: Types.ObjectId;
  usuarioId: Types.ObjectId;
  tipo: TipoControl;
  /** Número del control dentro del día y del tipo: 1, 2, 3… Lo asigna el servidor. */
  numero: number;
  /** Día local del mercado, calculado desde la hora del teléfono. */
  dia: string;
  /** Hora del teléfono o de la computadora al guardar. Es la que se muestra. */
  horaDispositivo: Date;
  /** Hora del servidor al recibirlo. No se muestra; queda para auditoría. */
  registradoEn: Date;
  temperatura: number;
  ph?: number | null;
  tipoCarne?: TipoCarne | null;
  dentroRango: boolean;
  desviaciones: string[];
  observaciones?: string | null;
}

const controlSchema = new Schema<Control>(
  {
    puestoId: { type: Schema.Types.ObjectId, ref: 'Puesto', required: true },
    usuarioId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    tipo: { type: String, required: true, enum: TIPOS_CONTROL },
    numero: { type: Number, required: true, min: 1 },
    dia: { type: String, required: true },
    horaDispositivo: { type: Date, required: true, immutable: true },
    registradoEn: { type: Date, required: true, default: () => new Date(), immutable: true },
    temperatura: { type: Number, required: true },
    ph: { type: Number, default: null },
    tipoCarne: { type: String, enum: [...TIPOS_CARNE, null], default: null },
    dentroRango: { type: Boolean, required: true },
    desviaciones: { type: [String], default: [] },
    observaciones: { type: String, trim: true, maxlength: 1000, default: null },
  },
  baseSchemaOptions,
);

// Impide que dos registros ocupen el mismo número del día en el mismo puesto.
controlSchema.index({ tipo: 1, puestoId: 1, dia: 1, numero: 1 }, { unique: true });
// Un reenvío de la cola trae la misma hora del teléfono: así no se duplica.
controlSchema.index({ tipo: 1, puestoId: 1, horaDispositivo: 1 }, { unique: true });
controlSchema.index({ puestoId: 1, horaDispositivo: -1 });
controlSchema.index({ dia: 1, tipo: 1 });

export const ControlModel = registrarModelo<Model<Control>>('Control', controlSchema);
