import type { NextFunction, Request, Response } from 'express';
import { MongoServerError } from 'mongodb';
import mongoose from 'mongoose';
import multer from 'multer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';

/** Ruta inexistente. */
export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

interface CuerpoError {
  error: { codigo: string; mensaje: string; detalle?: unknown; stack?: string };
}

/** Traduce cualquier error a una respuesta JSON uniforme y en español. */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let status = 500;
  let codigo = 'ERROR_INTERNO';
  let mensaje = 'Ocurrió un error inesperado.';
  let detalle: unknown;

  if (error instanceof ApiError) {
    status = error.status;
    codigo = error.code;
    mensaje = error.message;
    detalle = error.details;
  } else if (error instanceof mongoose.Error.ValidationError) {
    status = 422;
    codigo = 'VALIDACION';
    mensaje = 'Los datos enviados no son válidos.';
    detalle = Object.fromEntries(
      Object.entries(error.errors).map(([campo, e]) => [campo, e.message]),
    );
  } else if (error instanceof mongoose.Error.CastError) {
    status = 400;
    codigo = 'IDENTIFICADOR_INVALIDO';
    mensaje = `El identificador "${String(error.value)}" no es válido.`;
  } else if (error instanceof MongoServerError && error.code === 11000) {
    status = 409;
    codigo = 'DUPLICADO';
    mensaje = 'Ya existe un registro con esos datos.';
    detalle = error.keyValue;
  } else if (error instanceof multer.MulterError) {
    status = 400;
    codigo = 'ARCHIVO_INVALIDO';
    mensaje =
      error.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo supera el tamaño máximo permitido.'
        : `No se pudo procesar el archivo: ${error.message}`;
  } else if (error instanceof Error) {
    mensaje = env.isProduction ? mensaje : error.message;
  }

  if (status >= 500) {
    logger.error('Error no controlado', error);
  }

  const cuerpo: CuerpoError = { error: { codigo, mensaje } };
  if (detalle !== undefined) cuerpo.error.detalle = detalle;
  if (!env.isProduction && error instanceof Error && status >= 500) {
    cuerpo.error.stack = error.stack;
  }

  res.status(status).json(cuerpo);
}
