import { v2 as cloudinary } from 'cloudinary';
import { env, isCloudinaryConfigured } from '../config/env.js';
import type { Evidencia } from '../models/shared.js';
import { ApiError } from '../utils/ApiError.js';

let configurado = false;

function configurar(): void {
  if (configurado) return;
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  configurado = true;
}

function exigirConfiguracion(): void {
  if (!isCloudinaryConfigured()) {
    throw ApiError.notConfigured(
      'El almacenamiento de imágenes no está configurado. Complete CLOUDINARY_CLOUD_NAME, ' +
        'CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en el archivo .env.',
    );
  }
  configurar();
}

/**
 * Sube un archivo y devuelve únicamente la referencia que se guarda en la base
 * de datos: la URL y el identificador público. La imagen nunca se almacena en Mongo.
 */
export async function subirEvidencia(
  archivo: Express.Multer.File,
  subcarpeta: string,
): Promise<Evidencia> {
  exigirConfiguracion();

  return new Promise<Evidencia>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `${env.CLOUDINARY_FOLDER}/${subcarpeta}`,
        resource_type: 'auto',
        // Las fotos se toman con el teléfono: se limita el tamaño para no
        // agotar la cuota del plan gratuito.
        transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto:good' }],
      },
      (error, resultado) => {
        if (error || !resultado) {
          reject(
            ApiError.badRequest(
              `No se pudo subir el archivo: ${error?.message ?? 'error desconocido'}`,
            ),
          );
          return;
        }
        resolve({
          url: resultado.secure_url,
          publicId: resultado.public_id,
          subidoEn: new Date(),
        });
      },
    );
    stream.end(archivo.buffer);
  });
}

/** Sube varios archivos en paralelo. */
export async function subirEvidencias(
  archivos: Express.Multer.File[],
  subcarpeta: string,
): Promise<Evidencia[]> {
  return Promise.all(archivos.map((archivo) => subirEvidencia(archivo, subcarpeta)));
}

/** Elimina un archivo. Solo se usa al deshacer una subida fallida. */
export async function eliminarEvidencia(publicId: string): Promise<void> {
  exigirConfiguracion();
  await cloudinary.uploader.destroy(publicId);
}

export { isCloudinaryConfigured };
