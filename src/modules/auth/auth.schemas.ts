import { z } from 'zod';

export const loginSchema = z.object({
  usuario: z.string().trim().min(3, 'El usuario debe tener al menos 3 caracteres').toLowerCase(),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

export const cambiarPasswordSchema = z
  .object({
    passwordActual: z.string().min(1, 'Debe indicar su contraseña actual'),
    passwordNueva: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres'),
  })
  .refine((data) => data.passwordActual !== data.passwordNueva, {
    message: 'La nueva contraseña debe ser distinta de la actual',
    path: ['passwordNueva'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type CambiarPasswordInput = z.infer<typeof cambiarPasswordSchema>;
