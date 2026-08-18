import { Router } from 'express';
import { autenticar, exigirRol, resolverPuesto } from '../../middleware/auth.js';
import { validar } from '../../middleware/validate.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { crearRecepcionSchema, listarRecepcionesSchema } from './recepciones.schemas.js';
import { listarRecepciones, obtenerRecepcion, registrarRecepcion } from './recepciones.service.js';
import { z } from 'zod';

const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Identificador inválido'),
});

export const recepcionesRouter = Router();

recepcionesRouter.use(autenticar);

/** Registrar una recepción es tarea del puesto; el administrador puede hacerlo en su nombre. */
recepcionesRouter.post(
  '/',
  exigirRol('puesto', 'admin'),
  validar({ body: crearRecepcionSchema }),
  asyncHandler(async (req, res) => {
    const puestoId = resolverPuesto(req, req.body.puestoId ?? null);
    if (!puestoId) {
      throw ApiError.badRequest('Indique el puesto en el que se registra la recepción.');
    }
    const recepcion = await registrarRecepcion(req.body, {
      usuarioId: req.usuario!.id,
      puestoId,
    });
    res.status(201).json(recepcion);
  }),
);

recepcionesRouter.get(
  '/',
  validar({ query: listarRecepcionesSchema }),
  asyncHandler(async (req, res) => {
    const filtros = req.query as never as Parameters<typeof listarRecepciones>[0];
    const propio = req.usuario!.rol === 'puesto' ? resolverPuesto(req, filtros.puestoId) : null;
    res.json(await listarRecepciones(filtros, propio));
  }),
);

recepcionesRouter.get(
  '/:id',
  validar({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const propio = req.usuario!.rol === 'puesto' ? resolverPuesto(req) : null;
    res.json(await obtenerRecepcion(req.params.id!, propio));
  }),
);
