import { z } from 'zod';
import { TIPOS_CARNE, TIPOS_INSPECCION } from '../../domain/constants.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Identificador inválido');
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato YYYY-MM-DD');

const evidencia = z.object({
  url: z.string().url('La referencia del archivo no es válida'),
  publicId: z.string().min(1),
});

export const crearInspeccionSchema = z
  .object({
    tipo: z.enum(TIPOS_INSPECCION),
    puestoId: objectId.optional(),
    items: z
      .array(
        z.object({
          nombre: z.string().trim().min(1),
          cumple: z.boolean(),
          comentario: z.string().trim().max(500).optional(),
        }),
      )
      .min(1, 'La inspección no puede estar vacía'),
    medicion: z
      .object({
        temperatura: z.number().optional(),
        ph: z.number().optional(),
        tipoCarne: z.enum(TIPOS_CARNE).optional(),
      })
      .optional(),
    observaciones: z.string().trim().max(2000).optional(),
    fotos: z.array(evidencia).max(8).default([]),
  })
  .refine((datos) => datos.tipo !== 'puesto' || Boolean(datos.puestoId), {
    message: 'Indique el puesto inspeccionado',
    path: ['puestoId'],
  })
  // Sin el tipo de carne no hay rango de pH contra el que comparar.
  .refine((datos) => datos.medicion?.ph === undefined || Boolean(datos.medicion?.tipoCarne), {
    message: 'Indique el tipo de carne para poder evaluar el pH',
    path: ['medicion', 'tipoCarne'],
  });

export const listarInspeccionesSchema = z.object({
  tipo: z.enum(TIPOS_INSPECCION).optional(),
  puestoId: objectId.optional(),
  desde: dia.optional(),
  hasta: dia.optional(),
  cumple: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const idParamSchema = z.object({ id: objectId });

export type CrearInspeccionInput = z.infer<typeof crearInspeccionSchema>;
export type ListarInspeccionesInput = z.infer<typeof listarInspeccionesSchema>;
