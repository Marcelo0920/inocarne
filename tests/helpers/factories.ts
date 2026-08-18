import type { Express } from 'express';
import request from 'supertest';
import { crearApp } from '../../src/app.js';
import type { Rol } from '../../src/domain/constants.js';
import { PuestoModel } from '../../src/models/Puesto.js';
import { UsuarioModel, hashPassword } from '../../src/models/Usuario.js';

export const app: Express = crearApp();

export const PASSWORD_PRUEBA = 'clave1234';

/** Crea un puesto de venta. */
export async function crearPuesto(numero = 1, nombre = `Puesto ${numero}`) {
  return PuestoModel.create({ numero, nombre, responsable: `Responsable ${numero}`, activo: true });
}

interface OpcionesUsuario {
  rol?: Rol;
  usuario?: string;
  nombre?: string;
  puestoId?: string | null;
  activo?: boolean;
  password?: string;
}

/** Crea un usuario con la contraseña de prueba. */
export async function crearUsuario(opciones: OpcionesUsuario = {}) {
  const rol = opciones.rol ?? 'supervisor';
  return UsuarioModel.create({
    nombre: opciones.nombre ?? `Usuario ${rol}`,
    usuario: opciones.usuario ?? `${rol}-${Math.random().toString(36).slice(2, 8)}`,
    passwordHash: await hashPassword(opciones.password ?? PASSWORD_PRUEBA),
    rol,
    puestoId: opciones.puestoId ?? null,
    activo: opciones.activo ?? true,
  });
}

/** Inicia sesión y devuelve el token. */
export async function obtenerToken(usuario: string, password = PASSWORD_PRUEBA): Promise<string> {
  const respuesta = await request(app).post('/api/auth/login').send({ usuario, password });
  if (respuesta.status !== 200) {
    throw new Error(`No se pudo iniciar sesión (${respuesta.status}): ${respuesta.text}`);
  }
  return respuesta.body.token as string;
}

export interface SesionPrueba {
  token: string;
  usuarioId: string;
  puestoId: string | null;
  auth: `Bearer ${string}`;
}

/** Crea un usuario, inicia su sesión y devuelve todo lo necesario para las peticiones. */
export async function crearSesion(opciones: OpcionesUsuario = {}): Promise<SesionPrueba> {
  const usuario = await crearUsuario(opciones);
  const token = await obtenerToken(usuario.usuario, opciones.password ?? PASSWORD_PRUEBA);
  return {
    token,
    usuarioId: String(usuario._id),
    puestoId: usuario.puestoId ? String(usuario.puestoId) : null,
    auth: `Bearer ${token}`,
  };
}

/** Sesión de un usuario de puesto, junto con su puesto ya creado. */
export async function crearSesionPuesto(numero = 1) {
  const puesto = await crearPuesto(numero);
  const sesion = await crearSesion({
    rol: 'puesto',
    usuario: `puesto${numero}`,
    nombre: `Vendedor ${numero}`,
    puestoId: String(puesto._id),
  });
  return { puesto, sesion };
}
