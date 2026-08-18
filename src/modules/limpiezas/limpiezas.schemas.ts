import { z } from 'zod';
import { TURNOS_LIMPIEZA } from '../../domain/constants.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Identificador inválido');
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato YYYY-MM-DD');

const evidencia = z.object({
  url: z.string().url('La referencia del archivo no es válida'),
  publicId: z.string().min(1),
});

export const crearLimpiezaSchema = z.object({
  puestoId: objectId.optional(),
  turno: z.enum(TURNOS_LIMPIEZA, { errorMap: () => ({ message: 'Indique el turno de limpieza' }) }),
  items: z
    .array(
      z.object({
        nombre: z.string().trim().min(1),
        cumple: z.boolean(),
        comentario: z.string().trim().max(500).optional(),
      }),
    )
    .min(1, 'El checklist no puede estar vacío'),
  observaciones: z.string().trim().max(1000).optional(),
  fotos: z.array(evidencia).max(5).default([]),
});

export const listarLimpiezasSchema = z.object({
  puestoId: objectId.optional(),
  turno: z.enum(TURNOS_LIMPIEZA).optional(),
  desde: dia.optional(),
  hasta: dia.optional(),
  cumple: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const limpiezaDelDiaSchema = z.object({
  puestoId: objectId.optional(),
  dia: dia.optional(),
});

export type CrearLimpiezaInput = z.infer<typeof crearLimpiezaSchema>;
export type ListarLimpiezasInput = z.infer<typeof listarLimpiezasSchema>;
