import { Router } from 'express';
import { autenticar, exigirAdmin, resolverPuesto } from '../../middleware/auth.js';
import { validar } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  actualizarPuestoSchema,
  crearPuestoSchema,
  idParamSchema,
  listarPuestosSchema,
} from './puestos.schemas.js';
import { actualizarPuesto, crearPuesto, listarPuestos, obtenerPuesto } from './puestos.service.js';

export const puestosRouter = Router();

puestosRouter.use(autenticar);

/** Un usuario de puesto solo ve el suyo; la supervisión ve todos. */
puestosRouter.get(
  '/',
  validar({ query: listarPuestosSchema }),
  asyncHandler(async (req, res) => {
    if (req.usuario!.rol === 'puesto') {
      const propio = resolverPuesto(req);
      res.json([await obtenerPuesto(propio!)]);
      return;
    }
    const { activo } = req.query as { activo?: boolean };
    res.json(await listarPuestos(activo));
  }),
);

puestosRouter.get(
  '/:id',
  validar({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    resolverPuesto(req, req.params.id);
    res.json(await obtenerPuesto(req.params.id!));
  }),
);

puestosRouter.post(
  '/',
  exigirAdmin,
  validar({ body: crearPuestoSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await crearPuesto(req.body));
  }),
);

puestosRouter.patch(
  '/:id',
  exigirAdmin,
  validar({ params: idParamSchema, body: actualizarPuestoSchema }),
  asyncHandler(async (req, res) => {
    res.json(await actualizarPuesto(req.params.id!, req.body));
  }),
);
