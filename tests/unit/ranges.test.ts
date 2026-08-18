import { describe, expect, it } from 'vitest';
import { CONFIGURACION_POR_DEFECTO } from '../../src/domain/constants.js';
import {
  evaluarMediciones,
  evaluarPh,
  evaluarTemperatura,
  rangoPhPara,
} from '../../src/domain/ranges.js';

const RANGOS = {
  temperaturaMaxima: CONFIGURACION_POR_DEFECTO.temperaturaMaxima,
  rangoPhRojas: { ...CONFIGURACION_POR_DEFECTO.rangoPhRojas },
  rangoPhPollo: { ...CONFIGURACION_POR_DEFECTO.rangoPhPollo },
};

describe('temperatura (≤ 5 °C)', () => {
  it('acepta valores por debajo del máximo', () => {
    expect(evaluarTemperatura(3.5, RANGOS).dentroRango).toBe(true);
  });

  it('acepta exactamente el máximo', () => {
    expect(evaluarTemperatura(5, RANGOS).dentroRango).toBe(true);
  });

  it('rechaza valores por encima del máximo', () => {
    const resultado = evaluarTemperatura(5.1, RANGOS);
    expect(resultado.dentroRango).toBe(false);
    expect(resultado.mensaje).toContain('fuera del rango');
  });

  it('acepta temperaturas bajo cero', () => {
    expect(evaluarTemperatura(-2, RANGOS).dentroRango).toBe(true);
  });
});

describe('pH según el tipo de carne', () => {
  it('usa 5,4 – 5,8 para las carnes rojas', () => {
    expect(rangoPhPara('res', RANGOS)).toEqual({ min: 5.4, max: 5.8 });
    expect(rangoPhPara('cerdo', RANGOS)).toEqual({ min: 5.4, max: 5.8 });
    expect(rangoPhPara('cordero', RANGOS)).toEqual({ min: 5.4, max: 5.8 });
  });

  it('usa 5,8 – 6,2 para el pollo', () => {
    expect(rangoPhPara('pollo', RANGOS)).toEqual({ min: 5.8, max: 6.2 });
  });

  it('acepta los extremos de cada rango', () => {
    expect(evaluarPh(5.4, 'res', RANGOS).dentroRango).toBe(true);
    expect(evaluarPh(5.8, 'res', RANGOS).dentroRango).toBe(true);
    expect(evaluarPh(5.8, 'pollo', RANGOS).dentroRango).toBe(true);
    expect(evaluarPh(6.2, 'pollo', RANGOS).dentroRango).toBe(true);
  });

  it('un mismo valor puede cumplir para un tipo de carne y no para otro', () => {
    expect(evaluarPh(6.0, 'pollo', RANGOS).dentroRango).toBe(true);
    expect(evaluarPh(6.0, 'res', RANGOS).dentroRango).toBe(false);
    expect(evaluarPh(5.5, 'res', RANGOS).dentroRango).toBe(true);
    expect(evaluarPh(5.5, 'pollo', RANGOS).dentroRango).toBe(false);
  });
});

describe('evaluación conjunta de un registro', () => {
  it('está dentro de rango cuando todas las mediciones cumplen', () => {
    const r = evaluarMediciones({ temperatura: 4, ph: 5.6, tipoCarne: 'res' }, RANGOS);
    expect(r.dentroRango).toBe(true);
    expect(r.desviaciones).toHaveLength(0);
  });

  it('acumula todas las desviaciones encontradas', () => {
    const r = evaluarMediciones({ temperatura: 8, ph: 6.5, tipoCarne: 'res' }, RANGOS);
    expect(r.dentroRango).toBe(false);
    expect(r.desviaciones).toHaveLength(2);
  });

  it('evalúa solo las mediciones presentes', () => {
    const r = evaluarMediciones({ temperatura: 4 }, RANGOS);
    expect(r.dentroRango).toBe(true);
    expect(r.ph).toBeUndefined();
  });

  it('exige el tipo de carne cuando se envía un pH', () => {
    expect(() => evaluarMediciones({ ph: 5.6 }, RANGOS)).toThrow(/tipo de carne/);
  });
});
