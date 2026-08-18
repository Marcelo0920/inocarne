import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { autenticar, resolverPuesto } from '../../middleware/auth.js';
import { validar } from '../../middleware/validate.js';
import { NotificacionModel, type Notificacion } from '../../models/Notificacion.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { buildPaginated } from '../../utils/pagination.js';
import type { FilterQuery } from 'mongoose';

const listarSchema = z.object({
  soloNoLeidas: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Identificador inválido'),
});

export const notificacionesRouter = Router();

notificacionesRouter.use(autenticar);

/**
 * Cada quien ve lo suyo: el puesto sus avisos, la supervisión los generales.
 * Los avisos programados a futuro no aparecen hasta que llega su momento.
 */
function filtroPara(rol: string, puestoId: string | null): FilterQuery<Notificacion> {
  const base: FilterQuery<Notificacion> = {
    enviada: true,
    programadaPara: { $lte: new Date() },
  };
  if (rol === 'puesto') {
    return { ...base, puestoId: new Types.ObjectId(puestoId!) };
  }
  return { ...base, paraSupervision: true };
}

notificacionesRouter.get(
  '/',
  validar({ query: listarSchema }),
  asyncHandler(async (req, res) => {
    const { soloNoLeidas, page, limit } = req.query as never as z.infer<typeof listarSchema>;
    const puestoId = req.usuario!.rol === 'puesto' ? resolverPuesto(req) : null;

    const consulta = filtroPara(req.usuario!.rol, puestoId);
    if (soloNoLeidas) consulta.leida = false;

    const [datos, total] = await Promise.all([
      NotificacionModel.find(consulta)
        .sort({ programadaPara: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      NotificacionModel.countDocuments(consulta),
    ]);

    res.json(buildPaginated(datos, total, { page, limit }));
  }),
);

/** Cantidad de avisos sin leer, para el indicador de la pantalla de inicio. */
notificacionesRouter.get(
  '/sin-leer',
  asyncHandler(async (req, res) => {
    const puestoId = req.usuario!.rol === 'puesto' ? resolverPuesto(req) : null;
    const consulta = { ...filtroPara(req.usuario!.rol, puestoId), leida: false };
    res.json({ total: await NotificacionModel.countDocuments(consulta) });
  }),
);

notificacionesRouter.post(
  '/:id/leida',
  validar({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const notificacion = await NotificacionModel.findById(req.params.id);
    if (!notificacion) throw ApiError.notFound('El aviso no existe.');

    // Nadie marca como leído un aviso que no le corresponde.
    if (req.usuario!.rol === 'puesto') {
      const propio = resolverPuesto(req);
      if (String(notificacion.puestoId) !== propio) throw ApiError.forbidden();
    } else if (!notificacion.paraSupervision) {
      throw ApiError.forbidden();
    }

    notificacion.leida = true;
    notificacion.leidaEn = new Date();
    await notificacion.save();
    res.json(notificacion.toObject());
  }),
);

notificacionesRouter.post(
  '/leer-todas',
  asyncHandler(async (req, res) => {
    const puestoId = req.usuario!.rol === 'puesto' ? resolverPuesto(req) : null;
    const consulta = { ...filtroPara(req.usuario!.rol, puestoId), leida: false };
    const resultado = await NotificacionModel.updateMany(consulta, {
      $set: { leida: true, leidaEn: new Date() },
    });
    res.json({ actualizadas: resultado.modifiedCount });
  }),
);
