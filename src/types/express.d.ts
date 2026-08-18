import type { Rol } from '../domain/constants.js';

/** Identidad autenticada, colocada por el middleware `autenticar`. */
export interface UsuarioAutenticado {
  id: string;
  usuario: string;
  nombre: string;
  rol: Rol;
  puestoId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioAutenticado;
    }
  }
}

export {};
