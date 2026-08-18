import { PuestoModel, type Puesto } from '../../models/Puesto.js';
import { ApiError } from '../../utils/ApiError.js';
import type { z } from 'zod';
import type { actualizarPuestoSchema, crearPuestoSchema } from './puestos.schemas.js';

type CrearPuesto = z.infer<typeof crearPuestoSchema>;
type ActualizarPuesto = z.infer<typeof actualizarPuestoSchema>;

/** Lista de puestos, opcionalmente filtrada por estado. */
export async function listarPuestos(activo?: boolean): Promise<Puesto[]> {
  const filtro = activo === undefined ? {} : { activo };
  return PuestoModel.find(filtro).sort({ numero: 1 }).lean();
}

export async function obtenerPuesto(id: string): Promise<Puesto> {
  const puesto = await PuestoModel.findById(id).lean();
  if (!puesto) throw ApiError.notFound('El puesto no existe.');
  return puesto;
}

export async function crearPuesto(datos: CrearPuesto): Promise<Puesto> {
  const existente = await PuestoModel.findOne({ numero: datos.numero }).lean();
  if (existente) throw ApiError.conflict(`Ya existe el puesto número ${datos.numero}.`);
  const creado = await PuestoModel.create(datos);
  return creado.toObject();
}

export async function actualizarPuesto(id: string, cambios: ActualizarPuesto): Promise<Puesto> {
  const puesto = await PuestoModel.findByIdAndUpdate(
    id,
    { $set: cambios },
    { new: true, runValidators: true },
  ).lean();
  if (!puesto) throw ApiError.notFound('El puesto no existe.');
  return puesto;
}
