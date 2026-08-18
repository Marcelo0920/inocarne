import { Schema, type InferSchemaType, type Model } from 'mongoose';
import { baseSchemaOptions, registrarModelo } from './shared.js';

const puestoSchema = new Schema(
  {
    numero: { type: Number, required: true, unique: true, min: 1 },
    nombre: { type: String, required: true, trim: true, maxlength: 120 },
    responsable: { type: String, trim: true, maxlength: 120 },
    activo: { type: Boolean, default: true },
  },
  baseSchemaOptions,
);

puestoSchema.index({ activo: 1, numero: 1 });

export type Puesto = InferSchemaType<typeof puestoSchema>;
export const PuestoModel = registrarModelo<Model<Puesto>>('Puesto', puestoSchema);
