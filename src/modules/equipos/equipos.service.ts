import type { FilterQuery } from 'mongoose';
import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import type { EstadoMantenimiento } from '../../domain/constants.js';
import { estadoMantenimiento } from '../../domain/maintenance.js';
import { endOfZonedDay, startOfZonedDay } from '../../domain/time.js';
import { EquipoModel, type Equipo } from '../../models/Equipo.js';
import { MantenimientoModel, type Mantenimiento } from '../../models/Mantenimiento.js';
import { PuestoModel } from '../../models/Puesto.js';
import { auditar } from '../../services/auditoria.service.js';
import { obtenerConfiguracion } from '../../services/configuracion.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildPaginated, type Paginated } from '../../utils/pagination.js';
import type {
  ActualizarEquipoInput,
  CrearEquipoInput,
  ListarEquiposInput,
  ListarMantenimientosInput,
  RegistrarMantenimientoInput,
} from './equipos.schemas.js';

const TZ = env.DISPLAY_TIMEZONE;

export interface EquipoConEstado extends Equipo {
  estadoMantenimiento: EstadoMantenimiento;
}

/** Añade a cada equipo el estado de su mantenimiento (punto 10.6). */
async function conEstado(equipos: Equipo[]): Promise<EquipoConEstado[]> {
  const { diasAvisoMantenimiento } = await obtenerConfiguracion();
  const ahora = new Date();
  return equipos.map((equipo) => ({
    ...equipo,
    estadoMantenimiento: estadoMantenimiento(
      equipo.proximoMantenimiento,
      diasAvisoMantenimiento,
      TZ,
      ahora,
    ),
  }));
}

/**
 * Código correlativo del equipo dentro de su puesto: `EQ-P3-01`, `EQ-P3-02`…
 *
 * El vendedor no inventa códigos: los asigna el sistema. Se busca el primer
 * número libre porque un equipo dado de baja deja su código ocupado y el
 * índice único no admite repetirlo.
 */
async function generarCodigo(puestoId: string): Promise<string> {
  const puesto = await PuestoModel.findById(puestoId).lean();
  if (!puesto) throw ApiError.badRequest('El puesto indicado no existe.');

  const existentes = await EquipoModel.find({ puestoId: new Types.ObjectId(puestoId) })
    .select('codigo')
    .lean();
  const ocupados = new Set(existentes.map((equipo) => equipo.codigo));

  for (let secuencia = 1; secuencia <= 999; secuencia += 1) {
    const codigo = `EQ-P${puesto.numero}-${String(secuencia).padStart(2, '0')}`;
    if (!ocupados.has(codigo)) return codigo;
  }
  throw ApiError.conflict('No hay códigos disponibles para este puesto.');
}

export async function crearEquipo(
  datos: CrearEquipoInput,
  autor: { usuarioId: string; puestoId: string },
): Promise<EquipoConEstado> {
  const codigo = datos.codigo ? datos.codigo.toUpperCase() : await generarCodigo(autor.puestoId);

  const duplicado = await EquipoModel.findOne({ codigo }).lean();
  if (duplicado) {
    throw ApiError.conflict(`Ya existe un equipo con el código ${codigo}.`);
  }

  const equipo = await EquipoModel.create({
    ...datos,
    codigo,
    puestoId: new Types.ObjectId(autor.puestoId),
  });

  await auditar({
    coleccion: 'equipos',
    documentoId: equipo._id,
    accion: 'crear',
    usuarioId: autor.usuarioId,
    puestoId: autor.puestoId,
    detalle: `Alta de equipo ${equipo.codigo}`,
  });

  const [conEstadoCalculado] = await conEstado([equipo.toObject()]);
  return conEstadoCalculado!;
}

export async function listarEquipos(
  filtros: ListarEquiposInput,
  puestoObligatorio: string | null,
): Promise<EquipoConEstado[]> {
  const consulta: FilterQuery<Equipo> = {};
  const puestoId = puestoObligatorio ?? filtros.puestoId;
  if (puestoId) consulta.puestoId = new Types.ObjectId(puestoId);
  if (filtros.activo !== undefined) consulta.activo = filtros.activo;

  const equipos = await conEstado(
    await EquipoModel.find(consulta).sort({ puestoId: 1, codigo: 1 }).lean(),
  );

  // El estado se calcula, así que el filtro se aplica después de la consulta.
  return filtros.estado
    ? equipos.filter((equipo) => equipo.estadoMantenimiento === filtros.estado)
    : equipos;
}

export async function obtenerEquipo(
  id: string,
  puestoObligatorio: string | null,
): Promise<EquipoConEstado> {
  const equipo = await EquipoModel.findById(id).lean();
  if (!equipo) throw ApiError.notFound('El equipo no existe.');
  if (puestoObligatorio && String(equipo.puestoId) !== puestoObligatorio) {
    throw ApiError.forbidden('Solo puede consultar los equipos de su propio puesto.');
  }
  const [resultado] = await conEstado([equipo]);
  return resultado!;
}

export async function actualizarEquipo(
  id: string,
  cambios: ActualizarEquipoInput,
  autor: { usuarioId: string; puestoObligatorio: string | null },
): Promise<EquipoConEstado> {
  const equipo = await EquipoModel.findById(id);
  if (!equipo) throw ApiError.notFound('El equipo no existe.');
  if (autor.puestoObligatorio && String(equipo.puestoId) !== autor.puestoObligatorio) {
    throw ApiError.forbidden('Solo puede modificar los equipos de su propio puesto.');
  }

  Object.assign(equipo, cambios);
  await equipo.save();

  await auditar({
    coleccion: 'equipos',
    documentoId: equipo._id,
    accion: 'actualizar',
    usuarioId: autor.usuarioId,
    puestoId: String(equipo.puestoId),
    detalle: `Actualización de ${equipo.codigo}`,
  });

  const [resultado] = await conEstado([equipo.toObject()]);
  return resultado!;
}

/**
 * Registra un mantenimiento realizado (punto 10.3) y deja el equipo al día:
 * el mantenimiento es el hecho histórico, el equipo guarda su situación actual.
 */
export async function registrarMantenimiento(
  equipoId: string,
  datos: RegistrarMantenimientoInput,
  autor: { usuarioId: string; puestoObligatorio: string | null },
): Promise<Mantenimiento> {
  const equipo = await EquipoModel.findById(equipoId);
  if (!equipo) throw ApiError.notFound('El equipo no existe.');
  if (autor.puestoObligatorio && String(equipo.puestoId) !== autor.puestoObligatorio) {
    throw ApiError.forbidden('Solo puede registrar mantenimientos de su propio puesto.');
  }

  const mantenimiento = await MantenimientoModel.create({
    equipoId: equipo._id,
    puestoId: equipo.puestoId,
    usuarioId: new Types.ObjectId(autor.usuarioId),
    registradoEn: new Date(),
    fecha: datos.fecha,
    tipo: datos.tipo,
    descripcion: datos.descripcion,
    tecnico: datos.tecnico ?? null,
    documentos: datos.documentos.map((d) => ({ ...d, subidoEn: new Date() })),
    fotos: datos.fotos.map((f) => ({ ...f, subidoEn: new Date() })),
    proximoMantenimiento: datos.proximoMantenimiento ?? null,
    noConformidadId: datos.noConformidadId ? new Types.ObjectId(datos.noConformidadId) : null,
    observaciones: datos.observaciones ?? null,
  });

  // Solo se adelanta la situación del equipo si este mantenimiento es el más
  // reciente: permite cargar mantenimientos antiguos sin retroceder la ficha.
  const esElMasReciente =
    !equipo.ultimoMantenimiento || datos.fecha >= new Date(equipo.ultimoMantenimiento);
  if (esElMasReciente) {
    equipo.ultimoMantenimiento = datos.fecha;
    equipo.tipoUltimoMantenimiento = datos.tipo;
    if (datos.proximoMantenimiento) equipo.proximoMantenimiento = datos.proximoMantenimiento;
    await equipo.save();
  }

  await auditar({
    coleccion: 'mantenimientos',
    documentoId: mantenimiento._id,
    accion: 'crear',
    usuarioId: autor.usuarioId,
    puestoId: String(equipo.puestoId),
    detalle: `Mantenimiento ${datos.tipo} de ${equipo.codigo}`,
  });

  return mantenimiento.toObject();
}

/** Base general de mantenimientos (punto 10.5). */
export async function listarMantenimientos(
  filtros: ListarMantenimientosInput,
  puestoObligatorio: string | null,
): Promise<Paginated<Mantenimiento>> {
  const consulta: FilterQuery<Mantenimiento> = {};
  const puestoId = puestoObligatorio ?? filtros.puestoId;
  if (puestoId) consulta.puestoId = new Types.ObjectId(puestoId);
  if (filtros.equipoId) consulta.equipoId = new Types.ObjectId(filtros.equipoId);
  if (filtros.tipo) consulta.tipo = filtros.tipo;

  if (filtros.desde || filtros.hasta) {
    const rango: Record<string, Date> = {};
    if (filtros.desde) rango.$gte = startOfZonedDay(filtros.desde, TZ);
    if (filtros.hasta) rango.$lt = endOfZonedDay(filtros.hasta, TZ);
    consulta.fecha = rango;
  }

  const { page, limit } = filtros;
  const [datos, total] = await Promise.all([
    MantenimientoModel.find(consulta)
      .populate('equipoId', 'codigo nombre')
      .sort({ fecha: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    MantenimientoModel.countDocuments(consulta),
  ]);

  return buildPaginated(datos, total, { page, limit });
}
