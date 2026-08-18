import { Router } from 'express';
import multer from 'multer';
import { autenticar } from '../../middleware/auth.js';
import { isCloudinaryConfigured, subirEvidencia } from '../../services/cloudinary.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const SUBCARPETAS = [
  'recepciones',
  'limpiezas',
  'inspecciones',
  'equipos',
  'mantenimientos',
  'no-conformidades',
  'capacitaciones',
  'plagas',
  'firmas',
] as const;

/**
 * Los archivos viajan en memoria y se reenvían a Cloudinary; el servidor no
 * escribe nada en disco. El límite acompaña a la compresión que hace el navegador.
 */
const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const permitido = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(file.mimetype);
    if (!permitido) {
      callback(ApiError.badRequest('Solo se admiten imágenes o documentos PDF.'));
      return;
    }
    callback(null, true);
  },
});

export const archivosRouter = Router();

/**
 * Sube una evidencia y devuelve su referencia.
 * El cliente adjunta esa referencia al registro que esté creando.
 */
archivosRouter.post(
  '/',
  autenticar,
  subida.single('archivo'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No se recibió ningún archivo.');

    const subcarpeta = String(req.body?.subcarpeta ?? 'general');
    if (!SUBCARPETAS.includes(subcarpeta as (typeof SUBCARPETAS)[number])) {
      throw ApiError.badRequest(`Destino de archivo inválido: "${subcarpeta}".`);
    }

    const evidencia = await subirEvidencia(req.file, subcarpeta);
    res.status(201).json(evidencia);
  }),
);

/** Permite a la interfaz saber si puede ofrecer la cámara o debe ocultarla. */
archivosRouter.get('/estado', autenticar, (_req, res) => {
  res.json({ configurado: isCloudinaryConfigured() });
});
