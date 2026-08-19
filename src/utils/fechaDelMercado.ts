import { z } from 'zod';
import { env } from '../config/env.js';
import { startOfZonedDay } from '../domain/time.js';

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Una fecha sin hora, entendida como un día del mercado.
 *
 * `new Date('2030-03-10')` es medianoche UTC, que en Bolivia todavía es el 9 a
 * las 20:00. Guardado así, un plazo del 10 vencía el 9 y el aviso de una
 * capacitación anunciaba el día anterior al acordado.
 *
 * Por eso una fecha sin hora se ancla al comienzo de ese día en la zona del
 * mercado. Cuando el cliente manda un instante completo —con hora y zona— se
 * respeta tal cual, porque ahí no hay ambigüedad que resolver.
 */
export const fechaDelMercado = z.union([z.string(), z.date()]).transform((valor, contexto) => {
  if (valor instanceof Date) return valor;

  if (SOLO_FECHA.test(valor)) {
    return startOfZonedDay(valor, env.DISPLAY_TIMEZONE);
  }

  const instante = new Date(valor);
  if (Number.isNaN(instante.getTime())) {
    contexto.addIssue({
      code: z.ZodIssueCode.invalid_date,
      message: 'La fecha no es válida. Use el formato AAAA-MM-DD.',
    });
    return z.NEVER;
  }
  return instante;
});
