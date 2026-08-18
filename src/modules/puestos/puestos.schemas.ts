import { z } from 'zod';

export const crearPuestoSchema = z.object({
  numero: z.coerce.number().int().min(1, 'El número de puesto debe ser mayor a cero'),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  responsable: z.string().trim().max(120).optional(),
});

export const actualizarPuestoSchema = z
  .object({
    nombre: z.string().trim().min(1).max(120).optional(),
    responsable: z.string().trim().max(120).nullable().optional(),
    activo: z.boolean().optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, {
    message: 'No se envió ningún cambio',
  });

export const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Identificador inválido'),
});

export const listarPuestosSchema = z.object({
  activo: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
