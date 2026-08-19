import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';

/**
 * Normaliza los identificadores de todas las respuestas.
 *
 * Mongoose devuelve `_id` en las consultas `lean()` y `id` en los documentos
 * completos, según cómo se haya construido cada consulta. Esa diferencia se
 * filtraba al cliente: una lista traía `_id` y un alta `id`, así que la
 * interfaz recibía `undefined` justo donde esperaba el identificador —enlaces
 * a ninguna parte y relaciones que parecían vacías—.
 *
 * Aquí se unifica en un solo lugar: la API responde siempre `id`, en cualquier
 * nivel de anidamiento, incluidos los documentos poblados.
 */
function normalizar(valor: unknown): unknown {
  if (valor === null || valor === undefined) return valor;

  if (valor instanceof Types.ObjectId) return valor.toString();
  if (valor instanceof Date) return valor;
  if (Buffer.isBuffer(valor)) return valor;

  if (Array.isArray(valor)) return valor.map(normalizar);

  if (typeof valor === 'object') {
    const origen = valor as Record<string, unknown>;
    const destino: Record<string, unknown> = {};

    for (const [clave, contenido] of Object.entries(origen)) {
      if (clave === '_id') {
        // `id` va primero para que quede al principio del objeto al leerlo.
        destino.id = normalizar(contenido);
        continue;
      }
      if (clave === '__v') continue;
      destino[clave] = normalizar(contenido);
    }
    return destino;
  }

  return valor;
}

export function serializarRespuestas(_req: Request, res: Response, next: NextFunction): void {
  const original = res.json.bind(res);

  res.json = (cuerpo: unknown) => original(normalizar(cuerpo));

  next();
}
