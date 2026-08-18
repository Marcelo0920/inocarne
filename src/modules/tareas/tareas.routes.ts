import { Router } from 'express';
import { autenticar, autenticarCron, exigirAdmin } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { evaluarAlertas } from './alertas.service.js';

export const tareasRouter = Router();

/**
 * Punto de entrada del servicio de cron externo.
 * Se protege con una clave propia (cabecera x-cron-secret) porque no hay
 * ningún usuario detrás de la llamada.
 */
tareasRouter.post(
  '/alertas',
  autenticarCron,
  asyncHandler(async (_req, res) => {
    res.json(await evaluarAlertas());
  }),
);

/** El administrador puede dispararla a mano para comprobar que funciona. */
tareasRouter.post(
  '/alertas/manual',
  autenticar,
  exigirAdmin,
  asyncHandler(async (_req, res) => {
    res.json(await evaluarAlertas());
  }),
);
