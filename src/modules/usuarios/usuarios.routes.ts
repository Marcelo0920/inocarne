import { Router } from 'express';
import { autenticar, exigirAdmin } from '../../middleware/auth.js';
import { validar } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  actualizarUsuarioSchema,
  crearUsuarioSchema,
  idParamSchema,
  listarUsuariosSchema,
  restablecerPasswordSchema,
} from './usuarios.schemas.js';
import {
  actualizarUsuario,
  crearUsuario,
  listarUsuarios,
  restablecerPassword,
} from './usuarios.service.js';

/** Toda la gestión de usuarios es exclusiva del administrador. */
export const usuariosRouter = Router();

usuariosRouter.use(autenticar, exigirAdmin);

usuariosRouter.get(
  '/',
  validar({ query: listarUsuariosSchema }),
  asyncHandler(async (req, res) => {
    res.json(await listarUsuarios(req.query as never));
  }),
);

usuariosRouter.post(
  '/',
  validar({ body: crearUsuarioSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await crearUsuario(req.body));
  }),
);

usuariosRouter.patch(
  '/:id',
  validar({ params: idParamSchema, body: actualizarUsuarioSchema }),
  asyncHandler(async (req, res) => {
    res.json(await actualizarUsuario(req.params.id!, req.body));
  }),
);

usuariosRouter.post(
  '/:id/restablecer-password',
  validar({ params: idParamSchema, body: restablecerPasswordSchema }),
  asyncHandler(async (req, res) => {
    await restablecerPassword(req.params.id!, req.body.password);
    res.json({ mensaje: 'La contraseña fue restablecida.' });
  }),
);
