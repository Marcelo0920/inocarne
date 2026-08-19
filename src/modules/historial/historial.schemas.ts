import { z } from 'zod';
import { SEMAFOROS } from '../../domain/constants.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Identificador inválido');
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato YYYY-MM-DD');

export const TIPOS_HISTORIAL = [
  'recepcion',
  'exhibicion',
  'refrigeracion',
  'limpieza',
  'inspeccion',
  'mantenimiento',
] as const;
export type TipoHistorial = (typeof TIPOS_HISTORIAL)[number];

export const listarHistorialSchema = z
  .object({
    puestoId: objectId.optional(),
    tipo: z.enum(TIPOS_HISTORIAL).optional(),
    semaforo: z.enum(SEMAFOROS).optional(),
    desde: dia.optional(),
    hasta: dia.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((datos) => !datos.desde || !datos.hasta || datos.desde <= datos.hasta, {
    message: 'La fecha inicial no puede ser posterior a la final',
    path: ['desde'],
  });

export type ListarHistorialInput = z.infer<typeof listarHistorialSchema>;
