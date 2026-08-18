import { describe, expect, it } from 'vitest';
import {
  estadoCumplimiento,
  limitesVentana,
  semaforoAgregado,
  semaforoDeControl,
  type VentanaControl,
} from '../../src/domain/compliance.js';
import { estadoMantenimiento, estaVencida } from '../../src/domain/maintenance.js';

const TZ = 'America/La_Paz';

/** Control de las 10:30 del 09/02/2026, con la tolerancia por defecto de 15 minutos. */
const ventana: VentanaControl = {
  dia: '2026-02-09',
  horaProgramada: '10:30',
  toleranciaMinutos: 15,
  timeZone: TZ,
};

/** Instante UTC a partir de una hora local del 09/02/2026. */
const local = (hora: string): Date => new Date(`2026-02-09T${hora}:00.000-04:00`);

describe('ventana de tolerancia', () => {
  it('se extiende 15 minutos antes y después del horario programado', () => {
    const { programado, desde, hasta } = limitesVentana(ventana);
    expect(programado.toISOString()).toBe('2026-02-09T14:30:00.000Z');
    expect(desde.toISOString()).toBe('2026-02-09T14:15:00.000Z');
    expect(hasta.toISOString()).toBe('2026-02-09T14:45:00.000Z');
  });
});

describe('estado de cumplimiento (regla R4)', () => {
  it('un registro a las 10:32 está a tiempo', () => {
    expect(estadoCumplimiento(ventana, local('10:32'))).toBe('a_tiempo');
  });

  it('un registro a las 11:15 está con retraso', () => {
    expect(estadoCumplimiento(ventana, local('11:15'))).toBe('con_retraso');
  });

  it('acepta los bordes exactos de la tolerancia', () => {
    expect(estadoCumplimiento(ventana, local('10:15'))).toBe('a_tiempo');
    expect(estadoCumplimiento(ventana, local('10:45'))).toBe('a_tiempo');
  });

  it('registrar un minuto antes de la tolerancia cuenta como retraso', () => {
    expect(estadoCumplimiento(ventana, local('10:14'))).toBe('con_retraso');
    expect(estadoCumplimiento(ventana, local('10:46'))).toBe('con_retraso');
  });

  it('sin registro y con la ventana abierta queda pendiente', () => {
    expect(estadoCumplimiento(ventana, null, local('10:20'))).toBe('pendiente');
    expect(estadoCumplimiento(ventana, null, local('08:00'))).toBe('pendiente');
  });

  it('sin registro y con la ventana cerrada queda no realizado', () => {
    expect(estadoCumplimiento(ventana, null, local('12:00'))).toBe('no_realizado');
  });

  it('el cambio de pendiente a no realizado ocurre al cerrar la tolerancia', () => {
    expect(estadoCumplimiento(ventana, null, local('10:45'))).toBe('pendiente');
    expect(estadoCumplimiento(ventana, null, new Date(local('10:45').getTime() + 1000))).toBe(
      'no_realizado',
    );
  });
});

describe('semáforo', () => {
  it('verde solo cuando el control fue a tiempo y dentro de rango', () => {
    expect(semaforoDeControl('a_tiempo', true)).toBe('verde');
  });

  it('amarillo cuando se registró con retraso', () => {
    expect(semaforoDeControl('con_retraso', true)).toBe('amarillo');
  });

  it('rojo cuando no se realizó', () => {
    expect(semaforoDeControl('no_realizado')).toBe('rojo');
  });

  it('gris mientras todavía no corresponde realizarlo', () => {
    expect(semaforoDeControl('pendiente')).toBe('gris');
  });

  it('una medición fuera de rango es roja aunque el control sea puntual', () => {
    expect(semaforoDeControl('a_tiempo', false)).toBe('rojo');
    expect(semaforoDeControl('con_retraso', false)).toBe('rojo');
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
