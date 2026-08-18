import type { FilterQuery } from 'mongoose';
import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { evaluarMediciones } from '../../domain/ranges.js';
import { endOfZonedDay, startOfZonedDay, zonedDayKey } from '../../domain/time.js';
import { RecepcionModel, type Recepcion } from '../../models/Recepcion.js';
import { auditar } from '../../services/auditoria.service.js';
import { obtenerConfiguracion } from '../../services/configuracion.service.js';
import { crearNotificacion } from '../../services/notificaciones.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildPaginated, type Paginated } from '../../utils/pagination.js';
import type { CrearRecepcionInput, ListarRecepcionesInput } from './recepciones.schemas.js';

const TZ = env.DISPLAY_TIMEZONE;

interface Autor {
  usuarioId: string;
  puestoId: string;
}

/**
 * Registra una recepción de carne (punto 6).
 * La fecha y la hora las pone el servidor (R1) y las mediciones se validan
 * contra los rangos configurados (R3). La recepción no tiene horario fijo,
 * por lo que nunca se marca como realizada con retraso (R5).
 */
export async function registrarRecepcion(
  datos: CrearRecepcionInput,
  autor: Autor,
): Promise<Recepcion> {
  const configuracion = await obtenerConfiguracion();
  const evaluacion = evaluarMediciones(
    { temperatura: datos.temperatura, ph: datos.ph, tipoCarne: datos.tipoCarne },
    configuracion,
  );

  const organolepticasFallidas = Object.entries(datos.organolepticas)
    .filter(([, cumple]) => !cumple)
    .map(([condicion]) => condicion);

  // La evidencia fotográfica es obligatoria cuando la carne no cumple (punto 6).
  const requiereFoto =
    datos.resultado === 'rechazado' || !evaluacion.dentroRango || organolepticasFallidas.length > 0;
  if (requiereFoto && datos.fotos.length === 0) {
    throw ApiError.badRequest(
      'Adjunte una fotografía: la carne no cumple con las condiciones aceptables.',
    );
  }

  const registradoEn = new Date();
  const desviaciones = [...evaluacion.desviaciones];
  if (organolepticasFallidas.length > 0) {
    desviaciones.push(
      `Condiciones organolépticas no aceptables: ${organolepticasFallidas.join(', ')}`,
    );
  }

  const recepcion = await RecepcionModel.create({
    puestoId: new Types.ObjectId(autor.puestoId),
    usuarioId: new Types.ObjectId(autor.usuarioId),
    registradoEn,
    dia: zonedDayKey(registradoEn, TZ),
    proveedor: datos.proveedor,
    tipoCarne: datos.tipoCarne,
    cantidad: datos.cantidad,
    unidad: datos.unidad,
    temperatura: datos.temperatura,
    ph: datos.ph,
    organolepticas: datos.organolepticas,
    resultado: datos.resultado,
    motivoRechazo: datos.motivoRechazo ?? null,
    firma: { ...datos.firma, subidoEn: new Date() },
    fotos: datos.fotos.map((foto) => ({ ...foto, subidoEn: new Date() })),
    observaciones: datos.observaciones ?? null,
    dentroRango: evaluacion.dentroRango && organolepticasFallidas.length === 0,
    desviaciones,
  });

  await auditar({
    coleccion: 'recepciones',
    documentoId: recepcion._id,
    accion: 'crear',
    usuarioId: autor.usuarioId,
    puestoId: autor.puestoId,
    detalle: `Recepción ${datos.resultado} — ${datos.proveedor}`,
  });

  // El supervisor debe enterarse de un rechazo o de un valor fuera de rango.
  if (datos.resultado === 'rechazado' || !evaluacion.dentroRango) {
    await crearNotificacion({
      paraSupervision: true,
      tipo: 'recepcion_rechazada',
      titulo:
        datos.resultado === 'rechazado'
          ? 'Recepción de carne rechazada'
          : 'Recepción fuera de rango',
      mensaje:
        desviaciones.length > 0
          ? desviaciones.join(' · ')
          : (datos.motivoRechazo ?? 'Recepción rechazada por el vendedor.'),
      referencia: { coleccion: 'recepciones', documentoId: recepcion._id },
    });
  }

  return recepcion.toObject();
}

/** Historial de recepciones, filtrado por puesto, fechas y resultado. */
export async function listarRecepciones(
  filtros: ListarRecepcionesInput,
  puestoObligatorio: string | null,
): Promise<Paginated<Recepcion>> {
  const consulta: FilterQuery<Recepcion> = {};

  const puestoId = puestoObligatorio ?? filtros.puestoId;
  if (puestoId) consulta.puestoId = new Types.ObjectId(puestoId);
  if (filtros.resultado) consulta.resultado = filtros.resultado;

  if (filtros.desde || filtros.hasta) {
    const rango: Record<string, Date> = {};
    if (filtros.desde) rango.$gte = startOfZonedDay(filtros.desde, TZ);
    if (filtros.hasta) rango.$lt = endOfZonedDay(filtros.hasta, TZ);
    consulta.registradoEn = rango;
  }

  const { page, limit } = filtros;
  const [datos, total] = await Promise.all([
    RecepcionModel.find(consulta)
      .sort({ registradoEn: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    RecepcionModel.countDocuments(consulta),
  ]);

  return buildPaginated(datos, total, { page, limit });
}

export async function obtenerRecepcion(
  id: string,
  puestoObligatorio: string | null,
): Promise<Recepcion> {
  const recepcion = await RecepcionModel.findById(id).lean();
  if (!recepcion) throw ApiError.notFound('La recepción no existe.');
  if (puestoObligatorio && String(recepcion.puestoId) !== puestoObligatorio) {
    throw ApiError.forbidden('Solo puede consultar los registros de su propio puesto.');
  }
  return recepcion;
}
