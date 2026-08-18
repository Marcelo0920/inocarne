/**
 * Datos iniciales para poder usar la plataforma desde el primer día.
 *
 *   npm run seed              crea lo que falte, sin tocar lo existente
 *   npm run seed -- --reset   borra todo y vuelve a crearlo (solo en desarrollo)
 *
 * Las contraseñas de ejemplo deben cambiarse antes de usar el sistema de verdad.
 */
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { env } from '../config/env.js';
import { CONFIGURACION_POR_DEFECTO } from '../domain/constants.js';
import { ConfiguracionModel } from '../models/Configuracion.js';
import { EquipoModel } from '../models/Equipo.js';
import { PuestoModel } from '../models/Puesto.js';
import { UsuarioModel, hashPassword } from '../models/Usuario.js';

const CANTIDAD_PUESTOS = 5;
const PASSWORD_INICIAL = 'inocarne2026';

const cuentas = [
  { nombre: 'Administrador del sistema', usuario: 'admin', rol: 'admin' as const },
  { nombre: 'Supervisora de Calidad', usuario: 'supervisor', rol: 'supervisor' as const },
  { nombre: 'Coordinador HACCP', usuario: 'coordinador', rol: 'coordinador' as const },
];

async function sembrar(): Promise<void> {
  const reset = process.argv.includes('--reset');

  if (reset && env.isProduction) {
    throw new Error('El reinicio de datos no está permitido en producción.');
  }

  await connectDatabase();

  if (reset) {
    await Promise.all([
      UsuarioModel.deleteMany({}),
      PuestoModel.deleteMany({}),
      EquipoModel.deleteMany({}),
      ConfiguracionModel.deleteMany({}),
    ]);
    console.warn('Datos anteriores eliminados.');
  }

  // Configuración única del sistema.
  await ConfiguracionModel.findOneAndUpdate(
    { clave: 'global' },
    { $setOnInsert: { clave: 'global', ...CONFIGURACION_POR_DEFECTO } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  console.warn('Configuración lista: temperatura ≤ 5 °C, controles 07:00 / 10:30 / 13:30.');

  // Cuentas de supervisión y administración.
  for (const cuenta of cuentas) {
    const existe = await UsuarioModel.findOne({ usuario: cuenta.usuario }).lean();
    if (existe) continue;
    await UsuarioModel.create({
      ...cuenta,
      passwordHash: await hashPassword(PASSWORD_INICIAL),
      activo: true,
    });
    console.warn(`Usuario creado: ${cuenta.usuario} / ${PASSWORD_INICIAL}`);
  }

  // Puestos de venta con su usuario correspondiente.
  for (let numero = 1; numero <= CANTIDAD_PUESTOS; numero += 1) {
    let puesto = await PuestoModel.findOne({ numero });
    if (!puesto) {
      puesto = await PuestoModel.create({
        numero,
        nombre: `Puesto ${numero}`,
        responsable: `Responsable del puesto ${numero}`,
        activo: true,
      });
    }

    const usuario = `puesto${numero}`;
    const existe = await UsuarioModel.findOne({ usuario }).lean();
    if (!existe) {
      await UsuarioModel.create({
        nombre: `Vendedor del puesto ${numero}`,
        usuario,
        passwordHash: await hashPassword(PASSWORD_INICIAL),
        rol: 'puesto',
        puestoId: puesto._id,
        activo: true,
      });
      console.warn(`Usuario creado: ${usuario} / ${PASSWORD_INICIAL}`);
    }
  }

  console.warn('\nDatos iniciales cargados. Cambie las contraseñas antes de usarlo en el mercado.');
  await disconnectDatabase();
}

sembrar().catch((error: unknown) => {
  console.error('No se pudieron cargar los datos iniciales:', error);
  process.exit(1);
});
