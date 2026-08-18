import { Router } from 'express';
import { autenticar, exigirSupervision, resolverPuesto } from '../../middleware/auth.js';
import { validar } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  actualizarCapacitacionSchema,
  crearCapacitacionSchema,
  idParamSchema,
  listarCapacitacionesSchema,
  registrarAsistenciaSchema,
} from './capacitaciones.schemas.js';
import {
  actualizarCapacitacion,
  crearCapacitacion,
  listarCapacitaciones,
  obtenerCapacitacion,
  registrarAsistencia,
} from './capacitaciones.service.js';

export const capacitacionesRouter = Router();

capacitacionesRouter.use(autenticar);

capacitacionesRouter.post(
  '/',
  exigirSupervision,
  validar({ body: crearCapacitacionSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await crearCapacitacion(req.body, req.usuario!.id));
  }),
);

/** El vendedor ve solo las capacitaciones a las que fue convocado. */
capacitacionesRouter.get(
  '/',
  validar({ query: listarCapacitacionesSchema }),
  asyncHandler(async (req, res) => {
    const filtros = req.query as never as Parameters<typeof listarCapacitaciones>[0];
    const propio = req.usuario!.rol === 'puesto' ? resolverPuesto(req) : null;
    res.json(await listarCapacitaciones(filtros, propio));
  }),
);

capacitacionesRouter.get(
  '/:id',
  validar({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await obtenerCapacitacion(req.params.id!));
  }),
);

capacitacionesRouter.patch(
  '/:id',
  exigirSupervision,
  validar({ params: idParamSchema, body: actualizarCapacitacionSchema }),
  asyncHandler(async (req, res) => {
    res.json(await actualizarCapacitacion(req.params.id!, req.body, req.usuario!.id));
  }),
);

capacitacionesRouter.post(
  '/:id/asistencia',
  exigirSupervision,
  validar({ params: idParamSchema, body: registrarAsistenciaSchema }),
  asyncHandler(async (req, res) => {
    res.json(await registrarAsistencia(req.params.id!, req.body, req.usuario!.id));
  }),
);
