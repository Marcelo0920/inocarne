import { CARNES_ROJAS, type TipoCarne } from './constants.js';

export interface RangoPh {
  min: number;
  max: number;
}

export interface RangosConfigurados {
  temperaturaMaxima: number;
  rangoPhRojas: RangoPh;
  rangoPhPollo: RangoPh;
}

export interface EvaluacionMedicion {
  /** `true` si el valor está dentro del rango aceptado. */
  dentroRango: boolean;
  /** Rango contra el que se evaluó, para mostrarlo junto al campo. */
  rango: { min: number | null; max: number };
  /** Mensaje listo para mostrar al vendedor. */
  mensaje: string;
}

/** Rango de pH que corresponde al tipo de carne (regla R3). */
export function rangoPhPara(tipoCarne: TipoCarne, rangos: RangosConfigurados): RangoPh {
  return CARNES_ROJAS.includes(tipoCarne) ? rangos.rangoPhRojas : rangos.rangoPhPollo;
}

/** Evalúa una temperatura contra el máximo aceptado (≤ 5 °C por defecto). */
export function evaluarTemperatura(valor: number, rangos: RangosConfigurados): EvaluacionMedicion {
  const dentroRango = valor <= rangos.temperaturaMaxima;
  return {
    dentroRango,
    rango: { min: null, max: rangos.temperaturaMaxima },
    mensaje: dentroRango
      ? `Temperatura dentro del rango (≤ ${rangos.temperaturaMaxima} °C)`
      : `Temperatura fuera del rango: ${valor} °C supera el máximo de ${rangos.temperaturaMaxima} °C`,
  };
}

/** Evalúa un pH contra el rango del tipo de carne indicado. */
export function evaluarPh(
  valor: number,
  tipoCarne: TipoCarne,
  rangos: RangosConfigurados,
): EvaluacionMedicion {
  const rango = rangoPhPara(tipoCarne, rangos);
  const dentroRango = valor >= rango.min && valor <= rango.max;
  return {
    dentroRango,
    rango,
    mensaje: dentroRango
      ? `pH dentro del rango (${rango.min} – ${rango.max})`
      : `pH fuera del rango: ${valor} está fuera de ${rango.min} – ${rango.max}`,
  };
}

export interface EvaluacionRegistro {
  temperatura?: EvaluacionMedicion;
  ph?: EvaluacionMedicion;
  /** `true` solo si todas las mediciones presentes están dentro de rango. */
  dentroRango: boolean;
  /** Motivos de las mediciones fuera de rango, para el registro y el supervisor. */
  desviaciones: string[];
}

/** Evalúa de una sola vez las mediciones de un registro. */
export function evaluarMediciones(
  valores: { temperatura?: number | null; ph?: number | null; tipoCarne?: TipoCarne | null },
  rangos: RangosConfigurados,
): EvaluacionRegistro {
  const resultado: EvaluacionRegistro = { dentroRango: true, desviaciones: [] };

  if (typeof valores.temperatura === 'number') {
    resultado.temperatura = evaluarTemperatura(valores.temperatura, rangos);
    if (!resultado.temperatura.dentroRango) {
      resultado.dentroRango = false;
      resultado.desviaciones.push(resultado.temperatura.mensaje);
    }
  }

  if (typeof valores.ph === 'number') {
    if (!valores.tipoCarne) {
      throw new Error('Para evaluar el pH es necesario indicar el tipo de carne.');
    }
    resultado.ph = evaluarPh(valores.ph, valores.tipoCarne, rangos);
    if (!resultado.ph.dentroRango) {
      resultado.dentroRango = false;
      resultado.desviaciones.push(resultado.ph.mensaje);
    }
  }

  return resultado;
}
