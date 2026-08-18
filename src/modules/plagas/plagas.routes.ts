import { Router } from 'express';
import { autenticar, exigirSupervision, resolverPuesto } from '../../middleware/auth.js';
import { validar } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  actualizarPlagaSchema,
  crearPlagaSchema,
  idParamSchema,
  listarPlagasSchema,
  registrarRealizadaSchema,
} from './plagas.schemas.js';
import {
  actualizarControlPlagas,
  crearControlPlagas,
  listarControlPlagas,
  obtenerControlPlagas,
  registrarRealizada,
} from './plagas.service.js';

export const plagasRouter = Router();

plagasRouter.use(autenticar);

/** El cronograma lo gestiona la supervisión. */
plagasRouter.post(
  '/',
  exigirSupervision,
  validar({ body: crearPlagaSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await crearControlPlagas(req.body, req.usuario!.id));
  }),
);

/** El vendedor ve las actividades que afectan a su puesto. */
plagasRouter.get(
  '/',
  validar({ query: listarPlagasSchema }),
  asyncHandler(async (req, res) => {
    const filtros = req.query as never as Parameters<typeof listarControlPlagas>[0];
    const propio = req.usuario!.rol === 'puesto' ? resolverPuesto(req) : null;
    res.json(await listarControlPlagas(filtros, propio));
  }),
);

plagasRouter.get(
  '/:id',
  validar({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await obtenerControlPlagas(req.params.id!));
  }),
);

plagasRouter.patch(
  '/:id',
  exigirSupervision,
  validar({ params: idParamSchema, body: actualizarPlagaSchema }),
  asyncHandler(async (req, res) => {
    res.json(await actualizarControlPlagas(req.params.id!, req.body, req.usuario!.id));
  }),
);

plagasRouter.post(
  '/:id/realizada',
  exigirSupervision,
  validar({ params: idParamSchema, body: registrarRealizadaSchema }),
  asyncHandler(async (req, res) => {
    res.json(await registrarRealizada(req.params.id!, req.body, req.usuario!.id));
  }),
);
