import { Router } from 'express';
import { autenticar, exigirSupervision, resolverPuesto } from '../../middleware/auth.js';
import { validar } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  crearInspeccionSchema,
  idParamSchema,
  listarInspeccionesSchema,
} from './inspecciones.schemas.js';
import {
  listarInspecciones,
  obtenerInspeccion,
  obtenerPlantillasInspeccion,
  registrarInspeccion,
} from './inspecciones.service.js';

export const inspeccionesRouter = Router();

inspeccionesRouter.use(autenticar);

inspeccionesRouter.get(
  '/plantillas',
  asyncHandler(async (_req, res) => {
    res.json(await obtenerPlantillasInspeccion());
  }),
);

/** Inspeccionar es tarea exclusiva de la supervisión. */
inspeccionesRouter.post(
  '/',
  exigirSupervision,
  validar({ body: crearInspeccionSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await registrarInspeccion(req.body, req.usuario!.id));
  }),
);

/** El puesto puede ver las inspecciones que se le hicieron; nunca las de otros. */
inspeccionesRouter.get(
  '/',
  validar({ query: listarInspeccionesSchema }),
  asyncHandler(async (req, res) => {
    const filtros = req.query as never as Parameters<typeof listarInspecciones>[0];
    const propio = req.usuario!.rol === 'puesto' ? resolverPuesto(req, filtros.puestoId) : null;
    res.json(await listarInspecciones(filtros, propio));
  }),
);

inspeccionesRouter.get(
  '/:id',
  validar({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const propio = req.usuario!.rol === 'puesto' ? resolverPuesto(req) : null;
    res.json(await obtenerInspeccion(req.params.id!, propio));
  }),
);
