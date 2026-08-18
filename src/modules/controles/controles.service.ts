import type { FilterQuery } from 'mongoose';
import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import {
  estadoCumplimiento,
  semaforoDeControl,
  type VentanaControl,
} from '../../domain/compliance.js';
import type { EstadoControl, Semaforo, TipoControl } from '../../domain/constants.js';
import { evaluarMediciones } from '../../domain/ranges.js';
import { endOfZonedDay, startOfZonedDay, zonedDayKey } from '../../domain/time.js';
import { ControlModel, type Control } from '../../models/Control.js';
import { auditar } from '../../services/auditoria.service.js';
import {
  obtenerConfiguracion,
  type ConfiguracionResuelta,
} from '../../services/configuracion.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildPaginated, type Paginated } from '../../utils/pagination.js';
import type { CrearControlInput, ListarControlesInput } from './controles.schemas.js';

const TZ = env.DISPLAY_TIMEZONE;

interface Autor {
  usuarioId: string;
  puestoId: string;
}

/** Horarios programados que corresponden a cada tipo de control. */
export function horariosDe(tipo: TipoControl, configuracion: ConfiguracionResuelta): string[] {
  return tipo === 'exhibicion'
    ? configuracion.horariosExhibicion
    : configuracion.horariosRefrigeracion;
}

/**
 * Registra un control horario (puntos 7 y 8).
 * El estado de cumplimiento lo decide el servidor comparando la hora real de
 * registro contra el horario programado y la tolerancia configurada (R4).
 */
export async function registrarControl(datos: CrearControlInput, autor: Autor): Promise<Control> {
  const configuracion = await obtenerConfiguracion();

  const horarios = horariosDe(datos.tipo, configuracion);
  if (!horarios.includes(datos.franjaProgramada)) {
    throw ApiError.badRequest(
      `El horario ${datos.franjaProgramada} no está programado para este control. ` +
        `Horarios válidos: ${horarios.join(', ')}.`,
    );
  }

  const registradoEn = new Date();
  const dia = zonedDayKey(registradoEn, TZ);

  const evaluacion = evaluarMediciones(
    {
      temperatura: datos.temperatura,
      ph: datos.tipo === 'exhibicion' ? datos.ph : undefined,
      tipoCarne: datos.tipoCarne,
    },
    configuracion,
  );

  const ventana: VentanaControl = {
    dia,
    horaProgramada: datos.franjaProgramada,
    toleranciaMinutos: configuracion.toleranciaMinutos,
    timeZone: TZ,
  };
  const cumplimiento = estadoCumplimiento(ventana, registradoEn);

  try {
    const control = await ControlModel.create({
      puestoId: new Types.ObjectId(autor.puestoId),
      usuarioId: new Types.ObjectId(autor.usuarioId),
      tipo: datos.tipo,
      franjaProgramada: datos.franjaProgramada,
      dia,
      registradoEn,
      temperatura: datos.temperatura,
      ph: datos.tipo === 'exhibicion' ? (datos.ph ?? null) : null,
      tipoCarne: datos.tipo === 'exhibicion' ? (datos.tipoCarne ?? null) : null,
      dentroRango: evaluacion.dentroRango,
      desviaciones: evaluacion.desviaciones,
      cumplimiento,
      observaciones: datos.observaciones ?? null,
    });

    await auditar({
      coleccion: 'controles',
      documentoId: control._id,
      accion: 'crear',
      usuarioId: autor.usuarioId,
      puestoId: autor.puestoId,
      detalle: `${datos.tipo} ${datos.franjaProgramada} — ${cumplimiento}`,
    });

    return control.toObject();
  } catch (error) {
    // El índice único impide registrar dos veces la misma franja el mismo día.
    if (error instanceof Error && 'code' in error && (error as { code?: number }).code === 11000) {
      throw ApiError.conflict(
        `El control de ${datos.franjaProgramada} de hoy ya fue registrado. ` +
          'Los registros no se modifican; si hubo un error, informe al supervisor.',
      );
    }
    throw error;
  }
}

export interface EstadoFranja {
  tipo: TipoControl;
  franjaProgramada: string;
  estado: EstadoControl;
  semaforo: Semaforo;
  registro: Control | null;
}

/**
 * Estado de todas las franjas programadas de un puesto en un día.
 * Las franjas sin registro se calculan al vuelo: la ausencia no se almacena (R8).
 */
export async function estadoDelDia(
  puestoId: string,
  dia: string | undefined,
  ahora: Date = new Date(),
): Promise<{ dia: string; franjas: EstadoFranja[] }> {
  const configuracion = await obtenerConfiguracion();
  const diaConsultado = dia ?? zonedDayKey(ahora, TZ);

  const registros = await ControlModel.find({
    puestoId: new Types.ObjectId(puestoId),
    dia: diaConsultado,
  }).lean();

  const franjas: EstadoFranja[] = [];
  for (const tipo of ['exhibicion', 'refrigeracion'] as const) {
    for (const franjaProgramada of horariosDe(tipo, configuracion)) {
      const registro =
        registros.find((r) => r.tipo === tipo && r.franjaProgramada === franjaProgramada) ?? null;
      const estado = estadoCumplimiento(
        {
          dia: diaConsultado,
          horaProgramada: franjaProgramada,
          toleranciaMinutos: configuracion.toleranciaMinutos,
          timeZone: TZ,
        },
        registro ? new Date(registro.registradoEn) : null,
        ahora,
      );
      franjas.push({
        tipo,
        franjaProgramada,
        estado,
        semaforo: semaforoDeControl(estado, registro?.dentroRango ?? true),
        registro,
      });
    }
  }

  return { dia: diaConsultado, franjas };
}

/** Historial de controles con filtros. */
export async function listarControles(
  filtros: ListarControlesInput,
  puestoObligatorio: string | null,
): Promise<Paginated<Control>> {
  const consulta: FilterQuery<Control> = {};

  const puestoId = puestoObligatorio ?? filtros.puestoId;
  if (puestoId) consulta.puestoId = new Types.ObjectId(puestoId);
  if (filtros.tipo) consulta.tipo = filtros.tipo;
  if (filtros.cumplimiento) consulta.cumplimiento = filtros.cumplimiento;
  if (filtros.dentroRango !== undefined) consulta.dentroRango = filtros.dentroRango;

  if (filtros.desde || filtros.hasta) {
    const rango: Record<string, Date> = {};
    if (filtros.desde) rango.$gte = startOfZonedDay(filtros.desde, TZ);
    if (filtros.hasta) rango.$lt = endOfZonedDay(filtros.hasta, TZ);
    consulta.registradoEn = rango;
  }

  const { page, limit } = filtros;
  const [datos, total] = await Promise.all([
    ControlModel.find(consulta)
      .sort({ registradoEn: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ControlModel.countDocuments(consulta),
  ]);

  return buildPaginated(datos, total, { page, limit });
}
