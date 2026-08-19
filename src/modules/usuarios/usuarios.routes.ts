import { Router } from 'express';
import { autenticar, exigirSupervision } from '../../middleware/auth.js';
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

/**
 * Gestión de cuentas.
 *
 * La supervisión da de alta vendedores; las cuentas con mando —supervisor,
 * coordinador y administrador— quedan reservadas al administrador, y esa regla
 * la aplica el servicio en cada operación.
 */
export const usuariosRouter = Router();

usuariosRouter.use(autenticar, exigirSupervision);

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
    res.status(201).json(await crearUsuario(req.body, { rol: req.usuario!.rol }));
  }),
);

usuariosRouter.patch(
  '/:id',
  validar({ params: idParamSchema, body: actualizarUsuarioSchema }),
  asyncHandler(async (req, res) => {
    res.json(await actualizarUsuario(req.params.id!, req.body, { rol: req.usuario!.rol }));
  }),
);

usuariosRouter.post(
  '/:id/restablecer-password',
  validar({ params: idParamSchema, body: restablecerPasswordSchema }),
  asyncHandler(async (req, res) => {
    await restablecerPassword(req.params.id!, req.body.password, { rol: req.usuario!.rol });
    res.json({ mensaje: 'La contraseña fue restablecida.' });
  }),
);
