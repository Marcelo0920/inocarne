import { Router } from 'express';
import { z } from 'zod';
import { autenticar, exigirSupervision, resolverPuesto } from '../../middleware/auth.js';
import { validar } from '../../middleware/validate.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { construirDashboard, detalleDelPuesto } from './dashboard.service.js';

const consultaSchema = z.object({
  dia: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato YYYY-MM-DD')
    .optional(),
});

const detalleSchema = z.object({
  puestoId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Identificador inválido'),
});

export const dashboardRouter = Router();

dashboardRouter.use(autenticar);

/** El panel con todos los puestos es exclusivo de la supervisión. */
dashboardRouter.get(
  '/',
  exigirSupervision,
  validar({ query: consultaSchema }),
  asyncHandler(async (req, res) => {
    const { dia } = req.query as { dia?: string };
    res.json(await construirDashboard(dia));
  }),
);

/** Detalle de un puesto. El vendedor solo puede pedir el suyo. */
dashboardRouter.get(
  '/puesto/:puestoId',
  validar({ params: detalleSchema, query: consultaSchema }),
  asyncHandler(async (req, res) => {
    const objetivo = resolverPuesto(req, req.params.puestoId);
    if (!objetivo) throw ApiError.badRequest('Indique el puesto a consultar.');
    const { dia } = req.query as { dia?: string };
    res.json(await detalleDelPuesto(objetivo, dia));
  }),
);
