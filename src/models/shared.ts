import mongoose, { Schema } from 'mongoose';

/** Archivo almacenado en Cloudinary. La base solo guarda la referencia, nunca la imagen. */
export interface Evidencia {
  url: string;
  publicId: string;
  subidoEn: Date;
}

export const evidenciaSchema = new Schema<Evidencia>(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, required: true, trim: true },
    subidoEn: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

/** Punto de un checklist: cumple o no cumple, con comentario opcional. */
export interface ItemChecklist {
  nombre: string;
  cumple: boolean;
  comentario?: string;
}

export const itemChecklistSchema = new Schema<ItemChecklist>(
  {
    nombre: { type: String, required: true, trim: true },
    cumple: { type: Boolean, required: true },
    comentario: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false },
);

/**
 * Opciones comunes: marcas de tiempo automáticas y una salida JSON limpia
 * (`id` en lugar de `_id`, sin `__v`).
 */
export const baseSchemaOptions = {
  timestamps: true,
  versionKey: false as const,
  toJSON: {
    virtuals: true,
    transform: (_doc: unknown, ret: Record<string, unknown>) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.passwordHash;
      return ret;
    },
  },
  toObject: { virtuals: true },
};

/**
 * Registra un modelo una sola vez.
 * Evita el error "Cannot overwrite model once compiled" cuando el módulo se
 * vuelve a evaluar: pruebas aisladas, recarga en caliente o scripts sueltos.
 */
export function registrarModelo<TModel>(nombre: string, schema: Schema): TModel {
  return (
    (mongoose.models[nombre] as TModel | undefined) ?? (mongoose.model(nombre, schema) as TModel)
  );
}
