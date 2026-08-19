import { Router } from 'express';
import { autenticar, resolverPuesto } from '../../middleware/auth.js';
import { validar } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { listarHistorialSchema } from './historial.schemas.js';
import { listarHistorial } from './historial.service.js';

export const historialRouter = Router();

historialRouter.use(autenticar);

/**
 * Historial unificado (punto 15).
 * El vendedor ve solo su puesto y sus cuatro tipos de registro; la supervisión
 * ve todos los puestos e incluye además inspecciones y mantenimientos.
 */
historialRouter.get(
  '/',
  validar({ query: listarHistorialSchema }),
  asyncHandler(async (req, res) => {
    const filtros = req.query as never as Parameters<typeof listarHistorial>[0];
    const propio = req.usuario!.rol === 'puesto' ? resolverPuesto(req, filtros.puestoId) : null;
    res.json(await listarHistorial(filtros, propio));
  }),
);
