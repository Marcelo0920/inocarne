import { Router } from 'express';
import { autenticar, exigirRol, resolverPuesto } from '../../middleware/auth.js';
import { validar } from '../../middleware/validate.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  controlesDelDiaSchema,
  crearControlSchema,
  listarControlesSchema,
} from './controles.schemas.js';
import { estadoDelDia, listarControles, registrarControl } from './controles.service.js';

export const controlesRouter = Router();

controlesRouter.use(autenticar);

controlesRouter.post(
  '/',
  exigirRol('puesto', 'admin'),
  validar({ body: crearControlSchema }),
  asyncHandler(async (req, res) => {
    const puestoId = resolverPuesto(req, req.body.puestoId ?? null);
    if (!puestoId) throw ApiError.badRequest('Indique el puesto del control.');
    const control = await registrarControl(req.body, { usuarioId: req.usuario!.id, puestoId });
    res.status(201).json(control);
  }),
);

/** Estado de las franjas del día: lo que el vendedor ve al abrir la aplicación. */
controlesRouter.get(
  '/dia',
  validar({ query: controlesDelDiaSchema }),
  asyncHandler(async (req, res) => {
    const { puestoId, dia } = req.query as { puestoId?: string; dia?: string };
    const objetivo = resolverPuesto(req, puestoId ?? null);
    if (!objetivo) throw ApiError.badRequest('Indique el puesto a consultar.');
    res.json(await estadoDelDia(objetivo, dia));
  }),
);

controlesRouter.get(
  '/',
  validar({ query: listarControlesSchema }),
  asyncHandler(async (req, res) => {
    const filtros = req.query as never as Parameters<typeof listarControles>[0];
    const propio = req.usuario!.rol === 'puesto' ? resolverPuesto(req, filtros.puestoId) : null;
    res.json(await listarControles(filtros, propio));
  }),
);
