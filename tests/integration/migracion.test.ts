import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { zonedTimeToUtc } from '../../src/domain/time.js';
import { ConfiguracionModel } from '../../src/models/Configuracion.js';
import { ControlModel } from '../../src/models/Control.js';
import { estadoDelDia } from '../../src/modules/controles/controles.service.js';
import { migrarControlesSinHorario } from '../../src/scripts/migraciones/controlesSinHorario.js';
import { invalidarConfiguracion } from '../../src/services/configuracion.service.js';
import { cerrarBaseDePrueba, conectarBaseDePrueba, limpiarBaseDePrueba } from '../helpers/db.js';
import { app, crearSesionPuesto } from '../helpers/factories.js';

const TZ = 'America/La_Paz';
const DIA = '2026-02-09';

beforeAll(async () => {
  await conectarBaseDePrueba();
});

afterAll(async () => {
  await cerrarBaseDePrueba();
});

beforeEach(async () => {
  await limpiarBaseDePrueba();
  invalidarConfiguracion();
});

/**
 * Deja la colección como estaba antes del cambio: el índice único por franja y
 * dos controles del mismo día guardados con horario programado y puntualidad.
 */
async function baseConControlesAntiguos(puestoId: Types.ObjectId, usuarioId: Types.ObjectId) {
  await ControlModel.init();
  await ControlModel.collection.dropIndexes();
  await ControlModel.collection.createIndex(
    { tipo: 1, puestoId: 1, dia: 1, franjaProgramada: 1 },
    { unique: true },
  );

  const base = {
    puestoId,
    usuarioId,
    tipo: 'exhibicion',
    dia: DIA,
    temperatura: 4,
    ph: 5.6,
    tipoCarne: 'res',
    dentroRango: true,
    desviaciones: [],
    observaciones: null,
  };
  await ControlModel.collection.insertMany([
    {
      ...base,
      franjaProgramada: '10:30',
      cumplimiento: 'con_retraso',
      registradoEn: zonedTimeToUtc(DIA, '11:10', TZ),
    },
    {
      ...base,
      franjaProgramada: '07:00',
      cumplimiento: 'a_tiempo',
      registradoEn: zonedTimeToUtc(DIA, '07:05', TZ),
    },
  ]);
  await ConfiguracionModel.collection.insertOne({
    clave: 'global',
    // El administrador había configurado cuatro horarios: la cantidad debe conservarse.
    horariosExhibicion: ['07:00', '09:00', '10:30', '13:30'],
    horariosRefrigeracion: ['07:00', '13:30'],
    toleranciaMinutos: 15,
  });
}

const nombresDeIndices = async (): Promise<string[]> =>
  (await ControlModel.collection.indexes()).map((indice) => String(indice.name));

describe('migración de controles con horario a controles sin horario', () => {
  it('en ensayo informa lo pendiente y no cambia nada', async () => {
    const { puesto } = await crearSesionPuesto(1);
    await baseConControlesAntiguos(puesto._id, new Types.ObjectId());

    const resultado = await migrarControlesSinHorario(false);

    expect(resultado.controlesPendientes).toBe(2);
    expect(resultado.controlesMigrados).toBe(0);
    expect(await ControlModel.collection.countDocuments({ numero: { $exists: true } })).toBe(0);
    expect(await nombresDeIndices()).toContain('tipo_1_puestoId_1_dia_1_franjaProgramada_1');
  });

  it('numera por hora de registro, usa esa hora como hora del teléfono y quita los campos viejos', async () => {
    const { puesto } = await crearSesionPuesto(1);
    await baseConControlesAntiguos(puesto._id, new Types.ObjectId());

    const resultado = await migrarControlesSinHorario(true);
    const controles = await ControlModel.collection.find({}).sort({ numero: 1 }).toArray();

    expect(resultado.controlesMigrados).toBe(2);
    expect(controles.map((c) => c.numero)).toEqual([1, 2]);
    expect(controles[0]!.horaDispositivo).toEqual(zonedTimeToUtc(DIA, '07:05', TZ));
    expect(controles[1]!.horaDispositivo).toEqual(zonedTimeToUtc(DIA, '11:10', TZ));
    expect(controles.every((c) => !('franjaProgramada' in c) && !('cumplimiento' in c))).toBe(true);
  });

  it('reemplaza el índice por franja y quita los horarios de la configuración', async () => {
    const { puesto } = await crearSesionPuesto(1);
    await baseConControlesAntiguos(puesto._id, new Types.ObjectId());

    await migrarControlesSinHorario(true);
    const indices = await nombresDeIndices();
    const configuracion = await ConfiguracionModel.collection.findOne({ clave: 'global' });

    expect(indices).not.toContain('tipo_1_puestoId_1_dia_1_franjaProgramada_1');
    expect(indices).toContain('tipo_1_puestoId_1_dia_1_numero_1');
    expect(indices).toContain('tipo_1_puestoId_1_horaDispositivo_1');
    expect(configuracion).not.toHaveProperty('horariosExhibicion');
    expect(configuracion).not.toHaveProperty('toleranciaMinutos');
  });

  it('conserva cuántos controles por día tenía configurados cada tipo', async () => {
    const { puesto } = await crearSesionPuesto(1);
    await baseConControlesAntiguos(puesto._id, new Types.ObjectId());

    await migrarControlesSinHorario(true);
    const configuracion = await ConfiguracionModel.collection.findOne({ clave: 'global' });

    expect(configuracion?.controlesExhibicionPorDia).toBe(4);
    expect(configuracion?.controlesRefrigeracionPorDia).toBe(2);
  });

  it('antes de migrar, el día de un puesto con controles viejos no queda vacío', async () => {
    const { puesto } = await crearSesionPuesto(1);
    await baseConControlesAntiguos(puesto._id, new Types.ObjectId());

    const { controles } = await estadoDelDia(String(puesto._id), DIA);

    expect(controles.filter((c) => c.tipo === 'exhibicion')).toHaveLength(3);
  });

  it('después de migrar, ese mismo día admite el tercer control', async () => {
    const { puesto, sesion } = await crearSesionPuesto(1);
    await baseConControlesAntiguos(puesto._id, new Types.ObjectId());
    await migrarControlesSinHorario(true);

    const respuesta = await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({
        tipo: 'exhibicion',
        temperatura: 4,
        ph: 5.6,
        tipoCarne: 'res',
        horaDispositivo: zonedTimeToUtc(DIA, '13:40', TZ).toISOString(),
      });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.numero).toBe(3);
  });

  it('volver a ejecutarla no cambia nada', async () => {
    const { puesto } = await crearSesionPuesto(1);
    await baseConControlesAntiguos(puesto._id, new Types.ObjectId());

    await migrarControlesSinHorario(true);
    const segunda = await migrarControlesSinHorario(true);

    expect(segunda.controlesPendientes).toBe(0);
    expect(segunda.controlesMigrados).toBe(0);
  });
});
