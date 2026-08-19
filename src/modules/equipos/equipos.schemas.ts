import { z } from 'zod';
import { TIPOS_MANTENIMIENTO } from '../../domain/constants.js';
import { fechaDelMercado } from '../../utils/fechaDelMercado.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Identificador inválido');
const fecha = fechaDelMercado;

const evidencia = z.object({
  url: z.string().url('La referencia del archivo no es válida'),
  publicId: z.string().min(1),
});

export const crearEquipoSchema = z.object({
  puestoId: objectId.optional(),
  // Opcional: si no viene, el sistema asigna EQ-P{puesto}-{secuencia}.
  codigo: z.string().trim().min(1).max(40).optional(),
  nombre: z.string().trim().min(1, 'Indique el nombre o tipo de equipo').max(120),
  marca: z.string().trim().max(80).optional(),
  modelo: z.string().trim().max(80).optional(),
  numeroSerie: z.string().trim().max(80).optional(),
  ubicacion: z.string().trim().max(120).optional(),
  estado: z.string().trim().max(60).optional(),
  ultimoMantenimiento: fecha.optional(),
  tipoUltimoMantenimiento: z.enum(TIPOS_MANTENIMIENTO).optional(),
  proximoMantenimiento: fecha.optional(),
  observaciones: z.string().trim().max(1000).optional(),
  foto: evidencia.optional(),
  documento: evidencia.optional(),
});

export const actualizarEquipoSchema = crearEquipoSchema
  .partial()
  .omit({ puestoId: true, codigo: true })
  .extend({ activo: z.boolean().optional() })
  .refine((datos) => Object.keys(datos).length > 0, { message: 'No se envió ningún cambio' });

export const registrarMantenimientoSchema = z.object({
  fecha: fecha,
  tipo: z.enum(TIPOS_MANTENIMIENTO, {
    errorMap: () => ({ message: 'Indique si fue preventivo o correctivo' }),
  }),
  descripcion: z.string().trim().min(1, 'Describa el trabajo realizado').max(1000),
  tecnico: z.string().trim().max(160).optional(),
  documentos: z.array(evidencia).max(5).default([]),
  fotos: z.array(evidencia).max(5).default([]),
  proximoMantenimiento: fecha.optional(),
  noConformidadId: objectId.optional(),
  observaciones: z.string().trim().max(1000).optional(),
});

export const listarEquiposSchema = z.object({
  puestoId: objectId.optional(),
  estado: z.enum(['realizado', 'proximo', 'vencido']).optional(),
  activo: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export const listarMantenimientosSchema = z.object({
  puestoId: objectId.optional(),
  equipoId: objectId.optional(),
  tipo: z.enum(TIPOS_MANTENIMIENTO).optional(),
  desde: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  hasta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const idParamSchema = z.object({ id: objectId });

export type CrearEquipoInput = z.infer<typeof crearEquipoSchema>;
export type ActualizarEquipoInput = z.infer<typeof actualizarEquipoSchema>;
export type RegistrarMantenimientoInput = z.infer<typeof registrarMantenimientoSchema>;
export type ListarEquiposInput = z.infer<typeof listarEquiposSchema>;
export type ListarMantenimientosInput = z.infer<typeof listarMantenimientosSchema>;
