import { describe, expect, it } from 'vitest';
import {
  estadoDeControl,
  semaforoAgregado,
  semaforoDeControl,
} from '../../src/domain/compliance.js';
import { estadoMantenimiento, estaVencida } from '../../src/domain/maintenance.js';

const TZ = 'America/La_Paz';

/** Instante UTC a partir de una fecha y hora local de La Paz (UTC-4). */
const local = (dia: string, hora: string): Date => new Date(`${dia}T${hora}:00.000-04:00`);

describe('estado de un control del día (sin horario fijo)', () => {
  it('realizado en cuanto existe el registro, sin importar la hora', () => {
    expect(estadoDeControl(true, '2026-02-09', TZ, local('2026-02-09', '06:00'))).toBe('realizado');
    expect(estadoDeControl(true, '2026-02-09', TZ, local('2026-02-09', '23:30'))).toBe('realizado');
  });

  it('pendiente mientras el día todavía no termina', () => {
    expect(estadoDeControl(false, '2026-02-09', TZ, local('2026-02-09', '07:00'))).toBe(
      'pendiente',
    );
    expect(estadoDeControl(false, '2026-02-09', TZ, local('2026-02-09', '23:59'))).toBe(
      'pendiente',
    );
  });

  it('no realizado recién cuando el día del mercado terminó', () => {
    expect(estadoDeControl(false, '2026-02-09', TZ, local('2026-02-10', '00:00'))).toBe(
      'no_realizado',
    );
  });

  it('el fin del día se mide en la hora local del mercado, no en UTC', () => {
    // 23:30 en La Paz ya es el día siguiente en UTC: el control sigue pendiente.
    expect(estadoDeControl(false, '2026-02-09', TZ, local('2026-02-09', '23:30'))).toBe(
      'pendiente',
    );
  });

  it('un día futuro está pendiente', () => {
    expect(estadoDeControl(false, '2026-02-12', TZ, local('2026-02-09', '12:00'))).toBe(
      'pendiente',
    );
  });
});

describe('semáforo', () => {
  it('verde cuando el control se realizó dentro de rango', () => {
    expect(semaforoDeControl('realizado', true)).toBe('verde');
  });

  it('rojo cuando no se realizó', () => {
    expect(semaforoDeControl('no_realizado')).toBe('rojo');
  });

  it('gris mientras todavía se puede realizar', () => {
    expect(semaforoDeControl('pendiente')).toBe('gris');
  });

  it('una medición fuera de rango es roja', () => {
    expect(semaforoDeControl('realizado', false)).toBe('rojo');
  });

  it('el semáforo del puesto toma siempre el estado más grave', () => {
    expect(semaforoAgregado(['verde', 'verde', 'verde'])).toBe('verde');
    expect(semaforoAgregado(['verde', 'amarillo', 'verde'])).toBe('amarillo');
    expect(semaforoAgregado(['verde', 'amarillo', 'rojo'])).toBe('rojo');
    expect(semaforoAgregado(['gris', 'verde'])).toBe('verde');
    expect(semaforoAgregado([])).toBe('gris');
  });
});

describe('estado de mantenimiento de un equipo', () => {
  const ahora = new Date('2026-02-09T14:00:00.000Z');

  it('vencido cuando la fecha ya pasó', () => {
    expect(estadoMantenimiento(new Date('2026-01-15T12:00:00Z'), 15, TZ, ahora)).toBe('vencido');
  });

  it('próximo cuando faltan menos días que el aviso configurado', () => {
    expect(estadoMantenimiento(new Date('2026-02-20T12:00:00Z'), 15, TZ, ahora)).toBe('proximo');
  });

  it('realizado cuando todavía falta bastante', () => {
    expect(estadoMantenimiento(new Date('2026-05-05T12:00:00Z'), 15, TZ, ahora)).toBe('realizado');
  });

  it('sin fecha de próximo mantenimiento no genera alerta', () => {
    expect(estadoMantenimiento(null, 15, TZ, ahora)).toBe('realizado');
  });

  it('una acción con fecha límite pasada está vencida', () => {
    expect(estaVencida(new Date('2026-02-08T12:00:00Z'), TZ, ahora)).toBe(true);
    expect(estaVencida(new Date('2026-02-09T23:00:00Z'), TZ, ahora)).toBe(false);
    expect(estaVencida(null, TZ, ahora)).toBe(false);
  });
});
