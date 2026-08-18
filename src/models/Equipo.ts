import { Schema, Types, type Model } from 'mongoose';
import { TIPOS_MANTENIMIENTO, type TipoMantenimiento } from '../domain/constants.js';
import { baseSchemaOptions, evidenciaSchema, type Evidencia, registrarModelo } from './shared.js';

/** Equipo del puesto que requiere mantenimiento (punto 10.1). */
export interface Equipo {
  puestoId: Types.ObjectId;
  codigo: string;
  nombre: string;
  marca?: string | null;
  modelo?: string | null;
  numeroSerie?: string | null;
  ubicacion?: string | null;
  estado: string;
  ultimoMantenimiento?: Date | null;
  tipoUltimoMantenimiento?: TipoMantenimiento | null;
  proximoMantenimiento?: Date | null;
  observaciones?: string | null;
  foto?: Evidencia | null;
  documento?: Evidencia | null;
  activo: boolean;
}

const equipoSchema = new Schema<Equipo>(
  {
    puestoId: { type: Schema.Types.ObjectId, ref: 'Puesto', required: true },
    codigo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    nombre: { type: String, required: true, trim: true, maxlength: 120 },
    marca: { type: String, trim: true, maxlength: 80, default: null },
    modelo: { type: String, trim: true, maxlength: 80, default: null },
    numeroSerie: { type: String, trim: true, maxlength: 80, default: null },
    ubicacion: { type: String, trim: true, maxlength: 120, default: null },
    estado: { type: String, trim: true, maxlength: 60, default: 'operativo' },
    ultimoMantenimiento: { type: Date, default: null },
    tipoUltimoMantenimiento: { type: String, enum: [...TIPOS_MANTENIMIENTO, null], default: null },
    proximoMantenimiento: { type: Date, default: null },
    observaciones: { type: String, trim: true, maxlength: 1000, default: null },
    foto: { type: evidenciaSchema, default: null },
    documento: { type: evidenciaSchema, default: null },
    activo: { type: Boolean, default: true },
  },
  baseSchemaOptions,
);

equipoSchema.index({ puestoId: 1, activo: 1 });
equipoSchema.index({ proximoMantenimiento: 1 });

export const EquipoModel = registrarModelo<Model<Equipo>>('Equipo', equipoSchema);
