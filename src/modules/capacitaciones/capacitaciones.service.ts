import type { FilterQuery } from 'mongoose';
import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { formatInZone } from '../../domain/time.js';
import { CapacitacionModel, type Capacitacion } from '../../models/Capacitacion.js';
import { PuestoModel } from '../../models/Puesto.js';
import { auditar } from '../../services/auditoria.service.js';
import { crearNotificaciones } from '../../services/notificaciones.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildPaginated, type Paginated } from '../../utils/pagination.js';
import type {
  ActualizarCapacitacionInput,
  CrearCapacitacionInput,
  ListarCapacitacionesInput,
  RegistrarAsistenciaInput,
} from './capacitaciones.schemas.js';

const TZ = env.DISPLAY_TIMEZONE;

/** Puestos convocados: los indicados, o todos si no se indica ninguno. */
async function resolverPuestos(puestos: string[] | undefined): Promise<Types.ObjectId[]> {
  if (puestos?.length) return puestos.map((id) => new Types.ObjectId(id));
  const activos = await PuestoModel.find({ activo: true }).select('_id').lean();
  return activos.map((puesto) => puesto._id);
}

/** Programa una capacitación y avisa a los puestos convocados (punto 12). */
export async function crearCapacitacion(
  datos: CrearCapacitacionInput,
  creadoPor: string,
): Promise<Capacitacion> {
  const puestos = await resolverPuestos(datos.puestos);

  const capacitacion = await CapacitacionModel.create({
    tema: datos.tema,
    fechaProgramada: datos.fechaProgramada,
    hora: datos.hora,
    lugar: datos.lugar ?? null,
    capacitador: datos.capacitador ?? null,
    puestos,
    participantes: datos.participantes ?? [],
    estado: 'programada',
    observaciones: datos.observaciones ?? null,
    creadoPor: new Types.ObjectId(creadoPor),
  });

  await crearNotificaciones(puestos, {
    tipo: 'capacitacion',
    titulo: 'Capacitación programada',
    mensaje:
      `Tema: ${datos.tema}. Fecha: ${formatInZone(datos.fechaProgramada, TZ).split(' ')[0]} ` +
      `a las ${datos.hora} h.` +
      (datos.lugar ? ` Lugar: ${datos.lugar}.` : ''),
    referencia: { coleccion: 'capacitaciones', documentoId: capacitacion._id },
  });

  await auditar({
    coleccion: 'capacitaciones',
    documentoId: capacitacion._id,
    accion: 'crear',
    usuarioId: creadoPor,
    detalle: `Capacitación: ${datos.tema}`,
  });

  return capacitacion.toObject();
}

export async function listarCapacitaciones(
  filtros: ListarCapacitacionesInput,
  puestoObligatorio: string | null,
): Promise<Paginated<Capacitacion>> {
  const consulta: FilterQuery<Capacitacion> = {};
  if (filtros.estado) consulta.estado = filtros.estado;
  // El vendedor solo ve aquellas a las que fue convocado.
  const puestoId = puestoObligatorio ?? filtros.puestoId;
  if (puestoId) consulta.puestos = new Types.ObjectId(puestoId);

  const { page, limit } = filtros;
  const [datos, total] = await Promise.all([
    CapacitacionModel.find(consulta)
      .sort({ fechaProgramada: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    CapacitacionModel.countDocuments(consulta),
  ]);

  return buildPaginated(datos, total, { page, limit });
}

export async function obtenerCapacitacion(id: string): Promise<Capacitacion> {
  const capacitacion = await CapacitacionModel.findById(id).lean();
  if (!capacitacion) throw ApiError.notFound('La capacitación no existe.');
  return capacitacion;
}

export async function actualizarCapacitacion(
  id: string,
  cambios: ActualizarCapacitacionInput,
  usuarioId: string,
): Promise<Capacitacion> {
  const capacitacion = await CapacitacionModel.findById(id);
  if (!capacitacion) throw ApiError.notFound('La capacitación no existe.');

  const fechaAnterior = capacitacion.fechaProgramada;
  Object.assign(capacitacion, cambios);

  if (cambios.puestos) {
    capacitacion.puestos = await resolverPuestos(cambios.puestos);
  }
  if (cambios.evidencia) {
    capacitacion.evidencia = cambios.evidencia.map((e) => ({ ...e, subidoEn: new Date() }));
  }
  await capacitacion.save();

  // Si se movió la fecha, los puestos deben enterarse del cambio.
  const seReprogramo =
    cambios.fechaProgramada && cambios.fechaProgramada.getTime() !== fechaAnterior.getTime();
  if (seReprogramo) {
    await crearNotificaciones(capacitacion.puestos, {
      tipo: 'capacitacion',
      titulo: 'Capacitación reprogramada',
      mensaje:
        `Tema: ${capacitacion.tema}. Nueva fecha: ` +
        `${formatInZone(capacitacion.fechaProgramada, TZ).split(' ')[0]} a las ${capacitacion.hora} h.`,
      referencia: { coleccion: 'capacitaciones', documentoId: capacitacion._id },
    });
  }

  await auditar({
    coleccion: 'capacitaciones',
    documentoId: capacitacion._id,
    accion: 'actualizar',
    usuarioId,
    detalle: `Actualización de la capacitación ${capacitacion.tema}`,
  });

  return capacitacion.toObject();
}

/** Cierra la capacitación con su lista de asistentes y su evidencia. */
export async function registrarAsistencia(
  id: string,
  datos: RegistrarAsistenciaInput,
  usuarioId: string,
): Promise<Capacitacion> {
  const capacitacion = await CapacitacionModel.findById(id);
  if (!capacitacion) throw ApiError.notFound('La capacitación no existe.');

  capacitacion.participantes = datos.participantes.map((p) => ({
    puestoId: p.puestoId ? new Types.ObjectId(p.puestoId) : null,
    nombre: p.nombre,
    asistio: p.asistio,
  }));
  capacitacion.fechaRealizada = datos.fechaRealizada ?? new Date();
  capacitacion.estado = 'realizada';
  if (datos.evidencia?.length) {
    capacitacion.evidencia = datos.evidencia.map((e) => ({ ...e, subidoEn: new Date() }));
  }
  if (datos.observaciones !== undefined) capacitacion.observaciones = datos.observaciones;

  await capacitacion.save();

  await auditar({
    coleccion: 'capacitaciones',
    documentoId: capacitacion._id,
    accion: 'cerrar',
    usuarioId,
    detalle: `Capacitación realizada: ${capacitacion.tema}`,
  });

  return capacitacion.toObject();
}
