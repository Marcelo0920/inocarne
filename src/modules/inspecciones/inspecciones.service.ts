import type { FilterQuery } from 'mongoose';
import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { evaluarMediciones } from '../../domain/ranges.js';
import { endOfZonedDay, startOfZonedDay, zonedDayKey } from '../../domain/time.js';
import { siguienteNumero } from '../../models/Contador.js';
import {
  InspeccionModel,
  type Inspeccion,
  type MedicionInspeccion,
} from '../../models/Inspeccion.js';
import { NoConformidadModel, type NoConformidad } from '../../models/NoConformidad.js';
import { auditar } from '../../services/auditoria.service.js';
import { obtenerConfiguracion } from '../../services/configuracion.service.js';
import { crearNotificacion } from '../../services/notificaciones.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildPaginated, type Paginated } from '../../utils/pagination.js';
import type { CrearInspeccionInput, ListarInspeccionesInput } from './inspecciones.schemas.js';

const TZ = env.DISPLAY_TIMEZONE;

export interface ResultadoInspeccion {
  inspeccion: Inspeccion;
  noConformidades: NoConformidad[];
}

/**
 * Registra una inspección del supervisor (punto 11) y genera automáticamente
 * una no conformidad por cada punto marcado como "no cumple" (regla R7).
 */
export async function registrarInspeccion(
  datos: CrearInspeccionInput,
  supervisorId: string,
): Promise<ResultadoInspeccion> {
  const configuracion = await obtenerConfiguracion();

  const esperados =
    datos.tipo === 'mercado'
      ? configuracion.puntosInspeccionMercado
      : configuracion.puntosInspeccionPuesto;
  const recibidos = datos.items.map((item) => item.nombre);
  const faltantes = esperados.filter((punto) => !recibidos.includes(punto));
  if (faltantes.length > 0) {
    throw ApiError.badRequest('La inspección está incompleta.', { faltantes });
  }

  if (datos.tipo === 'puesto' && !datos.puestoId) {
    throw ApiError.badRequest('Indique el puesto inspeccionado.');
  }

  // Las mediciones tomadas durante la inspección usan los mismos rangos (R3).
  let medicion: MedicionInspeccion | null = null;
  if (datos.medicion && (datos.medicion.temperatura != null || datos.medicion.ph != null)) {
    const evaluacion = evaluarMediciones(
      {
        temperatura: datos.medicion.temperatura,
        ph: datos.medicion.ph,
        tipoCarne: datos.medicion.tipoCarne,
      },
      configuracion,
    );
    medicion = {
      temperatura: datos.medicion.temperatura ?? null,
      ph: datos.medicion.ph ?? null,
      tipoCarne: datos.medicion.tipoCarne ?? null,
      dentroRango: evaluacion.dentroRango,
      desviaciones: evaluacion.desviaciones,
    };
  }

  const registradoEn = new Date();
  const incumplimientos = datos.items.filter((item) => !item.cumple).map((item) => item.nombre);

  const inspeccion = await InspeccionModel.create({
    tipo: datos.tipo,
    supervisorId: new Types.ObjectId(supervisorId),
    puestoId: datos.puestoId ? new Types.ObjectId(datos.puestoId) : null,
    registradoEn,
    dia: zonedDayKey(registradoEn, TZ),
    items: datos.items,
    medicion,
    observaciones: datos.observaciones ?? null,
    fotos: datos.fotos.map((foto) => ({ ...foto, subidoEn: new Date() })),
    cumple: incumplimientos.length === 0 && (medicion?.dentroRango ?? true),
    incumplimientos,
  });

  await auditar({
    coleccion: 'inspecciones',
    documentoId: inspeccion._id,
    accion: 'crear',
    usuarioId: supervisorId,
    puestoId: datos.puestoId ?? null,
    detalle: `Inspección de ${datos.tipo} — ${incumplimientos.length} incumplimiento(s)`,
  });

  const noConformidades = await generarNoConformidades(datos, inspeccion, supervisorId, medicion);
  return { inspeccion: inspeccion.toObject(), noConformidades };
}

/** Crea una no conformidad por cada punto incumplido y por cada medición fuera de rango. */
async function generarNoConformidades(
  datos: CrearInspeccionInput,
  inspeccion: { _id: Types.ObjectId; fotos: unknown[] },
  supervisorId: string,
  medicion: { dentroRango: boolean; desviaciones: string[] } | null,
): Promise<NoConformidad[]> {
  const hallazgos: string[] = datos.items
    .filter((item) => !item.cumple)
    .map((item) => (item.comentario ? `${item.nombre}: ${item.comentario}` : item.nombre));

  if (medicion && !medicion.dentroRango) hallazgos.push(...medicion.desviaciones);
  if (hallazgos.length === 0) return [];

  const evidencia = datos.fotos.map((foto) => ({ ...foto, subidoEn: new Date() }));
  const origen = datos.tipo === 'mercado' ? 'Inspección del mercado' : 'Inspección de puesto';

  const creadas: NoConformidad[] = [];
  for (const hallazgo of hallazgos) {
    const numero = await siguienteNumero('noConformidad');
    const noConformidad = await NoConformidadModel.create({
      numero,
      inspeccionId: inspeccion._id,
      puestoId: datos.puestoId ? new Types.ObjectId(datos.puestoId) : null,
      supervisorId: new Types.ObjectId(supervisorId),
      hallazgo,
      origen,
      detectadaEn: new Date(),
      evidencia,
      estado: 'pendiente',
    });
    creadas.push(noConformidad.toObject());
  }

  // El puesto debe enterarse de lo que se le detectó.
  if (datos.puestoId) {
    await crearNotificacion({
      puestoId: datos.puestoId,
      tipo: 'accion_correctiva',
      titulo: 'Se registraron incumplimientos en su puesto',
      mensaje: hallazgos.join(' · '),
      referencia: { coleccion: 'inspecciones', documentoId: inspeccion._id },
    });
  }

  return creadas;
}

/** Plantillas de checklist para que la interfaz siempre muestre los mismos puntos. */
export async function obtenerPlantillasInspeccion(): Promise<{
  mercado: string[];
  puesto: string[];
}> {
  const configuracion = await obtenerConfiguracion();
  return {
    mercado: configuracion.puntosInspeccionMercado,
    puesto: configuracion.puntosInspeccionPuesto,
  };
}

export async function listarInspecciones(
  filtros: ListarInspeccionesInput,
  puestoObligatorio: string | null,
): Promise<Paginated<Inspeccion>> {
  const consulta: FilterQuery<Inspeccion> = {};
  const puestoId = puestoObligatorio ?? filtros.puestoId;
  if (puestoId) consulta.puestoId = new Types.ObjectId(puestoId);
  if (filtros.tipo) consulta.tipo = filtros.tipo;
  if (filtros.cumple !== undefined) consulta.cumple = filtros.cumple;

  if (filtros.desde || filtros.hasta) {
    const rango: Record<string, Date> = {};
    if (filtros.desde) rango.$gte = startOfZonedDay(filtros.desde, TZ);
    if (filtros.hasta) rango.$lt = endOfZonedDay(filtros.hasta, TZ);
    consulta.registradoEn = rango;
  }

  const { page, limit } = filtros;
  const [datos, total] = await Promise.all([
    InspeccionModel.find(consulta)
      .populate('puestoId', 'numero nombre')
      .sort({ registradoEn: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    InspeccionModel.countDocuments(consulta),
  ]);

  return buildPaginated(datos, total, { page, limit });
}

export async function obtenerInspeccion(
  id: string,
  puestoObligatorio: string | null,
): Promise<{ inspeccion: Inspeccion; noConformidades: NoConformidad[] }> {
  const inspeccion = await InspeccionModel.findById(id).lean();
  if (!inspeccion) throw ApiError.notFound('La inspección no existe.');
  if (puestoObligatorio && String(inspeccion.puestoId) !== puestoObligatorio) {
    throw ApiError.forbidden('Solo puede consultar las inspecciones de su propio puesto.');
  }
  const noConformidades = await NoConformidadModel.find({ inspeccionId: inspeccion._id }).lean();
  return { inspeccion, noConformidades };
}
