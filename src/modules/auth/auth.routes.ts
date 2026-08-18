import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env.js';
import { autenticar } from '../../middleware/auth.js';
import { validar } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { cambiarPasswordSchema, loginSchema } from './auth.schemas.js';
import { cambiarPassword, login, obtenerPerfil } from './auth.service.js';

/** Limita los intentos de ingreso para frenar ataques de fuerza bruta. */
const limiteLogin = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.isTest ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      codigo: 'DEMASIADOS_INTENTOS',
      mensaje: 'Demasiados intentos de ingreso. Espere unos minutos y vuelva a intentarlo.',
    },
  },
});

export const authRouter = Router();

authRouter.post(
  '/login',
  limiteLogin,
  validar({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const resultado = await login(req.body);
    res.json(resultado);
  }),
);

authRouter.get(
  '/yo',
  autenticar,
  asyncHandler(async (req, res) => {
    const perfil = await obtenerPerfil(req.usuario!.id);
    res.json(perfil);
  }),
);

authRouter.post(
  '/cambiar-password',
  autenticar,
  validar({ body: cambiarPasswordSchema }),
  asyncHandler(async (req, res) => {
    await cambiarPassword(req.usuario!.id, req.body);
    res.json({ mensaje: 'La contraseña fue actualizada.' });
  }),
);
