import type { EstadoControl, Semaforo } from './constants.js';
import { zonedDayKey, zonedTimeToUtc } from './time.js';

export interface VentanaControl {
  /** Horario programado en hora local, `HH:mm`. */
  horaProgramada: string;
  /** Día local al que pertenece el control, `YYYY-MM-DD`. */
  dia: string;
  /** Tolerancia en minutos, antes y después del horario programado. */
  toleranciaMinutos: number;
  timeZone: string;
}

export interface LimitesVentana {
  programado: Date;
  desde: Date;
  hasta: Date;
}

/** Límites en UTC de la ventana de tolerancia de un control programado. */
export function limitesVentana(ventana: VentanaControl): LimitesVentana {
  const programado = zonedTimeToUtc(ventana.dia, ventana.horaProgramada, ventana.timeZone);
  const margen = ventana.toleranciaMinutos * 60_000;
  return {
    programado,
    desde: new Date(programado.getTime() - margen),
    hasta: new Date(programado.getTime() + margen),
  };
}

/**
 * Estado de cumplimiento de un control programado (regla R4).
 *
 * - `a_tiempo`     el registro cae dentro de la ventana de tolerancia
 * - `con_retraso`  hay registro, pero fuera de la ventana
 * - `pendiente`    todavía no hay registro y la ventana no se ha cerrado
 * - `no_realizado` la ventana se cerró sin ningún registro
 */
export function estadoCumplimiento(
  ventana: VentanaControl,
  registradoEn: Date | null,
  ahora: Date = new Date(),
): EstadoControl {
  const { desde, hasta } = limitesVentana(ventana);

  if (registradoEn) {
    const t = registradoEn.getTime();
    return t >= desde.getTime() && t <= hasta.getTime() ? 'a_tiempo' : 'con_retraso';
  }

  return ahora.getTime() > hasta.getTime() ? 'no_realizado' : 'pendiente';
}

/**
 * Semáforo de un control, combinando su estado de cumplimiento con el
 * resultado de sus mediciones. Una medición fuera de rango siempre es roja.
 */
export function semaforoDeControl(estado: EstadoControl, dentroRango = true): Semaforo {
  if (!dentroRango) return 'rojo';
  switch (estado) {
    case 'a_tiempo':
      return 'verde';
    case 'con_retraso':
      return 'amarillo';
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
