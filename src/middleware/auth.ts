import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { assertJwtConfigured, env } from '../config/env.js';
import { ROLES_SUPERVISION, type Rol } from '../domain/constants.js';
import { ApiError } from '../utils/ApiError.js';
import type { UsuarioAutenticado } from '../types/express.js';

export interface TokenPayload {
  sub: string;
  usuario: string;
  nombre: string;
  rol: Rol;
  puestoId: string | null;
}

/** Firma el token de sesión. */
export function firmarToken(payload: TokenPayload): string {
  const secret = assertJwtConfigured();
  return jwt.sign(payload, secret, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

/** Verifica el token y devuelve la identidad que contiene. */
export function verificarToken(token: string): UsuarioAutenticado {
  const secret = assertJwtConfigured();
  const payload = jwt.verify(token, secret) as TokenPayload;
  return {
    id: payload.sub,
    usuario: payload.usuario,
    nombre: payload.nombre,
    rol: payload.rol,
    puestoId: payload.puestoId ?? null,
  };
}

/** Exige un token válido en la cabecera `Authorization: Bearer <token>`. */
export function autenticar(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(ApiError.unauthorized('Se requiere iniciar sesión.'));
    return;
  }

  try {
    req.usuario = verificarToken(header.slice(7).trim());
    next();
  } catch (error) {
    const expirado = error instanceof jwt.TokenExpiredError;
    next(
      ApiError.unauthorized(
        expirado ? 'La sesión expiró, vuelva a ingresar.' : 'Sesión inválida, vuelva a ingresar.',
      ),
    );
  }
}

/** Restringe una ruta a los roles indicados. */
export function exigirRol(...roles: Rol[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.usuario) {
      next(ApiError.unauthorized());
      return;
    }
    if (!roles.includes(req.usuario.rol)) {
      next(ApiError.forbidden());
      return;
    }
    next();
  };
}

/** Supervisor, coordinador HACCP o administrador: los que ven todos los puestos. */
export const exigirSupervision = exigirRol(...ROLES_SUPERVISION);

/** Solo el administrador. */
export const exigirAdmin = exigirRol('admin');

/**
 * Resuelve sobre qué puesto opera la petición.
 * Un usuario de puesto siempre queda limitado al suyo; la supervisión puede
 * consultar cualquiera, indicándolo por parámetro.
 */
export function resolverPuesto(req: Request, puestoSolicitado?: string | null): string | null {
  const usuario = req.usuario;
  if (!usuario) throw ApiError.unauthorized();

  if (usuario.rol === 'puesto') {
    if (!usuario.puestoId) {
      throw ApiError.forbidden('El usuario no tiene un puesto asignado.');
    }
    if (puestoSolicitado && puestoSolicitado !== usuario.puestoId) {
      throw ApiError.forbidden('Solo puede consultar la información de su propio puesto.');
    }
    return usuario.puestoId;
  }

  return puestoSolicitado ?? null;
}

/** Protege el endpoint que dispara las tareas programadas. */
export function autenticarCron(req: Request, _res: Response, next: NextFunction): void {
  if (!env.CRON_SECRET) {
    next(ApiError.notConfigured('Falta CRON_SECRET en la configuración del servidor.'));
    return;
  }
  if (req.header('x-cron-secret') !== env.CRON_SECRET) {
    next(ApiError.unauthorized('Clave de tarea programada inválida.'));
    return;
  }
  next();
}
