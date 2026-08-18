import { z } from 'zod';
import { RESULTADOS_RECEPCION, TIPOS_CARNE } from '../../domain/constants.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Identificador inválido');

export const evidenciaSchema = z.object({
  url: z.string().url('La referencia del archivo no es válida'),
  publicId: z.string().min(1),
});

export const crearRecepcionSchema = z
  .object({
    // Solo la supervisión puede indicarlo; el vendedor siempre registra en su puesto.
    puestoId: objectId.optional(),
    proveedor: z.string().trim().min(1, 'Indique el proveedor').max(160),
    tipoCarne: z.enum(TIPOS_CARNE, {
      errorMap: () => ({ message: 'Seleccione el tipo de carne' }),
    }),
    cantidad: z.number().min(0, 'La cantidad no puede ser negativa'),
    unidad: z.string().trim().max(20).default('kg'),
    temperatura: z.number({ invalid_type_error: 'Ingrese la temperatura' }),
    ph: z.number({ invalid_type_error: 'Ingrese el pH' }),
    organolepticas: z.object({
      color: z.boolean(),
      olor: z.boolean(),
      textura: z.boolean(),
      grasa: z.boolean(),
    }),
    resultado: z.enum(RESULTADOS_RECEPCION),
    motivoRechazo: z.string().trim().max(1000).optional(),
    firma: evidenciaSchema,
    fotos: z.array(evidenciaSchema).max(5).default([]),
    observaciones: z.string().trim().max(1000).optional(),
  })
  .refine((datos) => datos.resultado !== 'rechazado' || Boolean(datos.motivoRechazo), {
    message: 'Si la carne es rechazada debe indicar el motivo',
    path: ['motivoRechazo'],
  });

export const listarRecepcionesSchema = z.object({
  puestoId: objectId.optional(),
  desde: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  hasta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  resultado: z.enum(RESULTADOS_RECEPCION).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type CrearRecepcionInput = z.infer<typeof crearRecepcionSchema>;
export type ListarRecepcionesInput = z.infer<typeof listarRecepcionesSchema>;
