import type { FilterQuery } from 'mongoose';
import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import type { TurnoLimpieza } from '../../domain/constants.js';
import { endOfZonedDay, startOfZonedDay, zonedDayKey } from '../../domain/time.js';
import { LimpiezaModel, type Limpieza } from '../../models/Limpieza.js';
import { auditar } from '../../services/auditoria.service.js';
import { obtenerConfiguracion } from '../../services/configuracion.service.js';
import { crearNotificacion } from '../../services/notificaciones.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildPaginated, type Paginated } from '../../utils/pagination.js';
import type { CrearLimpiezaInput, ListarLimpiezasInput } from './limpiezas.schemas.js';

const TZ = env.DISPLAY_TIMEZONE;

interface Autor {
  usuarioId: string;
  puestoId: string;
}

/**
 * Registra un checklist de limpieza y desinfección (punto 9).
 * La hora la pone el servidor y solo se admite un checklist por turno y día.
 */
export async function registrarLimpieza(
  datos: CrearLimpiezaInput,
  autor: Autor,
): Promise<Limpieza> {
  const configuracion = await obtenerConfiguracion();

  // El checklist debe cubrir exactamente los puntos configurados: así el
  // registro histórico no queda incompleto ni con puntos inventados.
  const esperados = configuracion.puntosLimpieza;
  const recibidos = datos.items.map((item) => item.nombre);
  const faltantes = esperados.filter((punto) => !recibidos.includes(punto));
  if (faltantes.length > 0) {
    throw ApiError.badRequest('El checklist está incompleto.', { faltantes });
  }
  const sobrantes = recibidos.filter((punto) => !esperados.includes(punto));
  if (sobrantes.length > 0) {
    throw ApiError.badRequest('El checklist contiene puntos que no corresponden.', { sobrantes });
  }

  const incumplimientos = datos.items.filter((item) => !item.cumple).map((item) => item.nombre);
  const registradoEn = new Date();

  try {
    const limpieza = await LimpiezaModel.create({
      puestoId: new Types.ObjectId(autor.puestoId),
      usuarioId: new Types.ObjectId(autor.usuarioId),
      turno: datos.turno,
      dia: zonedDayKey(registradoEn, TZ),
      registradoEn,
      items: datos.items,
      observaciones: datos.observaciones ?? null,
      fotos: datos.fotos.map((foto) => ({ ...foto, subidoEn: new Date() })),
      cumple: incumplimientos.length === 0,
      incumplimientos,
    });

    await auditar({
      coleccion: 'limpiezas',
      documentoId: limpieza._id,
      accion: 'crear',
      usuarioId: autor.usuarioId,
      puestoId: autor.puestoId,
      detalle: `Limpieza ${datos.turno} — ${incumplimientos.length} incumplimiento(s)`,
    });

    if (incumplimientos.length > 0) {
      await crearNotificacion({
        paraSupervision: true,
        tipo: 'general',
        titulo: `Incumplimiento en limpieza ${datos.turno}`,
        mensaje: incumplimientos.join(' · '),
        referencia: { coleccion: 'limpiezas', documentoId: limpieza._id },
      });
    }

    return limpieza.toObject();
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as { code?: number }).code === 11000) {
      throw ApiError.conflict(`El checklist de limpieza ${datos.turno} de hoy ya fue registrado.`);
    }
    throw error;
  }
}

export interface EstadoTurno {
  turno: TurnoLimpieza;
  registrado: boolean;
  cumple: boolean | null;
  registro: Limpieza | null;
}

/** Estado de los dos turnos del día para un puesto. */
export async function estadoLimpiezaDelDia(
  puestoId: string,
  dia?: string,
): Promise<{ dia: string; turnos: EstadoTurno[] }> {
  const diaConsultado = dia ?? zonedDayKey(new Date(), TZ);
  const registros = await LimpiezaModel.find({
    puestoId: new Types.ObjectId(puestoId),
    dia: diaConsultado,
  }).lean();

  const turnos: EstadoTurno[] = (['inicial', 'final'] as const).map((turno) => {
    const registro = registros.find((r) => r.turno === turno) ?? null;
    return {
      turno,
      registrado: Boolean(registro),
      cumple: registro ? registro.cumple : null,
      registro,
    };
  });

  return { dia: diaConsultado, turnos };
}

/** Plantilla del checklist, para que la interfaz la muestre siempre igual. */
export async function obtenerPlantillaLimpieza(): Promise<{ puntos: string[] }> {
  const configuracion = await obtenerConfiguracion();
  return { puntos: configuracion.puntosLimpieza };
}

export async function listarLimpiezas(
  filtros: ListarLimpiezasInput,
  puestoObligatorio: string | null,
): Promise<Paginated<Limpieza>> {
  const consulta: FilterQuery<Limpieza> = {};

  const puestoId = puestoObligatorio ?? filtros.puestoId;
  if (puestoId) consulta.puestoId = new Types.ObjectId(puestoId);
  if (filtros.turno) consulta.turno = filtros.turno;
  if (filtros.cumple !== undefined) consulta.cumple = filtros.cumple;

  if (filtros.desde || filtros.hasta) {
    const rango: Record<string, Date> = {};
    if (filtros.desde) rango.$gte = startOfZonedDay(filtros.desde, TZ);
    if (filtros.hasta) rango.$lt = endOfZonedDay(filtros.hasta, TZ);
    consulta.registradoEn = rango;
  }

  const { page, limit } = filtros;
  const [datos, total] = await Promise.all([
    LimpiezaModel.find(consulta)
      .sort({ registradoEn: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    LimpiezaModel.countDocuments(consulta),
  ]);

  return buildPaginated(datos, total, { page, limit });
}
