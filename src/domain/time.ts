/**
 * Conversión entre instantes UTC y la hora local del mercado.
 *
 * Todo registro se guarda en UTC (regla R1). Los horarios programados
 * ("07:00", "10:30", "13:30") son horas locales de Bolivia, por lo que hace
 * falta traducirlos al instante UTC del día correspondiente antes de comparar.
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Descompone un instante en sus componentes de fecha y hora locales. */
export function toZonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = getFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };
  // Intl devuelve la hora 24 para la medianoche en algunos runtimes.
  const hour = read('hour') % 24;
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour,
    minute: read('minute'),
    second: read('second'),
  };
}

/** Desfase de la zona horaria, en minutos, en un instante dado (UTC-4 => -240). */
export function getTimeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const p = toZonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** Clave del día local, en formato `YYYY-MM-DD`. Es la unidad de agrupación de los controles. */
export function zonedDayKey(instant: Date, timeZone: string): string {
  const { year, month, day } = toZonedParts(instant, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** `HH:mm` local de un instante. */
export function zonedTimeKey(instant: Date, timeZone: string): string {
  const { hour, minute } = toZonedParts(instant, timeZone);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Valida y descompone un horario `HH:mm`. */
export function parseHoraProgramada(hora: string): { hour: number; minute: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hora);
  if (!match) {
    throw new Error(`Horario inválido: "${hora}". Se espera el formato HH:mm (por ejemplo 10:30).`);
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/**
 * Instante UTC que corresponde a una hora local de un día local concreto.
 * Ejemplo: ("2026-02-09", "10:30", "America/La_Paz") => 2026-02-09T14:30:00Z
 */
export function zonedTimeToUtc(dayKey: string, hora: string, timeZone: string): Date {
  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!dayMatch) {
    throw new Error(`Fecha inválida: "${dayKey}". Se espera el formato YYYY-MM-DD.`);
  }
  const { hour, minute } = parseHoraProgramada(hora);
  const [, y, m, d] = dayMatch;
  const naiveUtc = Date.UTC(Number(y), Number(m) - 1, Number(d), hour, minute, 0, 0);

  // Primera aproximación con el desfase del instante tentativo y una corrección
  // posterior, que resuelve los saltos de horario de verano.
  let guess = naiveUtc - getTimeZoneOffsetMinutes(new Date(naiveUtc), timeZone) * 60_000;
  const correction = getTimeZoneOffsetMinutes(new Date(guess), timeZone) * 60_000;
  guess = naiveUtc - correction;
  return new Date(guess);
}

/** Inicio (00:00 local) del día local indicado, expresado en UTC. */
export function startOfZonedDay(dayKey: string, timeZone: string): Date {
  return zonedTimeToUtc(dayKey, '00:00', timeZone);
}

/** Instante justo posterior al final del día local (00:00 del día siguiente). */
export function endOfZonedDay(dayKey: string, timeZone: string): Date {
  const start = startOfZonedDay(dayKey, timeZone);
  const nextDayKey = zonedDayKey(new Date(start.getTime() + 36 * 3600_000), timeZone);
  return startOfZonedDay(nextDayKey, timeZone);
}

/** Representación legible para reportes y notificaciones: `09/02/2026 10:32`. */
export function formatInZone(instant: Date, timeZone: string): string {
  const p = toZonedParts(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(p.day)}/${pad(p.month)}/${p.year} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** Suma días naturales a un instante. */
export function addDays(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * 86_400_000);
}

/** Diferencia en días naturales locales entre dos instantes (b - a). */
export function diffInDays(a: Date, b: Date, timeZone: string): number {
  const startA = startOfZonedDay(zonedDayKey(a, timeZone), timeZone).getTime();
  const startB = startOfZonedDay(zonedDayKey(b, timeZone), timeZone).getTime();
  return Math.round((startB - startA) / 86_400_000);
}
