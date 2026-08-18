import { Router } from 'express';
import { z } from 'zod';
import { autenticar, exigirSupervision, resolverPuesto } from '../../middleware/auth.js';
import { validar } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { generarReporteExcel, resumenReporte } from './reportes.service.js';

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato YYYY-MM-DD');

const rangoSchema = z
  .object({
    desde: dia,
    hasta: dia,
    puestoId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, 'Identificador inválido')
      .optional(),
  })
  .refine((datos) => datos.desde <= datos.hasta, {
    message: 'La fecha inicial no puede ser posterior a la final',
    path: ['desde'],
  });

export const reportesRouter = Router();

reportesRouter.use(autenticar, exigirSupervision);

reportesRouter.get(
  '/resumen',
  validar({ query: rangoSchema }),
  asyncHandler(async (req, res) => {
    const rango = req.query as never as z.infer<typeof rangoSchema>;
    res.json(await resumenReporte(rango));
  }),
);

/** Descarga del reporte en Excel (punto 16). */
reportesRouter.get(
  '/excel',
  validar({ query: rangoSchema }),
  asyncHandler(async (req, res) => {
    const rango = req.query as never as z.infer<typeof rangoSchema>;
    resolverPuesto(req, rango.puestoId ?? null);

    const buffer = await generarReporteExcel(rango);
    const nombre = `inocarne-${rango.desde}-a-${rango.hasta}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(Buffer.from(buffer));
  }),
);
