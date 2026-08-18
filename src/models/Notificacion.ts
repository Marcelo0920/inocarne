import { Schema, Types, type Model } from 'mongoose';
import { baseSchemaOptions, registrarModelo } from './shared.js';

export const TIPOS_NOTIFICACION = [
  'control_plagas',
  'capacitacion',
  'control_pendiente',
  'mantenimiento',
  'accion_correctiva',
  'recepcion_rechazada',
  'general',
] as const;
export type TipoNotificacion = (typeof TIPOS_NOTIFICACION)[number];

export interface ReferenciaNotificacion {
  coleccion: string;
  documentoId: Types.ObjectId;
}

/** Aviso dirigido a un puesto o a la supervisión (parte 6 del brief funcional). */
export interface Notificacion {
  puestoId?: Types.ObjectId | null;
  paraSupervision: boolean;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  referencia?: ReferenciaNotificacion | null;
  programadaPara: Date;
  enviada: boolean;
  leida: boolean;
  leidaEn?: Date | null;
}

const referenciaSchema = new Schema<ReferenciaNotificacion>(
  {
    coleccion: { type: String, required: true },
    documentoId: { type: Schema.Types.ObjectId, required: true },
  },
  { _id: false },
);

const notificacionSchema = new Schema<Notificacion>(
  {
    puestoId: { type: Schema.Types.ObjectId, ref: 'Puesto', default: null },
    paraSupervision: { type: Boolean, default: false },
    tipo: { type: String, required: true, enum: TIPOS_NOTIFICACION },
    titulo: { type: String, required: true, trim: true, maxlength: 200 },
    mensaje: { type: String, required: true, trim: true, maxlength: 1000 },
    referencia: { type: referenciaSchema, default: null },
    // Permite programar un aviso con antelación (7 días, 3 días, 24 h, mismo día).
    programadaPara: { type: Date, required: true, default: () => new Date() },
    enviada: { type: Boolean, default: true },
    leida: { type: Boolean, default: false },
    leidaEn: { type: Date, default: null },
  },
  baseSchemaOptions,
);

notificacionSchema.index({ puestoId: 1, leida: 1, programadaPara: -1 });
notificacionSchema.index({ enviada: 1, programadaPara: 1 });

export const NotificacionModel = registrarModelo<Model<Notificacion>>(
  'Notificacion',
  notificacionSchema,
);
