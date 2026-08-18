import { z } from 'zod';
import { TIPOS_CARNE, TIPOS_CONTROL } from '../../domain/constants.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Identificador inválido');
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use el formato HH:mm');
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato YYYY-MM-DD');

export const crearControlSchema = z
  .object({
    puestoId: objectId.optional(),
    tipo: z.enum(TIPOS_CONTROL),
    franjaProgramada: hora,
    temperatura: z.number({ invalid_type_error: 'Ingrese la temperatura' }),
    ph: z.number().optional(),
    tipoCarne: z.enum(TIPOS_CARNE).optional(),
    observaciones: z.string().trim().max(1000).optional(),
  })
  // El control de exhibición mide carne, así que necesita pH y tipo de carne;
  // el de refrigeración mide el equipo y solo lleva temperatura.
  .refine((datos) => datos.tipo !== 'exhibicion' || typeof datos.ph === 'number', {
    message: 'El control de exhibición requiere el pH',
    path: ['ph'],
  })
  .refine((datos) => datos.tipo !== 'exhibicion' || Boolean(datos.tipoCarne), {
    message: 'Indique el tipo de carne para poder evaluar el pH',
    path: ['tipoCarne'],
  });

export const listarControlesSchema = z.object({
  puestoId: objectId.optional(),
  tipo: z.enum(TIPOS_CONTROL).optional(),
  desde: dia.optional(),
  hasta: dia.optional(),
  cumplimiento: z.enum(['a_tiempo', 'con_retraso']).optional(),
  dentroRango: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const controlesDelDiaSchema = z.object({
  puestoId: objectId.optional(),
  dia: dia.optional(),
});

export type CrearControlInput = z.infer<typeof crearControlSchema>;
export type ListarControlesInput = z.infer<typeof listarControlesSchema>;
