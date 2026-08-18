import { describe, expect, it } from 'vitest';
import {
  diffInDays,
  endOfZonedDay,
  formatInZone,
  parseHoraProgramada,
  startOfZonedDay,
  toZonedParts,
  zonedDayKey,
  zonedTimeKey,
  zonedTimeToUtc,
} from '../../src/domain/time.js';

const TZ = 'America/La_Paz'; // Bolivia, UTC-4 todo el año

describe('conversión de hora local a UTC', () => {
  it('traduce un horario programado al instante UTC del mismo día', () => {
    // 10:30 en Bolivia son las 14:30 UTC
    expect(zonedTimeToUtc('2026-02-09', '10:30', TZ).toISOString()).toBe(
      '2026-02-09T14:30:00.000Z',
    );
  });

  it('traduce la primera hora de la mañana sin cambiar de día', () => {
    expect(zonedTimeToUtc('2026-02-09', '07:00', TZ).toISOString()).toBe(
      '2026-02-09T11:00:00.000Z',
    );
  });

  it('mantiene el día local aunque el instante UTC caiga en el día siguiente', () => {
    const instante = zonedTimeToUtc('2026-02-09', '21:00', TZ);
    expect(instante.toISOString()).toBe('2026-02-10T01:00:00.000Z');
    expect(zonedDayKey(instante, TZ)).toBe('2026-02-09');
  });

  it('rechaza horarios mal formados', () => {
    expect(() => parseHoraProgramada('25:00')).toThrow(/Horario inválido/);
    expect(() => parseHoraProgramada('7:00')).toThrow(/Horario inválido/);
    expect(() => zonedTimeToUtc('09-02-2026', '10:30', TZ)).toThrow(/Fecha inválida/);
  });

  it('acepta los horarios válidos del sistema', () => {
    expect(parseHoraProgramada('07:00')).toEqual({ hour: 7, minute: 0 });
    expect(parseHoraProgramada('13:30')).toEqual({ hour: 13, minute: 30 });
  });
});

describe('día y hora locales de un instante', () => {
  it('descompone un instante en componentes locales', () => {
    const parts = toZonedParts(new Date('2026-02-09T14:32:00.000Z'), TZ);
    expect(parts).toMatchObject({ year: 2026, month: 2, day: 9, hour: 10, minute: 32 });
  });

  it('devuelve la clave del día y la hora locales', () => {
    const instante = new Date('2026-02-09T14:32:00.000Z');
    expect(zonedDayKey(instante, TZ)).toBe('2026-02-09');
    expect(zonedTimeKey(instante, TZ)).toBe('10:32');
  });

  it('la medianoche local pertenece al día que comienza', () => {
    const medianoche = zonedTimeToUtc('2026-02-09', '00:00', TZ);
    expect(zonedDayKey(medianoche, TZ)).toBe('2026-02-09');
    expect(zonedTimeKey(medianoche, TZ)).toBe('00:00');
  });

  it('formatea para mostrar al usuario', () => {
    expect(formatInZone(new Date('2026-02-09T14:32:00.000Z'), TZ)).toBe('09/02/2026 10:32');
  });
});

describe('límites del día local', () => {
  it('el día va de 00:00 local a 00:00 local del día siguiente', () => {
    expect(startOfZonedDay('2026-02-09', TZ).toISOString()).toBe('2026-02-09T04:00:00.000Z');
    expect(endOfZonedDay('2026-02-09', TZ).toISOString()).toBe('2026-02-10T04:00:00.000Z');
  });

  it('cruza correctamente el fin de mes', () => {
    expect(endOfZonedDay('2026-02-28', TZ).toISOString()).toBe('2026-03-01T04:00:00.000Z');
  });

  it('cuenta días naturales entre instantes', () => {
    const a = new Date('2026-02-09T14:00:00.000Z');
    const b = new Date('2026-02-12T02:00:00.000Z'); // 11/02 22:00 local
    expect(diffInDays(a, b, TZ)).toBe(2);
    expect(diffInDays(b, a, TZ)).toBe(-2);
  });
});
