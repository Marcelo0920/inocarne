import { Router } from 'express';
import { autenticar, exigirSupervision, resolverPuesto } from '../../middleware/auth.js';
import { validar } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  actualizarNoConformidadSchema,
  cerrarNoConformidadSchema,
  crearNoConformidadSchema,
  idParamSchema,
  listarNoConformidadesSchema,
} from './noConformidades.schemas.js';
import {
  actualizarNoConformidad,
  cerrarNoConformidad,
  crearNoConformidad,
  listarNoConformidades,
  obtenerNoConformidad,
} from './noConformidades.service.js';

export const noConformidadesRouter = Router();

noConformidadesRouter.use(autenticar);

noConformidadesRouter.post(
  '/',
  exigirSupervision,
  validar({ body: crearNoConformidadSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await crearNoConformidad(req.body, req.usuario!.id));
  }),
);

/** El puesto ve las suyas para saber qué debe corregir. */
noConformidadesRouter.get(
  '/',
  validar({ query: listarNoConformidadesSchema }),
  asyncHandler(async (req, res) => {
    const filtros = req.query as never as Parameters<typeof listarNoConformidades>[0];
    const propio = req.usuario!.rol === 'puesto' ? resolverPuesto(req, filtros.puestoId) : null;
    res.json(await listarNoConformidades(filtros, propio));
  }),
);

noConformidadesRouter.get(
  '/:id',
  validar({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const propio = req.usuario!.rol === 'puesto' ? resolverPuesto(req) : null;
    res.json(await obtenerNoConformidad(req.params.id!, propio));
  }),
);

noConformidadesRouter.patch(
  '/:id',
  exigirSupervision,
  validar({ params: idParamSchema, body: actualizarNoConformidadSchema }),
  asyncHandler(async (req, res) => {
    res.json(await actualizarNoConformidad(req.params.id!, req.body, req.usuario!.id));
  }),
);

/** Verificación y cierre: solo la supervisión puede darla por resuelta. */
noConformidadesRouter.post(
  '/:id/cerrar',
  exigirSupervision,
  validar({ params: idParamSchema, body: cerrarNoConformidadSchema }),
  asyncHandler(async (req, res) => {
    res.json(await cerrarNoConformidad(req.params.id!, req.body, req.usuario!.id));
  }),
);
