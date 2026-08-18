import type { FilterQuery } from 'mongoose';
import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import type { EstadoAccion } from '../../domain/constants.js';
import { estaVencida } from '../../domain/maintenance.js';
import { NoConformidadModel, type NoConformidad } from '../../models/NoConformidad.js';
import { auditar } from '../../services/auditoria.service.js';
import { crearNotificacion } from '../../services/notificaciones.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildPaginated, type Paginated } from '../../utils/pagination.js';
import type {
  ActualizarNoConformidadInput,
  CerrarNoConformidadInput,
  CrearNoConformidadInput,
  ListarNoConformidadesInput,
} from './noConformidades.schemas.js';
import { siguienteNumero } from '../../models/Contador.js';

const TZ = env.DISPLAY_TIMEZONE;

export interface NoConformidadConEstado extends NoConformidad {
  /** Estado real en el momento de la consulta: incluye el plazo vencido (R8). */
  estadoActual: EstadoAccion;
}

/**
 * El plazo vencido no se guarda: se deduce comparando la fecha límite con hoy,
 * de modo que la lista siempre está al día sin depender de una tarea programada.
 */
function conEstadoActual(nc: NoConformidad, ahora = new Date()): NoConformidadConEstado {
  const abierta = nc.estado === 'pendiente' || nc.estado === 'en_proceso';
  const vencida = abierta && estaVencida(nc.fechaLimite, TZ, ahora);
  return { ...nc, estadoActual: vencida ? 'plazo_vencido' : nc.estado };
}

/** Alta manual, para un hallazgo detectado fuera de una inspección. */
export async function crearNoConformidad(
  datos: CrearNoConformidadInput,
  supervisorId: string,
): Promise<NoConformidadConEstado> {
  const numero = await siguienteNumero('noConformidad');
  const creada = await NoConformidadModel.create({
    numero,
    puestoId: datos.puestoId ? new Types.ObjectId(datos.puestoId) : null,
    equipoId: datos.equipoId ? new Types.ObjectId(datos.equipoId) : null,
    supervisorId: new Types.ObjectId(supervisorId),
    hallazgo: datos.hallazgo,
    origen: datos.origen ?? 'Registro manual del supervisor',
    detectadaEn: new Date(),
    evidencia: datos.evidencia.map((e) => ({ ...e, subidoEn: new Date() })),
    accionCorrectiva: datos.accionCorrectiva ?? null,
    responsable: datos.responsable ?? null,
    fechaLimite: datos.fechaLimite ?? null,
    estado: 'pendiente',
  });

  await auditar({
    coleccion: 'noConformidades',
    documentoId: creada._id,
    accion: 'crear',
    usuarioId: supervisorId,
    puestoId: datos.puestoId ?? null,
    detalle: `No conformidad N.° ${numero}`,
  });

  return conEstadoActual(creada.toObject());
}

export async function listarNoConformidades(
  filtros: ListarNoConformidadesInput,
  puestoObligatorio: string | null,
): Promise<Paginated<NoConformidadConEstado>> {
  const consulta: FilterQuery<NoConformidad> = {};
  const puestoId = puestoObligatorio ?? filtros.puestoId;
  if (puestoId) consulta.puestoId = new Types.ObjectId(puestoId);
  if (filtros.estado && filtros.estado !== 'plazo_vencido') consulta.estado = filtros.estado;

  const { page, limit } = filtros;
  const [datos, total] = await Promise.all([
    NoConformidadModel.find(consulta)
      .populate('puestoId', 'numero nombre')
      .sort({ detectadaEn: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    NoConformidadModel.countDocuments(consulta),
  ]);

  const ahora = new Date();
  let resultado = datos.map((nc) => conEstadoActual(nc, ahora));

  // "Plazo vencido" es un estado calculado, así que se filtra después.
  if (filtros.estado === 'plazo_vencido') {
    resultado = resultado.filter((nc) => nc.estadoActual === 'plazo_vencido');
  }
  if (filtros.vencidas) {
    resultado = resultado.filter((nc) => nc.estadoActual === 'plazo_vencido');
  }

  return buildPaginated(resultado, filtros.estado === 'plazo_vencido' ? resultado.length : total, {
    page,
    limit,
  });
}

export async function obtenerNoConformidad(
  id: string,
  puestoObligatorio: string | null,
): Promise<NoConformidadConEstado> {
  const nc = await NoConformidadModel.findById(id).lean();
  if (!nc) throw ApiError.notFound('La no conformidad no existe.');
  if (puestoObligatorio && String(nc.puestoId) !== puestoObligatorio) {
    throw ApiError.forbidden('Solo puede consultar las no conformidades de su propio puesto.');
  }
  return conEstadoActual(nc);
}

/** Define o corrige la acción correctiva, su responsable y su plazo. */
export async function actualizarNoConformidad(
  id: string,
  cambios: ActualizarNoConformidadInput,
  usuarioId: string,
): Promise<NoConformidadConEstado> {
  const nc = await NoConformidadModel.findById(id);
  if (!nc) throw ApiError.notFound('La no conformidad no existe.');
  if (nc.estado === 'realizado') {
    throw ApiError.conflict('La acción ya fue verificada y cerrada; no puede modificarse.');
  }

  if (cambios.accionCorrectiva !== undefined) nc.accionCorrectiva = cambios.accionCorrectiva;
  if (cambios.responsable !== undefined) nc.responsable = cambios.responsable;
  if (cambios.fechaLimite !== undefined) nc.fechaLimite = cambios.fechaLimite;
  if (cambios.estado !== undefined) nc.estado = cambios.estado;
  if (cambios.evidenciaCierre) {
    nc.evidenciaCierre = cambios.evidenciaCierre.map((e) => ({ ...e, subidoEn: new Date() }));
  }

  await nc.save();

  await auditar({
    coleccion: 'noConformidades',
    documentoId: nc._id,
    accion: 'actualizar',
    usuarioId,
    puestoId: nc.puestoId ? String(nc.puestoId) : null,
    detalle: `Seguimiento de la no conformidad N.° ${nc.numero}`,
  });

  // Avisar al puesto en cuanto se le asigna una acción con plazo.
  if (cambios.accionCorrectiva && nc.puestoId) {
    await crearNotificacion({
      puestoId: nc.puestoId,
      tipo: 'accion_correctiva',
      titulo: `Acción correctiva N.° ${nc.numero}`,
      mensaje: cambios.accionCorrectiva,
      referencia: { coleccion: 'noConformidades', documentoId: nc._id },
    });
  }

  return conEstadoActual(nc.toObject());
}

/**
 * Verificación y cierre por parte del supervisor: el último paso de la cadena
 * inspección → hallazgo → acción → evidencia → verificación → cierre.
 */
export async function cerrarNoConformidad(
  id: string,
  datos: CerrarNoConformidadInput,
  supervisorId: string,
): Promise<NoConformidadConEstado> {
  const nc = await NoConformidadModel.findById(id);
  if (!nc) throw ApiError.notFound('La no conformidad no existe.');
  if (nc.estado === 'realizado') throw ApiError.conflict('La acción ya estaba cerrada.');
  if (!nc.accionCorrectiva) {
    throw ApiError.badRequest('Antes de cerrar debe registrarse la acción correctiva aplicada.');
  }

  nc.estado = 'realizado';
  nc.verificadaPor = new Types.ObjectId(supervisorId);
  nc.verificadaEn = new Date();
  nc.comentarioCierre = datos.comentarioCierre ?? null;
  if (datos.evidenciaCierre?.length) {
    nc.evidenciaCierre = datos.evidenciaCierre.map((e) => ({ ...e, subidoEn: new Date() }));
  }
  await nc.save();

  await auditar({
    coleccion: 'noConformidades',
    documentoId: nc._id,
    accion: 'cerrar',
    usuarioId: supervisorId,
    puestoId: nc.puestoId ? String(nc.puestoId) : null,
    detalle: `Cierre de la no conformidad N.° ${nc.numero}`,
  });

  return conEstadoActual(nc.toObject());
}
