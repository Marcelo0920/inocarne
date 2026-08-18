import { Router } from 'express';
import { autenticar, exigirAdmin } from '../../middleware/auth.js';
import { validar } from '../../middleware/validate.js';
import {
  actualizarConfiguracion,
  obtenerConfiguracion,
} from '../../services/configuracion.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { actualizarConfiguracionSchema } from './configuracion.schemas.js';

export const configuracionRouter = Router();

/**
 * Cualquier usuario autenticado necesita la configuración: el vendedor debe ver
 * los rangos aceptados y sus horarios programados. Modificarla es cosa del administrador.
 */
configuracionRouter.get(
  '/',
  autenticar,
  asyncHandler(async (_req, res) => {
    res.json(await obtenerConfiguracion());
  }),
);

configuracionRouter.patch(
  '/',
  autenticar,
  exigirAdmin,
  validar({ body: actualizarConfiguracionSchema }),
  asyncHandler(async (req, res) => {
    res.json(await actualizarConfiguracion(req.body));
  }),
);
