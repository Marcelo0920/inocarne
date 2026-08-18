import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ApiError } from '../utils/ApiError.js';

interface Esquemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/** Convierte los errores de Zod en un detalle campo → mensaje, en español. */
function formatearErrores(error: ZodError): Record<string, string> {
  const detalle: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = issue.path.join('.') || 'general';
    if (!detalle[campo]) detalle[campo] = issue.message;
  }
  return detalle;
}

/**
 * Valida y normaliza la petición antes de llegar al controlador.
 * El valor validado reemplaza al original, de modo que el controlador
 * siempre recibe datos ya convertidos y con sus valores por defecto.
 */
export function validar(esquemas: Esquemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (esquemas.params) req.params = esquemas.params.parse(req.params);
      if (esquemas.query) {
        const validado = esquemas.query.parse(req.query);
        Object.defineProperty(req, 'query', {
          value: validado,
          writable: true,
          configurable: true,
        });
      }
      if (esquemas.body) req.body = esquemas.body.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(ApiError.badRequest('Los datos enviados no son válidos.', formatearErrores(error)));
        return;
      }
      next(error);
    }
  };
}
