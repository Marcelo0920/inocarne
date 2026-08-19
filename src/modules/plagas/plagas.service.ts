import type { FilterQuery } from 'mongoose';
import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { addDays, formatInZone } from '../../domain/time.js';
import { ControlPlagasModel, type ControlPlagas } from '../../models/ControlPlagas.js';
import { PuestoModel } from '../../models/Puesto.js';
import { auditar } from '../../services/auditoria.service.js';
import { obtenerConfiguracion } from '../../services/configuracion.service.js';
import { crearNotificaciones } from '../../services/notificaciones.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildPaginated, type Paginated } from '../../utils/pagination.js';
import type {
  ActualizarPlagaInput,
  CrearPlagaInput,
  ListarPlagasInput,
  RegistrarPlagaRealizadaInput,
} from './plagas.schemas.js';

const TZ = env.DISPLAY_TIMEZONE;

async function resolverPuestos(
  puestos: string[] | undefined,
  todos: boolean,
): Promise<Types.ObjectId[]> {
  if (!todos && puestos?.length) return puestos.map((id) => new Types.ObjectId(id));
  const activos = await PuestoModel.find({ activo: true }).select('_id').lean();
  return activos.map((puesto) => puesto._id);
}

/** Texto del aviso que reciben los puestos antes de una fumigación. */
export function mensajeAviso(actividad: { fechaProgramada: Date; hora: string }): string {
  const fecha = formatInZone(actividad.fechaProgramada, TZ).split(' ')[0];
  return (
    `Se realizará control/fumigación de plagas el día ${fecha} a las ${actividad.hora} h. ` +
    'Tome las previsiones necesarias para proteger y guardar adecuadamente sus productos, ' +
    'utensilios y demás elementos antes de la actividad.'
  );
}

/**
 * Programa una actividad de control de plagas (punto 13) y deja creados los
 * avisos con la antelación configurada: 7 días, 3 días, 24 horas y el mismo día.
 * Cada aviso queda programado y se entrega cuando llega su momento.
 */
export async function crearControlPlagas(
  datos: CrearPlagaInput,
  creadoPor: string,
): Promise<{ actividad: ControlPlagas; avisosProgramados: number }> {
  const configuracion = await obtenerConfiguracion();
  const puestos = await resolverPuestos(datos.puestos, datos.todosLosPuestos ?? false);

  const actividad = await ControlPlagasModel.create({
    fechaProgramada: datos.fechaProgramada,
    hora: datos.hora,
    tipoActividad: datos.tipoActividad ?? 'Control integral de plagas y roedores',
    empresa: datos.empresa ?? null,
    areas: datos.areas ?? [],
    puestos,
    todosLosPuestos: datos.todosLosPuestos ?? false,
    estado: 'programada',
    observaciones: datos.observaciones ?? null,
    creadoPor: new Types.ObjectId(creadoPor),
  });

  const mensaje = mensajeAviso(actividad);
  const titulo = 'AVISO DE CONTROL DE PLAGAS';
  let avisosProgramados = 0;

  for (const diasAntes of configuracion.diasAvisoPlagas) {
    const momento = addDays(actividad.fechaProgramada, -diasAntes);
    // Un aviso cuyo momento ya pasó se entrega de inmediato.
    const programadaPara = momento.getTime() < Date.now() ? new Date() : momento;
    avisosProgramados += await crearNotificaciones(puestos, {
      tipo: 'control_plagas',
      titulo,
      mensaje,
      referencia: { coleccion: 'controlPlagas', documentoId: actividad._id },
      programadaPara,
    });
  }

  await auditar({
    coleccion: 'controlPlagas',
    documentoId: actividad._id,
    accion: 'crear',
    usuarioId: creadoPor,
    detalle: `Control de plagas programado para ${formatInZone(actividad.fechaProgramada, TZ)}`,
  });

  return { actividad: actividad.toObject(), avisosProgramados };
}

export interface ControlPlagasConEstado extends ControlPlagas {
  /** `vencida` si pasó la fecha y nunca se registró como realizada. */
  estadoActual: ControlPlagas['estado'];
}

function conEstadoActual(actividad: ControlPlagas, ahora = new Date()): ControlPlagasConEstado {
  const vencida =
    actividad.estado === 'programada' && actividad.fechaProgramada.getTime() < ahora.getTime();
  return { ...actividad, estadoActual: vencida ? 'vencida' : actividad.estado };
}

export async function listarControlPlagas(
  filtros: ListarPlagasInput,
  puestoObligatorio: string | null,
): Promise<Paginated<ControlPlagasConEstado>> {
  const consulta: FilterQuery<ControlPlagas> = {};
  if (puestoObligatorio) consulta.puestos = new Types.ObjectId(puestoObligatorio);
  else if (filtros.puestoId) consulta.puestos = new Types.ObjectId(filtros.puestoId);

  const { page, limit } = filtros;
  const [datos, total] = await Promise.all([
    ControlPlagasModel.find(consulta)
      .sort({ fechaProgramada: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ControlPlagasModel.countDocuments(consulta),
  ]);

  const ahora = new Date();
  let resultado = datos.map((actividad) => conEstadoActual(actividad, ahora));
  if (filtros.estado) {
    resultado = resultado.filter((actividad) => actividad.estadoActual === filtros.estado);
  }

  return buildPaginated(resultado, filtros.estado ? resultado.length : total, { page, limit });
}

export async function obtenerControlPlagas(id: string): Promise<ControlPlagasConEstado> {
  const actividad = await ControlPlagasModel.findById(id).lean();
  if (!actividad) throw ApiError.notFound('La actividad no existe.');
  return conEstadoActual(actividad);
}

export async function actualizarControlPlagas(
  id: string,
  cambios: ActualizarPlagaInput,
  usuarioId: string,
): Promise<ControlPlagasConEstado> {
  const actividad = await ControlPlagasModel.findById(id);
  if (!actividad) throw ApiError.notFound('La actividad no existe.');

  const fechaAnterior = actividad.fechaProgramada;
  Object.assign(actividad, cambios);
  if (cambios.puestos) {
    actividad.puestos = await resolverPuestos(cambios.puestos, false);
  }
  await actividad.save();

  const seReprogramo =
    cambios.fechaProgramada && cambios.fechaProgramada.getTime() !== fechaAnterior.getTime();
  if (seReprogramo) {
    await crearNotificaciones(actividad.puestos, {
      tipo: 'control_plagas',
      titulo: 'CONTROL DE PLAGAS REPROGRAMADO',
      mensaje: mensajeAviso(actividad),
      referencia: { coleccion: 'controlPlagas', documentoId: actividad._id },
    });
  }

  await auditar({
    coleccion: 'controlPlagas',
    documentoId: actividad._id,
    accion: 'actualizar',
    usuarioId,
    detalle: 'Actualización de la actividad de control de plagas',
  });

  return conEstadoActual(actividad.toObject());
}

/** Deja constancia de que la actividad se ejecutó, con su evidencia. */
export async function registrarRealizada(
  id: string,
  datos: RegistrarPlagaRealizadaInput,
  usuarioId: string,
): Promise<ControlPlagasConEstado> {
  const actividad = await ControlPlagasModel.findById(id);
  if (!actividad) throw ApiError.notFound('La actividad no existe.');

  actividad.estado = 'realizada';
  actividad.fechaRealizada = datos.fechaRealizada ?? new Date();
  if (datos.evidencia?.length) {
    actividad.evidencia = datos.evidencia.map((e) => ({ ...e, subidoEn: new Date() }));
  }
  if (datos.observaciones !== undefined) actividad.observaciones = datos.observaciones;
  await actividad.save();

  await auditar({
    coleccion: 'controlPlagas',
    documentoId: actividad._id,
    accion: 'cerrar',
    usuarioId,
    detalle: 'Control de plagas realizado',
  });

  return conEstadoActual(actividad.toObject());
}
