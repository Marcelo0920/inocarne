import { z } from 'zod';
import { ROLES } from '../../domain/constants.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Identificador inválido');

export const crearUsuarioSchema = z
  .object({
    nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
    usuario: z.string().trim().toLowerCase().min(3, 'Mínimo 3 caracteres').max(60),
    password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
    rol: z.enum(ROLES),
    puestoId: objectId.nullable().optional(),
  })
  .refine((datos) => datos.rol !== 'puesto' || Boolean(datos.puestoId), {
    message: 'Un usuario de puesto debe tener un puesto asignado',
    path: ['puestoId'],
  });

export const actualizarUsuarioSchema = z
  .object({
    nombre: z.string().trim().min(1).max(120).optional(),
    rol: z.enum(ROLES).optional(),
    puestoId: objectId.nullable().optional(),
    activo: z.boolean().optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, { message: 'No se envió ningún cambio' });

export const restablecerPasswordSchema = z.object({
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

export const listarUsuariosSchema = z.object({
  rol: z.enum(ROLES).optional(),
  puestoId: objectId.optional(),
  activo: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export const idParamSchema = z.object({ id: objectId });
