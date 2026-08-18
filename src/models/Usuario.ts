import bcrypt from 'bcryptjs';
import { Schema, Types, type Model } from 'mongoose';
import { ROLES, type Rol } from '../domain/constants.js';
import { baseSchemaOptions, registrarModelo } from './shared.js';

export interface Usuario {
  nombre: string;
  usuario: string;
  passwordHash: string;
  rol: Rol;
  puestoId?: Types.ObjectId | null;
  activo: boolean;
  ultimoAcceso?: Date | null;
}

export interface UsuarioMethods {
  verificarPassword(password: string): Promise<boolean>;
}

const usuarioSchema = new Schema<Usuario, Model<Usuario, object, UsuarioMethods>, UsuarioMethods>(
  {
    nombre: { type: String, required: true, trim: true, maxlength: 120 },
    usuario: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 60,
    },
    passwordHash: { type: String, required: true, select: false },
    rol: { type: String, required: true, enum: ROLES },
    puestoId: { type: Schema.Types.ObjectId, ref: 'Puesto', default: null },
    activo: { type: Boolean, default: true },
    ultimoAcceso: { type: Date, default: null },
  },
  baseSchemaOptions,
);

// Un usuario de puesto siempre debe estar asociado a un puesto; el resto, nunca.
usuarioSchema.pre('validate', function (next) {
  if (this.rol === 'puesto' && !this.puestoId) {
    next(new Error('Un usuario de puesto debe estar asociado a un puesto.'));
    return;
  }
  if (this.rol !== 'puesto' && this.puestoId) {
    this.puestoId = null;
  }
  next();
});

usuarioSchema.methods.verificarPassword = function (password: string): Promise<boolean> {
  return bcrypt.compare(password, this.passwordHash);
};

usuarioSchema.index({ rol: 1, activo: 1 });

type UsuarioModelType = Model<Usuario, object, UsuarioMethods>;

export const UsuarioModel = registrarModelo<UsuarioModelType>('Usuario', usuarioSchema);

/** Hash de contraseña con el costo estándar del proyecto. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
