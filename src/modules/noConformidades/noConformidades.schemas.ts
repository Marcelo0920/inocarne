import { z } from 'zod';
import { ESTADOS_ACCION } from '../../domain/constants.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Identificador inválido');

const evidencia = z.object({
  url: z.string().url('La referencia del archivo no es válida'),
  publicId: z.string().min(1),
});

export const crearNoConformidadSchema = z.object({
  puestoId: objectId.optional(),
  equipoId: objectId.optional(),
  hallazgo: z.string().trim().min(1, 'Describa el hallazgo').max(1000),
  origen: z.string().trim().max(200).optional(),
  evidencia: z.array(evidencia).max(8).default([]),
  accionCorrectiva: z.string().trim().max(1000).optional(),
  responsable: z.string().trim().max(160).optional(),
  fechaLimite: z.coerce.date().optional(),
});

export const actualizarNoConformidadSchema = z
  .object({
    accionCorrectiva: z.string().trim().max(1000).optional(),
    responsable: z.string().trim().max(160).optional(),
    fechaLimite: z.coerce.date().optional(),
    // El cierre tiene su propia ruta, con verificación del supervisor.
    estado: z.enum(['pendiente', 'en_proceso']).optional(),
    evidenciaCierre: z.array(evidencia).max(8).optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, { message: 'No se envió ningún cambio' });

export const cerrarNoConformidadSchema = z.object({
  comentarioCierre: z.string().trim().max(1000).optional(),
  evidenciaCierre: z.array(evidencia).max(8).optional(),
});

export const listarNoConformidadesSchema = z.object({
  puestoId: objectId.optional(),
  estado: z.enum(ESTADOS_ACCION).optional(),
  vencidas: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const idParamSchema = z.object({ id: objectId });

export type CrearNoConformidadInput = z.infer<typeof crearNoConformidadSchema>;
export type ActualizarNoConformidadInput = z.infer<typeof actualizarNoConformidadSchema>;
export type CerrarNoConformidadInput = z.infer<typeof cerrarNoConformidadSchema>;
export type ListarNoConformidadesInput = z.infer<typeof listarNoConformidadesSchema>;
