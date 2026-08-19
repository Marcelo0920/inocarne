import type { FilterQuery } from 'mongoose';
import type { Rol } from '../../domain/constants.js';
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

/** Quién realiza la operación: de su rol dependen los límites. */
export interface AutorGestion {
  rol: Rol;
}

/**
 * La supervisión da de alta puestos y vendedores, pero no cuentas con mando.
 *
 * Es el límite que evita que quien supervisa se cree —o le cree a otro— una
 * cuenta de administrador y termine ampliando sus propios permisos. Las cuentas
 * de supervisor, coordinador y administrador las maneja solo el administrador.
 */
function exigirPermisoSobreRol(autor: AutorGestion, rolAfectado: Rol): void {
  if (autor.rol === 'admin') return;
  if (rolAfectado !== 'puesto') {
    throw ApiError.forbidden(
      'Solo el administrador puede crear o modificar cuentas de supervisión.',
    );
  }
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

/**
 * Un puesto atendido no admite otra cuenta.
 *
 * Cada puesto tiene un responsable y sus registros quedan atados a esa cuenta;
 * dos cuentas activas sobre el mismo puesto romperían esa correspondencia. Dar
 * de baja al vendedor libera el puesto para el siguiente.
 */
async function exigirPuestoLibre(puestoId: string, exceptoUsuarioId?: string): Promise<void> {
  const ocupante = await UsuarioModel.findOne({
    puestoId,
    rol: 'puesto',
    activo: true,
    ...(exceptoUsuarioId ? { _id: { $ne: exceptoUsuarioId } } : {}),
  }).lean();

  if (ocupante) {
    throw ApiError.conflict(
      `El puesto ya tiene asignada la cuenta "${ocupante.usuario}". ` +
        'Desactívela antes de asignar otra.',
    );
  }
}

export async function crearUsuario(datos: CrearUsuario, autor: AutorGestion): Promise<Usuario> {
  exigirPermisoSobreRol(autor, datos.rol);

  const existente = await UsuarioModel.findOne({ usuario: datos.usuario }).lean();
  if (existente) throw ApiError.conflict(`El usuario "${datos.usuario}" ya está en uso.`);

  if (datos.puestoId) {
    await exigirPuestoExistente(datos.puestoId);
    if (datos.rol === 'puesto') await exigirPuestoLibre(datos.puestoId);
  }

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

export async function actualizarUsuario(
  id: string,
  cambios: ActualizarUsuario,
  autor: AutorGestion,
): Promise<Usuario> {
  if (cambios.puestoId) await exigirPuestoExistente(cambios.puestoId);

  const usuario = await UsuarioModel.findById(id);
  if (!usuario) throw ApiError.notFound('El usuario no existe.');

  // Se comprueban los dos extremos: sobre qué cuenta se actúa y en qué se la
  // convierte. Si no, un supervisor podría ascender a un vendedor.
  exigirPermisoSobreRol(autor, usuario.rol);
  if (cambios.rol !== undefined) exigirPermisoSobreRol(autor, cambios.rol);

  // Mudar la cuenta a otro puesto, o reactivarla en el suyo, exige que ese
  // puesto no esté ya atendido por alguien más.
  const rolResultante = cambios.rol ?? usuario.rol;
  const puestoResultante = cambios.puestoId ?? (usuario.puestoId ? String(usuario.puestoId) : null);
  const seReactiva = cambios.activo === true && usuario.activo === false;

  if (rolResultante === 'puesto' && puestoResultante && (cambios.puestoId || seReactiva)) {
    await exigirPuestoLibre(puestoResultante, id);
  }

  if (cambios.nombre !== undefined) usuario.nombre = cambios.nombre;
  if (cambios.rol !== undefined) usuario.rol = cambios.rol;
  if (cambios.puestoId !== undefined) usuario.puestoId = cambios.puestoId as never;
  if (cambios.activo !== undefined) usuario.activo = cambios.activo;

  await usuario.save();
  return usuario.toObject();
}

/** Se asigna una contraseña nueva cuando el vendedor la olvida. */
export async function restablecerPassword(
  id: string,
  password: string,
  autor: AutorGestion,
): Promise<void> {
  const usuario = await UsuarioModel.findById(id).select('+passwordHash');
  if (!usuario) throw ApiError.notFound('El usuario no existe.');
  exigirPermisoSobreRol(autor, usuario.rol);

  usuario.passwordHash = await hashPassword(password);
  await usuario.save();
}
