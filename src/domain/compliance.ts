import type { EstadoControl, Semaforo } from './constants.js';
import { zonedDayKey } from './time.js';

/**
 * Estado de un control del día.
 *
 * Los controles no tienen horario fijo ni se evalúa su puntualidad: cada
 * vendedor los hace cuando puede. Solo importa si se hicieron ese día.
 *
 * - `realizado`     ya existe el registro
 * - `pendiente`     no hay registro y el día del mercado todavía no termina
 * - `no_realizado`  el día del mercado terminó sin registro
 */
export function estadoDeControl(
  realizado: boolean,
  dia: string,
  timeZone: string,
  ahora: Date = new Date(),
): EstadoControl {
  if (realizado) return 'realizado';
  return dia < zonedDayKey(ahora, timeZone) ? 'no_realizado' : 'pendiente';
}

/**
 * Semáforo de un control, combinando su estado con el resultado de sus
 * mediciones. Una medición fuera de rango siempre es roja.
 */
export function semaforoDeControl(estado: EstadoControl, dentroRango = true): Semaforo {
  if (!dentroRango) return 'rojo';
  switch (estado) {
    case 'realizado':
      return 'verde';
    case 'no_realizado':
      return 'rojo';
    case 'pendiente':
      return 'gris';
  }
}

const PESO_SEMAFORO: Record<Semaforo, number> = { gris: 0, verde: 1, amarillo: 2, rojo: 3 };

/** Semáforo global de un puesto: manda siempre el estado más grave. */
export function semaforoAgregado(semaforos: readonly Semaforo[]): Semaforo {
  return semaforos.reduce<Semaforo>(
    (peor, actual) => (PESO_SEMAFORO[actual] > PESO_SEMAFORO[peor] ? actual : peor),
    'gris',
  );
}

/** Día local "de hoy" según la zona horaria del mercado. */
export function diaActual(timeZone: string, ahora: Date = new Date()): string {
  return zonedDayKey(ahora, timeZone);
}
