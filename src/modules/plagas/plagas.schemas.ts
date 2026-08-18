import { z } from 'zod';
import { ESTADOS_PLAGA } from '../../domain/constants.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Identificador inválido');
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use el formato HH:mm');

const evidencia = z.object({
  url: z.string().url('La referencia del archivo no es válida'),
  publicId: z.string().min(1),
});

export const crearPlagaSchema = z.object({
  fechaProgramada: z.coerce.date(),
  hora,
  tipoActividad: z.string().trim().max(200).optional(),
  empresa: z.string().trim().max(160).optional(),
  areas: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  puestos: z.array(objectId).optional(),
  todosLosPuestos: z.boolean().optional(),
  observaciones: z.string().trim().max(1000).optional(),
});

export const actualizarPlagaSchema = z
  .object({
    fechaProgramada: z.coerce.date().optional(),
    hora: hora.optional(),
    tipoActividad: z.string().trim().max(200).optional(),
    empresa: z.string().trim().max(160).optional(),
    areas: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
    puestos: z.array(objectId).optional(),
    observaciones: z.string().trim().max(1000).optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, { message: 'No se envió ningún cambio' });

export const registrarRealizadaSchema = z.object({
  fechaRealizada: z.coerce.date().optional(),
  evidencia: z.array(evidencia).max(8).optional(),
  observaciones: z.string().trim().max(1000).optional(),
});

export const listarPlagasSchema = z.object({
  estado: z.enum(ESTADOS_PLAGA).optional(),
  puestoId: objectId.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const idParamSchema = z.object({ id: objectId });

export type CrearPlagaInput = z.infer<typeof crearPlagaSchema>;
export type ActualizarPlagaInput = z.infer<typeof actualizarPlagaSchema>;
export type RegistrarPlagaRealizadaInput = z.infer<typeof registrarRealizadaSchema>;
export type ListarPlagasInput = z.infer<typeof listarPlagasSchema>;
