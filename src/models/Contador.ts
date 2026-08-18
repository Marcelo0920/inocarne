import { Schema, type Model } from 'mongoose';
import { registrarModelo } from './shared.js';

/** Contador secuencial atómico, usado para numerar las no conformidades. */
export interface Contador {
  clave: string;
  valor: number;
}

const contadorSchema = new Schema<Contador>(
  {
    clave: { type: String, required: true, unique: true },
    valor: { type: Number, required: true, default: 0 },
  },
  { versionKey: false },
);

export const ContadorModel = registrarModelo<Model<Contador>>('Contador', contadorSchema);

/** Devuelve el siguiente número de la secuencia, sin posibilidad de repetirse. */
export async function siguienteNumero(clave: string): Promise<number> {
  const contador = await ContadorModel.findOneAndUpdate(
    { clave },
    { $inc: { valor: 1 } },
    { upsert: true, new: true },
  ).lean();
  return contador!.valor;
}
