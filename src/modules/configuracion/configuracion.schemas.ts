import { z } from 'zod';

const rango = z
  .object({ min: z.number(), max: z.number() })
  .refine((r) => r.min <= r.max, { message: 'El mínimo no puede ser mayor que el máximo' });

export const actualizarConfiguracionSchema = z
  .object({
    temperaturaMaxima: z.number().min(-50).max(50).optional(),
    rangoPhRojas: rango.optional(),
    rangoPhPollo: rango.optional(),
    controlesExhibicionPorDia: z.number().int().min(1).max(12).optional(),
    controlesRefrigeracionPorDia: z.number().int().min(1).max(12).optional(),
    diasAvisoPlagas: z.array(z.number().int().min(0).max(60)).max(10).optional(),
    diasAvisoMantenimiento: z.number().int().min(0).max(365).optional(),
    puntosLimpieza: z.array(z.string().trim().min(1)).min(1).optional(),
    puntosInspeccionMercado: z.array(z.string().trim().min(1)).min(1).optional(),
    puntosInspeccionPuesto: z.array(z.string().trim().min(1)).min(1).optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, { message: 'No se envió ningún cambio' });
