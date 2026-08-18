import type { EstadoMantenimiento } from './constants.js';
import { diffInDays } from './time.js';

/**
 * Estado del mantenimiento de un equipo (punto 10.6):
 * - `vencido`   la fecha del próximo mantenimiento ya pasó
 * - `proximo`   faltan `diasAviso` días o menos
 * - `realizado` está al día
 */
export function estadoMantenimiento(
  proximoMantenimiento: Date | null | undefined,
  diasAviso: number,
  timeZone: string,
  ahora: Date = new Date(),
): EstadoMantenimiento {
  if (!proximoMantenimiento) return 'realizado';
  const dias = diffInDays(ahora, proximoMantenimiento, timeZone);
  if (dias < 0) return 'vencido';
  if (dias <= diasAviso) return 'proximo';
  return 'realizado';
}

/** Estado de una acción correctiva a partir de su fecha límite. */
export function estaVencida(
  fechaLimite: Date | null | undefined,
  timeZone: string,
  ahora: Date = new Date(),
): boolean {
  if (!fechaLimite) return false;
  return diffInDays(ahora, fechaLimite, timeZone) < 0;
}
