import type { FilterQuery } from 'mongoose';
import { PuestoModel } from '../../models/Puesto.js';
import { UsuarioModel, hashPassword, type Usuario } from '../../models/Usuario.js';
import { ApiError } from '../../utils/ApiError.js';
import type { z } from 'zod';
import type { actualizarUsuarioSchema, crearUsuarioSchema } from './usuarios.schemas.js';

type CrearUsuario = z.infer<typeof crearUsuarioSchema>;
type ActualizarUsuario = z.infer<typeof actualizarUsuarioSchema>;

interface FiltroUsuarios {
  rol?: string;
  puestoId?: string;
  activo?: boolean;
}

export async function listarUsuarios(filtro: FiltroUsuarios): Promise<Usuario[]> {
  const consulta: FilterQuery<Usuario> = {};
  if (filtro.rol) consulta.rol = filtro.rol;
  if (filtro.puestoId) consulta.puestoId = filtro.puestoId;
  if (filtro.activo !== undefined) consulta.activo = filtro.activo;
  return UsuarioModel.find(consulta)
    .populate('puestoId', 'numero nombre')
    .sort({ usuario: 1 })
    .lean();
}

async function exigirPuestoExistente(puestoId: string): Promise<void> {
  const puesto = await PuestoModel.findById(puestoId).lean();
  if (!puesto) throw ApiError.badRequest('El puesto indicado no existe.');
}

export async function crearUsuario(datos: CrearUsuario): Promise<Usuario> {
  const existente = await UsuarioModel.findOne({ usuario: datos.usuario }).lean();
  if (existente) throw ApiError.conflict(`El usuario "${datos.usuario}" ya está en uso.`);
  if (datos.puestoId) await exigirPuestoExistente(datos.puestoId);

  const creado = await UsuarioModel.create({
    nombre: datos.nombre,
    usuario: datos.usuario,
    passwordHash: await hashPassword(datos.password),
    rol: datos.rol,
    puestoId: datos.rol === 'puesto' ? datos.puestoId : null,
    activo: true,
  });
  // Se relee sin el hash: 'passwordHash' tiene select:false, así nunca sale del servidor.
  return (await UsuarioModel.findById(creado._id).lean()) as Usuario;
}

export async function actualizarUsuario(id: string, cambios: ActualizarUsuario): Promise<Usuario> {
  if (cambios.puestoId) await exigirPuestoExistente(cambios.puestoId);

  const usuario = await UsuarioModel.findById(id);
  if (!usuario) throw ApiError.notFound('El usuario no existe.');

  if (cambios.nombre !== undefined) usuario.nombre = cambios.nombre;
  if (cambios.rol !== undefined) usuario.rol = cambios.rol;
  if (cambios.puestoId !== undefined) usuario.puestoId = cambios.puestoId as never;
  if (cambios.activo !== undefined) usuario.activo = cambios.activo;

  await usuario.save();
  return usuario.toObject();
}

/** El administrador asigna una contraseña nueva cuando el vendedor la olvida. */
export async function restablecerPassword(id: string, password: string): Promise<void> {
  const usuario = await UsuarioModel.findById(id).select('+passwordHash');
  if (!usuario) throw ApiError.notFound('El usuario no existe.');
  usuario.passwordHash = await hashPassword(password);
  await usuario.save();
}
