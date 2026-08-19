import { z } from 'zod';
import { ESTADOS_CAPACITACION } from '../../domain/constants.js';
import { fechaDelMercado } from '../../utils/fechaDelMercado.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Identificador inválido');
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use el formato HH:mm');

const evidencia = z.object({
  url: z.string().url('La referencia del archivo no es válida'),
  publicId: z.string().min(1),
});

const participante = z.object({
  puestoId: objectId.nullable().optional(),
  nombre: z.string().trim().min(1).max(120),
  asistio: z.boolean().default(false),
});

export const crearCapacitacionSchema = z.object({
  tema: z.string().trim().min(1, 'Indique el tema').max(200),
  fechaProgramada: fechaDelMercado,
  hora,
  lugar: z.string().trim().max(160).optional(),
  capacitador: z.string().trim().max(160).optional(),
  // Sin lista de puestos se convoca a todos los puestos activos.
  puestos: z.array(objectId).optional(),
  participantes: z.array(participante).optional(),
  observaciones: z.string().trim().max(1000).optional(),
});

export const actualizarCapacitacionSchema = z
  .object({
    tema: z.string().trim().min(1).max(200).optional(),
    fechaProgramada: fechaDelMercado.optional(),
    hora: hora.optional(),
    lugar: z.string().trim().max(160).optional(),
    capacitador: z.string().trim().max(160).optional(),
    puestos: z.array(objectId).optional(),
    estado: z.enum(ESTADOS_CAPACITACION).optional(),
    evidencia: z.array(evidencia).max(8).optional(),
    observaciones: z.string().trim().max(1000).optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, { message: 'No se envió ningún cambio' });

export const registrarAsistenciaSchema = z.object({
  participantes: z.array(participante).min(1, 'Registre al menos un participante'),
  fechaRealizada: fechaDelMercado.optional(),
  evidencia: z.array(evidencia).max(8).optional(),
  observaciones: z.string().trim().max(1000).optional(),
});

export const listarCapacitacionesSchema = z.object({
  estado: z.enum(ESTADOS_CAPACITACION).optional(),
  puestoId: objectId.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const idParamSchema = z.object({ id: objectId });

export type CrearCapacitacionInput = z.infer<typeof crearCapacitacionSchema>;
export type ActualizarCapacitacionInput = z.infer<typeof actualizarCapacitacionSchema>;
export type RegistrarAsistenciaInput = z.infer<typeof registrarAsistenciaSchema>;
export type ListarCapacitacionesInput = z.infer<typeof listarCapacitacionesSchema>;
