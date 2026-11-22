import type { FilterQuery } from 'mongoose';
import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { estadoDeControl, semaforoDeControl } from '../../domain/compliance.js';
import type { EstadoControl, Semaforo, TipoControl } from '../../domain/constants.js';
import { evaluarMediciones } from '../../domain/ranges.js';
import { formatInZone, zonedDayKey } from '../../domain/time.js';
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

/** Intentos ante dos registros simultáneos que eligen el mismo número. */
const INTENTOS_NUMERACION = 3;

interface Autor {
  usuarioId: string;
  puestoId: string;
}

/** Cuántos controles de cada tipo corresponden por día. */
export function cantidadPorDia(tipo: TipoControl, configuracion: ConfiguracionResuelta): number {
  return tipo === 'exhibicion'
    ? configuracion.controlesExhibicionPorDia
    : configuracion.controlesRefrigeracionPorDia;
}

/** Nombre del tipo de control tal como lo lee el vendedor. */
export function nombreDeControl(tipo: TipoControl): string {
  return tipo === 'exhibicion' ? 'exhibición' : 'refrigeración';
}

const yaRegistrado = (): ApiError =>
  ApiError.conflict(
    'Este control ya fue registrado. ' +
      'Los registros no se modifican; si hubo un error, informe al supervisor.',
  );

function esClaveDuplicada(error: unknown): error is { keyPattern?: Record<string, unknown> } {
  return error instanceof Error && 'code' in error && (error as { code?: number }).code === 11000;
}

/**
 * Registra un control diario (puntos 7 y 8).
 *
 * No hay horario fijo ni puntualidad: el control se guarda con la hora del
 * teléfono, que define su día, y con la hora del servidor aparte para la
 * auditoría. Cada tipo admite tantos controles por día como indica la
 * configuración, numerados en el orden en que llegan.
 */
export async function registrarControl(datos: CrearControlInput, autor: Autor): Promise<Control> {
  const configuracion = await obtenerConfiguracion();

  const horaDispositivo = new Date(datos.horaDispositivo);
  const registradoEn = new Date();
  const dia = zonedDayKey(horaDispositivo, TZ);
  const puestoId = new Types.ObjectId(autor.puestoId);
  const limite = cantidadPorDia(datos.tipo, configuracion);

  // Un reenvío de la cola sin conexión trae exactamente la misma hora del teléfono.
  if (await ControlModel.exists({ tipo: datos.tipo, puestoId, horaDispositivo })) {
    throw yaRegistrado();
  }

  const evaluacion = evaluarMediciones(
    {
      temperatura: datos.temperatura,
      ph: datos.tipo === 'exhibicion' ? datos.ph : undefined,
      tipoCarne: datos.tipoCarne,
    },
    configuracion,
  );

  for (let intento = 1; ; intento += 1) {
    const existentes = await ControlModel.find(
      { tipo: datos.tipo, puestoId, dia },
      { numero: 1 },
    ).lean<{ numero: number }[]>();
    const usados = new Set(existentes.map((control) => control.numero));
    const numero = Array.from({ length: limite }, (_, i) => i + 1).find((n) => !usados.has(n));

    if (numero === undefined) {
      throw ApiError.conflict(
        `Ya registró los ${limite} controles de ${nombreDeControl(datos.tipo)} de este día. ` +
          'Los registros no se modifican; si hubo un error, informe al supervisor.',
      );
    }

    try {
      const control = await ControlModel.create({
        puestoId,
        usuarioId: new Types.ObjectId(autor.usuarioId),
        tipo: datos.tipo,
        numero,
        dia,
        horaDispositivo,
        registradoEn,
        temperatura: datos.temperatura,
        ph: datos.tipo === 'exhibicion' ? (datos.ph ?? null) : null,
        tipoCarne: datos.tipo === 'exhibicion' ? (datos.tipoCarne ?? null) : null,
        dentroRango: evaluacion.dentroRango,
        desviaciones: evaluacion.desviaciones,
        observaciones: datos.observaciones ?? null,
      });

      await auditar({
        coleccion: 'controles',
        documentoId: control._id,
        accion: 'crear',
        usuarioId: autor.usuarioId,
        puestoId: autor.puestoId,
        detalle:
          `${datos.tipo} n.º ${numero} — hora del teléfono ` +
          `${formatInZone(horaDispositivo, TZ)}`,
      });

      return control.toObject();
    } catch (error) {
      if (!esClaveDuplicada(error)) throw error;
      if (error.keyPattern && 'horaDispositivo' in error.keyPattern) throw yaRegistrado();
      // Otro registro simultáneo tomó el mismo número: se vuelve a elegir.
      if (intento >= INTENTOS_NUMERACION) throw yaRegistrado();
    }
  }
}

export interface ControlDelDia {
  tipo: TipoControl;
  numero: number;
  estado: EstadoControl;
  semaforo: Semaforo;
  registro: Control | null;
}

/**
 * Los controles que corresponden a un puesto en un día, con o sin registro.
 * Los que faltan se calculan al vuelo: la ausencia no se almacena (R8).
 */
export async function estadoDelDia(
  puestoId: string,
  dia: string | undefined,
  ahora: Date = new Date(),
): Promise<{ dia: string; controles: ControlDelDia[] }> {
  const configuracion = await obtenerConfiguracion();
  const diaConsultado = dia ?? zonedDayKey(ahora, TZ);

  const registros = await ControlModel.find({
    puestoId: new Types.ObjectId(puestoId),
    dia: diaConsultado,
  }).lean();

  const controles: ControlDelDia[] = [];
  for (const tipo of ['exhibicion', 'refrigeracion'] as const) {
    const delTipo = registros.filter((registro) => registro.tipo === tipo);
    // Si la cantidad configurada bajó después de registrar, no se ocultan registros.
    const total = Math.max(
      cantidadPorDia(tipo, configuracion),
      // Un registro anterior a la migración no tiene número: no debe dar NaN.
      ...delTipo.map((registro) => Number(registro.numero) || 0),
    );

    for (let numero = 1; numero <= total; numero += 1) {
      const registro = delTipo.find((r) => r.numero === numero) ?? null;
      const estado = estadoDeControl(registro !== null, diaConsultado, TZ, ahora);
      controles.push({
        tipo,
        numero,
        estado,
        semaforo: semaforoDeControl(estado, registro?.dentroRango ?? true),
        registro,
      });
    }
  }

  return { dia: diaConsultado, controles };
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
  if (filtros.dentroRango !== undefined) consulta.dentroRango = filtros.dentroRango;

  // El día de un control sale de la hora del teléfono, así que se filtra por él.
  if (filtros.desde || filtros.hasta) {
    const rango: Record<string, string> = {};
    if (filtros.desde) rango.$gte = filtros.desde;
    if (filtros.hasta) rango.$lte = filtros.hasta;
    consulta.dia = rango;
  }

  const { page, limit } = filtros;
  const [datos, total] = await Promise.all([
    ControlModel.find(consulta)
      .sort({ horaDispositivo: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ControlModel.countDocuments(consulta),
  ]);

  return buildPaginated(datos, total, { page, limit });
}
