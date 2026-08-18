import {
  CONFIGURACION_POR_DEFECTO,
  PUNTOS_INSPECCION_MERCADO,
  PUNTOS_INSPECCION_PUESTO,
  PUNTOS_LIMPIEZA,
} from '../domain/constants.js';
import type { RangosConfigurados } from '../domain/ranges.js';
import { ConfiguracionModel, type Configuracion } from '../models/Configuracion.js';

export interface ConfiguracionResuelta extends RangosConfigurados {
  horariosExhibicion: string[];
  horariosRefrigeracion: string[];
  toleranciaMinutos: number;
  diasAvisoPlagas: number[];
  diasAvisoMantenimiento: number;
  puntosLimpieza: string[];
  puntosInspeccionMercado: string[];
  puntosInspeccionPuesto: string[];
}

/**
 * La configuración se lee en casi todas las peticiones, así que se guarda en
 * memoria por un tiempo corto. `invalidarConfiguracion()` la vuelve a leer
 * inmediatamente después de una modificación del administrador.
 */
const TTL_MS = 30_000;
let cache: { valor: ConfiguracionResuelta; expira: number } | null = null;

/**
 * Completa con los valores por defecto lo que no esté configurado.
 * Una lista vacía cuenta como "sin configurar" y vuelve a los valores por
 * defecto: así una configuración incompleta nunca deja al mercado sin controles
 * programados. Por eso el esquema de la API exige al menos un horario.
 */
function resolver(doc: Configuracion | null): ConfiguracionResuelta {
  return {
    temperaturaMaxima: doc?.temperaturaMaxima ?? CONFIGURACION_POR_DEFECTO.temperaturaMaxima,
    rangoPhRojas: doc?.rangoPhRojas ?? { ...CONFIGURACION_POR_DEFECTO.rangoPhRojas },
    rangoPhPollo: doc?.rangoPhPollo ?? { ...CONFIGURACION_POR_DEFECTO.rangoPhPollo },
    horariosExhibicion: doc?.horariosExhibicion?.length
      ? [...doc.horariosExhibicion]
      : [...CONFIGURACION_POR_DEFECTO.horariosExhibicion],
    horariosRefrigeracion: doc?.horariosRefrigeracion?.length
      ? [...doc.horariosRefrigeracion]
      : [...CONFIGURACION_POR_DEFECTO.horariosRefrigeracion],
    toleranciaMinutos: doc?.toleranciaMinutos ?? CONFIGURACION_POR_DEFECTO.toleranciaMinutos,
    diasAvisoPlagas: doc?.diasAvisoPlagas?.length
      ? [...doc.diasAvisoPlagas]
      : [...CONFIGURACION_POR_DEFECTO.diasAvisoPlagas],
    diasAvisoMantenimiento:
      doc?.diasAvisoMantenimiento ?? CONFIGURACION_POR_DEFECTO.diasAvisoMantenimiento,
    puntosLimpieza: doc?.puntosLimpieza?.length ? [...doc.puntosLimpieza] : [...PUNTOS_LIMPIEZA],
    puntosInspeccionMercado: doc?.puntosInspeccionMercado?.length
      ? [...doc.puntosInspeccionMercado]
      : [...PUNTOS_INSPECCION_MERCADO],
    puntosInspeccionPuesto: doc?.puntosInspeccionPuesto?.length
      ? [...doc.puntosInspeccionPuesto]
      : [...PUNTOS_INSPECCION_PUESTO],
  };
}

/** Configuración vigente, creando el documento único la primera vez. */
export async function obtenerConfiguracion(): Promise<ConfiguracionResuelta> {
  if (cache && cache.expira > Date.now()) return cache.valor;

  const doc = await ConfiguracionModel.findOneAndUpdate(
    { clave: 'global' },
    { $setOnInsert: { clave: 'global' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean<Configuracion | null>();

  const valor = resolver(doc);
  cache = { valor, expira: Date.now() + TTL_MS };
  return valor;
}

/** Aplica cambios del administrador y refresca la caché. */
export async function actualizarConfiguracion(
  cambios: Partial<Configuracion>,
): Promise<ConfiguracionResuelta> {
  const doc = await ConfiguracionModel.findOneAndUpdate(
    { clave: 'global' },
    { $set: cambios },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      runValidators: true,
    },
  ).lean<Configuracion | null>();

  const valor = resolver(doc);
  cache = { valor, expira: Date.now() + TTL_MS };
  return valor;
}

/** Descarta la caché (necesario entre pruebas y tras un cambio externo). */
export function invalidarConfiguracion(): void {
  cache = null;
}
