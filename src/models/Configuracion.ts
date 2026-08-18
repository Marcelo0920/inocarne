import { Schema, type Model } from 'mongoose';
import { CONFIGURACION_POR_DEFECTO } from '../domain/constants.js';
import { baseSchemaOptions, registrarModelo } from './shared.js';

/**
 * Documento único con los parámetros del sistema: rangos aceptados, horarios
 * programados y tolerancia. Solo el administrador puede modificarlo.
 */
export interface Configuracion {
  clave: string;
  temperaturaMaxima: number;
  rangoPhRojas: { min: number; max: number };
  rangoPhPollo: { min: number; max: number };
  horariosExhibicion: string[];
  horariosRefrigeracion: string[];
  toleranciaMinutos: number;
  diasAvisoPlagas: number[];
  diasAvisoMantenimiento: number;
  puntosLimpieza: string[];
  puntosInspeccionMercado: string[];
  puntosInspeccionPuesto: string[];
}

const rangoSchema = new Schema(
  { min: { type: Number, required: true }, max: { type: Number, required: true } },
  { _id: false },
);

const configuracionSchema = new Schema<Configuracion>(
  {
    // Clave fija: garantiza que exista un solo documento de configuración.
    clave: { type: String, required: true, unique: true, default: 'global' },
    temperaturaMaxima: { type: Number, default: CONFIGURACION_POR_DEFECTO.temperaturaMaxima },
    rangoPhRojas: {
      type: rangoSchema,
      default: () => ({ ...CONFIGURACION_POR_DEFECTO.rangoPhRojas }),
    },
    rangoPhPollo: {
      type: rangoSchema,
      default: () => ({ ...CONFIGURACION_POR_DEFECTO.rangoPhPollo }),
    },
    horariosExhibicion: {
      type: [String],
      default: () => [...CONFIGURACION_POR_DEFECTO.horariosExhibicion],
    },
    horariosRefrigeracion: {
      type: [String],
      default: () => [...CONFIGURACION_POR_DEFECTO.horariosRefrigeracion],
    },
    toleranciaMinutos: {
      type: Number,
      default: CONFIGURACION_POR_DEFECTO.toleranciaMinutos,
      min: 0,
      max: 240,
    },
    diasAvisoPlagas: {
      type: [Number],
      default: () => [...CONFIGURACION_POR_DEFECTO.diasAvisoPlagas],
    },
    diasAvisoMantenimiento: {
      type: Number,
      default: CONFIGURACION_POR_DEFECTO.diasAvisoMantenimiento,
      min: 0,
    },
    puntosLimpieza: { type: [String], default: undefined },
    puntosInspeccionMercado: { type: [String], default: undefined },
    puntosInspeccionPuesto: { type: [String], default: undefined },
  },
  baseSchemaOptions,
);

export const ConfiguracionModel = registrarModelo<Model<Configuracion>>(
  'Configuracion',
  configuracionSchema,
);
