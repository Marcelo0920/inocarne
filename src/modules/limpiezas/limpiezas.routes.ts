import { Router } from 'express';
import { autenticar, exigirRol, resolverPuesto } from '../../middleware/auth.js';
import { validar } from '../../middleware/validate.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  crearLimpiezaSchema,
  limpiezaDelDiaSchema,
  listarLimpiezasSchema,
} from './limpiezas.schemas.js';
import {
  estadoLimpiezaDelDia,
  listarLimpiezas,
  obtenerPlantillaLimpieza,
  registrarLimpieza,
} from './limpiezas.service.js';

export const limpiezasRouter = Router();

limpiezasRouter.use(autenticar);

/** Puntos que debe contener el checklist. */
limpiezasRouter.get(
  '/plantilla',
  asyncHandler(async (_req, res) => {
    res.json(await obtenerPlantillaLimpieza());
  }),
);

limpiezasRouter.post(
  '/',
  exigirRol('puesto', 'admin'),
  validar({ body: crearLimpiezaSchema }),
  asyncHandler(async (req, res) => {
    const puestoId = resolverPuesto(req, req.body.puestoId ?? null);
    if (!puestoId) throw ApiError.badRequest('Indique el puesto del checklist.');
    res
      .status(201)
      .json(await registrarLimpieza(req.body, { usuarioId: req.usuario!.id, puestoId }));
  }),
);

limpiezasRouter.get(
  '/dia',
  validar({ query: limpiezaDelDiaSchema }),
  asyncHandler(async (req, res) => {
    const { puestoId, dia } = req.query as { puestoId?: string; dia?: string };
    const objetivo = resolverPuesto(req, puestoId ?? null);
    if (!objetivo) throw ApiError.badRequest('Indique el puesto a consultar.');
    res.json(await estadoLimpiezaDelDia(objetivo, dia));
  }),
);

limpiezasRouter.get(
  '/',
  validar({ query: listarLimpiezasSchema }),
  asyncHandler(async (req, res) => {
    const filtros = req.query as never as Parameters<typeof listarLimpiezas>[0];
    const propio = req.usuario!.rol === 'puesto' ? resolverPuesto(req, filtros.puestoId) : null;
    res.json(await listarLimpiezas(filtros, propio));
  }),
);
