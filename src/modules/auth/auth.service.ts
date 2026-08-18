import { Types } from 'mongoose';
import { firmarToken } from '../../middleware/auth.js';
import { PuestoModel } from '../../models/Puesto.js';
import { UsuarioModel, hashPassword } from '../../models/Usuario.js';
import { ApiError } from '../../utils/ApiError.js';
import type { CambiarPasswordInput, LoginInput } from './auth.schemas.js';

export interface PerfilUsuario {
  id: string;
  nombre: string;
  usuario: string;
  rol: string;
  puestoId: string | null;
  puesto: { id: string; numero: number; nombre: string } | null;
}

export interface ResultadoLogin {
  token: string;
  usuario: PerfilUsuario;
}

async function construirPerfil(
  id: Types.ObjectId,
  nombre: string,
  usuario: string,
  rol: string,
  puestoId: Types.ObjectId | null | undefined,
): Promise<PerfilUsuario> {
  let puesto: PerfilUsuario['puesto'] = null;
  if (puestoId) {
    const encontrado = await PuestoModel.findById(puestoId).lean();
    if (encontrado) {
      puesto = {
        id: String(encontrado._id),
        numero: encontrado.numero,
        nombre: encontrado.nombre,
      };
    }
  }
  return {
    id: String(id),
    nombre,
    usuario,
    rol,
    puestoId: puestoId ? String(puestoId) : null,
    puesto,
  };
}

/** Valida las credenciales y emite el token de sesión. */
export async function login(datos: LoginInput): Promise<ResultadoLogin> {
  const usuario = await UsuarioModel.findOne({ usuario: datos.usuario }).select('+passwordHash');

  // Mismo mensaje para usuario inexistente y contraseña incorrecta: no se
  // revela cuál de los dos falló.
  const credencialesInvalidas = ApiError.unauthorized('Usuario o contraseña incorrectos.');
  if (!usuario) throw credencialesInvalidas;
  if (!usuario.activo) throw ApiError.forbidden('El usuario está desactivado.');

  const coincide = await usuario.verificarPassword(datos.password);
  if (!coincide) throw credencialesInvalidas;

  usuario.ultimoAcceso = new Date();
  await usuario.save();

  const perfil = await construirPerfil(
    usuario._id,
    usuario.nombre,
    usuario.usuario,
    usuario.rol,
    usuario.puestoId,
  );

  const token = firmarToken({
    sub: perfil.id,
    usuario: perfil.usuario,
    nombre: perfil.nombre,
    rol: usuario.rol,
    puestoId: perfil.puestoId,
  });

  return { token, usuario: perfil };
}

/** Perfil del usuario autenticado. */
export async function obtenerPerfil(usuarioId: string): Promise<PerfilUsuario> {
  const usuario = await UsuarioModel.findById(usuarioId);
  if (!usuario || !usuario.activo) throw ApiError.unauthorized('La sesión ya no es válida.');
  return construirPerfil(
    usuario._id,
    usuario.nombre,
    usuario.usuario,
    usuario.rol,
    usuario.puestoId,
  );
}

/** Cambio de contraseña por parte del propio usuario. */
export async function cambiarPassword(
  usuarioId: string,
  datos: CambiarPasswordInput,
): Promise<void> {
  const usuario = await UsuarioModel.findById(usuarioId).select('+passwordHash');
  if (!usuario) throw ApiError.unauthorized();

  const coincide = await usuario.verificarPassword(datos.passwordActual);
  if (!coincide) throw ApiError.badRequest('La contraseña actual no es correcta.');

  usuario.passwordHash = await hashPassword(datos.passwordNueva);
  await usuario.save();
}
