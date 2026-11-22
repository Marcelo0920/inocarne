import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { zonedDayKey, zonedTimeToUtc } from '../../src/domain/time.js';
import { ControlModel } from '../../src/models/Control.js';
import { estadoDelDia } from '../../src/modules/controles/controles.service.js';
import {
  actualizarConfiguracion,
  invalidarConfiguracion,
} from '../../src/services/configuracion.service.js';
import { cerrarBaseDePrueba, conectarBaseDePrueba, limpiarBaseDePrueba } from '../helpers/db.js';
import { app, crearSesion, crearSesionPuesto } from '../helpers/factories.js';

const TZ = 'America/La_Paz';

/** Hora del teléfono desplazada en minutos respecto de ahora, como la manda el cliente. */
const horaDelTelefono = (minutos = 0): string =>
  new Date(Date.now() + minutos * 60_000).toISOString();

const controlExhibicion = {
  tipo: 'exhibicion' as const,
  temperatura: 4,
  ph: 5.6,
  tipoCarne: 'res' as const,
};

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

describe('POST /api/controles — hora del teléfono, sin horario fijo', () => {
  it('guarda la hora del teléfono y aparte la hora del servidor', async () => {
    const { sesion } = await crearSesionPuesto(1);
    const hora = horaDelTelefono(-10);
    const antes = Date.now();

    const respuesta = await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({ ...controlExhibicion, horaDispositivo: hora });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.horaDispositivo).toBe(hora);
    expect(new Date(respuesta.body.registradoEn).getTime()).toBeGreaterThanOrEqual(antes - 1000);
    expect(respuesta.body.registradoEn).not.toBe(hora);
  });

  it('no evalúa puntualidad: no existe estado a tiempo ni con retraso', async () => {
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({ ...controlExhibicion, horaDispositivo: horaDelTelefono(-180) });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).not.toHaveProperty('cumplimiento');
    expect(respuesta.body).not.toHaveProperty('franjaProgramada');
  });

  it('el día del control sale de la hora del teléfono', async () => {
    const { sesion } = await crearSesionPuesto(1);
    const ayerALas22 = zonedTimeToUtc('2026-02-09', '22:00', TZ).toISOString();

    const respuesta = await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({ ...controlExhibicion, horaDispositivo: ayerALas22 });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.dia).toBe('2026-02-09');
  });

  it('numera los controles del día en orden de llegada', async () => {
    await actualizarConfiguracion({ controlesExhibicionPorDia: 3 });
    const { sesion } = await crearSesionPuesto(1);

    const numeros: number[] = [];
    for (const minutos of [-30, -20, -10]) {
      const respuesta = await request(app)
        .post('/api/controles')
        .set('Authorization', sesion.auth)
        .send({ ...controlExhibicion, horaDispositivo: horaDelTelefono(minutos) });
      numeros.push(respuesta.body.numero);
    }

    expect(numeros).toEqual([1, 2, 3]);
  });

  it('no permite más controles de los que corresponden al día', async () => {
    await actualizarConfiguracion({ controlesRefrigeracionPorDia: 2 });
    const { sesion } = await crearSesionPuesto(1);
    const enviar = (minutos: number) =>
      request(app)
        .post('/api/controles')
        .set('Authorization', sesion.auth)
        .send({ tipo: 'refrigeracion', temperatura: 3, horaDispositivo: horaDelTelefono(minutos) });

    await enviar(-30);
    await enviar(-20);
    const tercero = await enviar(-10);

    expect(tercero.status).toBe(409);
    expect(tercero.body.error.mensaje).toMatch(/ya registró los 2 controles de refrigeración/i);
  });

  it('reenviar el mismo registro responde 409 y no lo duplica', async () => {
    const { sesion } = await crearSesionPuesto(1);
    const cuerpo = { ...controlExhibicion, horaDispositivo: horaDelTelefono(-5) };

    const primero = await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send(cuerpo);
    const segundo = await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send(cuerpo);

    expect(primero.status).toBe(201);
    expect(segundo.status).toBe(409);
    expect(segundo.body.error.mensaje).toMatch(/ya fue registrado/i);
    expect(await ControlModel.countDocuments()).toBe(1);
  });

  it('dos puestos llevan su propia numeración', async () => {
    const puesto1 = await crearSesionPuesto(1);
    const puesto2 = await crearSesionPuesto(2);
    const cuerpo = { ...controlExhibicion, horaDispositivo: horaDelTelefono(-5) };

    const a = await request(app)
      .post('/api/controles')
      .set('Authorization', puesto1.sesion.auth)
      .send(cuerpo);
    const b = await request(app)
      .post('/api/controles')
      .set('Authorization', puesto2.sesion.auth)
      .send(cuerpo);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.numero).toBe(1);
  });

  it('exige la hora del teléfono', async () => {
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send(controlExhibicion);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalle).toHaveProperty('horaDispositivo');
  });

  it('rechaza una hora del teléfono que no es una fecha válida', async () => {
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({ ...controlExhibicion, horaDispositivo: '10:30' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalle).toHaveProperty('horaDispositivo');
  });
});

describe('POST /api/controles — validación de mediciones', () => {
  it('marca fuera de rango una temperatura mayor a 5 °C', async () => {
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({ ...controlExhibicion, temperatura: 7.4, horaDispositivo: horaDelTelefono() });

    expect(respuesta.body.dentroRango).toBe(false);
    expect(respuesta.body.desviaciones).toHaveLength(1);
  });

  it('el control de exhibición exige pH y tipo de carne', async () => {
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({ tipo: 'exhibicion', temperatura: 4, horaDispositivo: horaDelTelefono() });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalle).toHaveProperty('ph');
  });

  it('el control de refrigeración solo necesita la temperatura', async () => {
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({ tipo: 'refrigeracion', temperatura: 2.8, horaDispositivo: horaDelTelefono() });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.ph).toBeNull();
    expect(respuesta.body.tipoCarne).toBeNull();
  });
});

describe('estado de los controles del día', () => {
  it('cada tipo tiene tantos controles como indica la configuración', async () => {
    await actualizarConfiguracion({
      controlesExhibicionPorDia: 3,
      controlesRefrigeracionPorDia: 2,
    });
    const { puesto } = await crearSesionPuesto(1);

    const { controles } = await estadoDelDia(String(puesto._id), '2026-02-09');

    expect(controles.filter((c) => c.tipo === 'exhibicion').map((c) => c.numero)).toEqual([
      1, 2, 3,
    ]);
    expect(controles.filter((c) => c.tipo === 'refrigeracion').map((c) => c.numero)).toEqual([
      1, 2,
    ]);
  });

  it('un control sin registro queda pendiente mientras dure el día, a cualquier hora', async () => {
    const { puesto } = await crearSesionPuesto(1);
    const dia = '2026-02-09';

    const { controles } = await estadoDelDia(
      String(puesto._id),
      dia,
      zonedTimeToUtc(dia, '23:00', TZ),
    );

    expect(controles.every((c) => c.estado === 'pendiente')).toBe(true);
    expect(controles.every((c) => c.semaforo === 'gris')).toBe(true);
  });

  it('un control sin registro queda no realizado cuando el día terminó', async () => {
    const { puesto } = await crearSesionPuesto(1);
    const ahora = zonedTimeToUtc('2026-02-10', '08:00', TZ);

    const { controles } = await estadoDelDia(String(puesto._id), '2026-02-09', ahora);

    expect(controles.every((c) => c.estado === 'no_realizado')).toBe(true);
    expect(controles.every((c) => c.semaforo === 'rojo')).toBe(true);
  });

  it('devuelve el registro en el primer control del tipo cuando ya se realizó', async () => {
    const { sesion, puesto } = await crearSesionPuesto(1);
    const hora = horaDelTelefono();

    await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({ ...controlExhibicion, horaDispositivo: hora });

    const { controles } = await estadoDelDia(String(puesto._id), zonedDayKey(new Date(hora), TZ));
    const primero = controles.find((c) => c.tipo === 'exhibicion' && c.numero === 1);
    const segundo = controles.find((c) => c.tipo === 'exhibicion' && c.numero === 2);
    const refrigeracion = controles.find((c) => c.tipo === 'refrigeracion');

    expect(primero?.estado).toBe('realizado');
    expect(primero?.semaforo).toBe('verde');
    expect(primero?.registro?.horaDispositivo).toEqual(new Date(hora));
    expect(segundo?.registro).toBeNull();
    expect(refrigeracion?.registro).toBeNull();
  });

  it('un control con medición fuera de rango es rojo', async () => {
    const { sesion, puesto } = await crearSesionPuesto(1);
    const hora = horaDelTelefono();

    await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({ ...controlExhibicion, temperatura: 9, horaDispositivo: hora });

    const { controles } = await estadoDelDia(String(puesto._id), zonedDayKey(new Date(hora), TZ));
    expect(controles[0]?.estado).toBe('realizado');
    expect(controles[0]?.semaforo).toBe('rojo');
  });
});

describe('GET /api/controles/dia', () => {
  it('el vendedor consulta su propio día sin indicar el puesto', async () => {
    await actualizarConfiguracion({
      controlesExhibicionPorDia: 3,
      controlesRefrigeracionPorDia: 2,
    });
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .get('/api/controles/dia')
      .set('Authorization', sesion.auth);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.controles).toHaveLength(5);
  });

  it('el vendedor no puede consultar el día de otro puesto', async () => {
    const puesto1 = await crearSesionPuesto(1);
    const puesto2 = await crearSesionPuesto(2);

    const respuesta = await request(app)
      .get('/api/controles/dia')
      .query({ puestoId: String(puesto2.puesto._id) })
      .set('Authorization', puesto1.sesion.auth);

    expect(respuesta.status).toBe(403);
  });

  it('el supervisor consulta el día de cualquier puesto', async () => {
    const { puesto } = await crearSesionPuesto(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .get('/api/controles/dia')
      .query({ puestoId: String(puesto._id) })
      .set('Authorization', supervisor.auth);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.dia).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
