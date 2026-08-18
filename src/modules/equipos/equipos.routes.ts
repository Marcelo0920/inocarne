import { Router } from 'express';
import { autenticar, exigirRol, resolverPuesto } from '../../middleware/auth.js';
import { validar } from '../../middleware/validate.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  actualizarEquipoSchema,
  crearEquipoSchema,
  idParamSchema,
  listarEquiposSchema,
  listarMantenimientosSchema,
  registrarMantenimientoSchema,
} from './equipos.schemas.js';
import {
  actualizarEquipo,
  crearEquipo,
  listarEquipos,
  listarMantenimientos,
  obtenerEquipo,
  registrarMantenimiento,
} from './equipos.service.js';

export const equiposRouter = Router();
export const mantenimientosRouter = Router();

equiposRouter.use(autenticar);
mantenimientosRouter.use(autenticar);

/** Un usuario de puesto queda siempre limitado al suyo. */
function puestoObligatorio(req: Parameters<typeof resolverPuesto>[0]): string | null {
  return req.usuario!.rol === 'puesto' ? resolverPuesto(req) : null;
}

equiposRouter.post(
  '/',
  exigirRol('puesto', 'admin'),
  validar({ body: crearEquipoSchema }),
  asyncHandler(async (req, res) => {
    const puestoId = resolverPuesto(req, req.body.puestoId ?? null);
    if (!puestoId) throw ApiError.badRequest('Indique el puesto al que pertenece el equipo.');
    res.status(201).json(await crearEquipo(req.body, { usuarioId: req.usuario!.id, puestoId }));
  }),
);

equiposRouter.get(
  '/',
  validar({ query: listarEquiposSchema }),
  asyncHandler(async (req, res) => {
    const filtros = req.query as never as Parameters<typeof listarEquipos>[0];
    const propio = req.usuario!.rol === 'puesto' ? resolverPuesto(req, filtros.puestoId) : null;
    res.json(await listarEquipos(filtros, propio));
  }),
);

equiposRouter.get(
  '/:id',
  validar({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await obtenerEquipo(req.params.id!, puestoObligatorio(req)));
  }),
);

equiposRouter.patch(
  '/:id',
  exigirRol('puesto', 'admin'),
  validar({ params: idParamSchema, body: actualizarEquipoSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await actualizarEquipo(req.params.id!, req.body, {
        usuarioId: req.usuario!.id,
        puestoObligatorio: puestoObligatorio(req),
      }),
    );
  }),
);

/** Registro de un mantenimiento realizado sobre un equipo. */
equiposRouter.post(
  '/:id/mantenimientos',
  validar({ params: idParamSchema, body: registrarMantenimientoSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(
      await registrarMantenimiento(req.params.id!, req.body, {
        usuarioId: req.usuario!.id,
        puestoObligatorio: puestoObligatorio(req),
      }),
    );
  }),
);

/** Base general de mantenimientos. */
mantenimientosRouter.get(
  '/',
  validar({ query: listarMantenimientosSchema }),
  asyncHandler(async (req, res) => {
    const filtros = req.query as never as Parameters<typeof listarMantenimientos>[0];
    const propio = req.usuario!.rol === 'puesto' ? resolverPuesto(req, filtros.puestoId) : null;
    res.json(await listarMantenimientos(filtros, propio));
  }),
);
