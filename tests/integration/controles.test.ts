import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { zonedDayKey, zonedTimeKey, zonedTimeToUtc } from '../../src/domain/time.js';
import { estadoDelDia } from '../../src/modules/controles/controles.service.js';
import {
  actualizarConfiguracion,
  invalidarConfiguracion,
} from '../../src/services/configuracion.service.js';
import { cerrarBaseDePrueba, conectarBaseDePrueba, limpiarBaseDePrueba } from '../helpers/db.js';
import { app, crearSesion, crearSesionPuesto } from '../helpers/factories.js';

const TZ = 'America/La_Paz';

/** Hora local `HH:mm` desplazada en minutos respecto de ahora. */
function horaLocalDesplazada(minutos: number): string {
  return zonedTimeKey(new Date(Date.now() + minutos * 60_000), TZ);
}

/**
 * Franja dentro de la tolerancia, sin cruzar la medianoche local.
 *
 * El cumplimiento se calcula dentro de un mismo día del mercado. Restar
 * minutos de madrugada daría una hora del día anterior y el control aparecería
 * con retraso, así que cerca de la medianoche el desplazamiento va hacia
 * adelante: dentro de la ventana igual, pero sin cambiar de día.
 */
function franjaDentroDeTolerancia(minutos: number): string {
  const [horas = '0', min = '0'] = zonedTimeKey(new Date(), TZ).split(':');
  const minutosDelDia = Number(horas) * 60 + Number(min);
  const haciaAtras = minutosDelDia >= minutos && minutosDelDia + minutos < 24 * 60;
  return horaLocalDesplazada(haciaAtras ? -minutos : minutos);
}

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

describe('POST /api/controles — cumplimiento horario (regla R4)', () => {
  it('marca a tiempo un registro hecho dentro de la tolerancia', async () => {
    const franja = horaLocalDesplazada(0);
    await actualizarConfiguracion({ horariosExhibicion: [franja], toleranciaMinutos: 15 });
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({ ...controlExhibicion, franjaProgramada: franja });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.cumplimiento).toBe('a_tiempo');
    expect(respuesta.body.dentroRango).toBe(true);
  });

  it('marca con retraso un registro fuera de la tolerancia', async () => {
    const franja = horaLocalDesplazada(-90);
    await actualizarConfiguracion({ horariosExhibicion: [franja], toleranciaMinutos: 15 });
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({ ...controlExhibicion, franjaProgramada: franja });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.cumplimiento).toBe('con_retraso');
  });

  it('respeta una tolerancia configurada más amplia', async () => {
    const franja = franjaDentroDeTolerancia(40);
    await actualizarConfiguracion({ horariosExhibicion: [franja], toleranciaMinutos: 60 });
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({ ...controlExhibicion, franjaProgramada: franja });

    expect(respuesta.body.cumplimiento).toBe('a_tiempo');
  });

  it('rechaza una franja que no está programada', async () => {
    await actualizarConfiguracion({ horariosExhibicion: ['07:00', '10:30', '13:30'] });
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({ ...controlExhibicion, franjaProgramada: '09:15' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.mensaje).toMatch(/no está programado/i);
  });

  it('no permite registrar dos veces la misma franja el mismo día', async () => {
    const franja = horaLocalDesplazada(0);
    await actualizarConfiguracion({ horariosExhibicion: [franja] });
    const { sesion } = await crearSesionPuesto(1);
    const cuerpo = { ...controlExhibicion, franjaProgramada: franja };

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
  });

  it('dos puestos distintos pueden registrar la misma franja', async () => {
    const franja = horaLocalDesplazada(0);
    await actualizarConfiguracion({ horariosExhibicion: [franja] });
    const puesto1 = await crearSesionPuesto(1);
    const puesto2 = await crearSesionPuesto(2);
    const cuerpo = { ...controlExhibicion, franjaProgramada: franja };

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
  });
});

describe('POST /api/controles — validación de mediciones', () => {
  it('marca fuera de rango una temperatura mayor a 5 °C', async () => {
    const franja = horaLocalDesplazada(0);
    await actualizarConfiguracion({ horariosExhibicion: [franja] });
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({ ...controlExhibicion, franjaProgramada: franja, temperatura: 7.4 });

    expect(respuesta.body.dentroRango).toBe(false);
    expect(respuesta.body.desviaciones).toHaveLength(1);
  });

  it('el control de exhibición exige pH y tipo de carne', async () => {
    const franja = horaLocalDesplazada(0);
    await actualizarConfiguracion({ horariosExhibicion: [franja] });
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({ tipo: 'exhibicion', franjaProgramada: franja, temperatura: 4 });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalle).toHaveProperty('ph');
  });

  it('el control de refrigeración solo necesita la temperatura', async () => {
    const franja = horaLocalDesplazada(0);
    await actualizarConfiguracion({ horariosRefrigeracion: [franja] });
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({ tipo: 'refrigeracion', franjaProgramada: franja, temperatura: 2.8 });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.ph).toBeNull();
    expect(respuesta.body.tipoCarne).toBeNull();
  });
});

describe('estado de las franjas del día', () => {
  it('una franja cuya ventana ya cerró sin registro queda no realizada', async () => {
    await actualizarConfiguracion({
      horariosExhibicion: ['07:00'],
      horariosRefrigeracion: ['07:00'],
      toleranciaMinutos: 15,
    });
    const { puesto } = await crearSesionPuesto(1);
    const dia = '2026-02-09';
    const ahora = zonedTimeToUtc(dia, '12:00', TZ);

    const { franjas } = await estadoDelDia(String(puesto._id), dia, ahora);

    expect(franjas).toHaveLength(2);
    expect(franjas.every((f) => f.estado === 'no_realizado')).toBe(true);
    expect(franjas.every((f) => f.semaforo === 'rojo')).toBe(true);
  });

  it('una franja que todavía no vence queda pendiente', async () => {
    await actualizarConfiguracion({
      horariosExhibicion: ['13:30'],
      horariosRefrigeracion: ['13:30'],
    });
    const { puesto } = await crearSesionPuesto(1);
    const dia = '2026-02-09';
    const ahora = zonedTimeToUtc(dia, '09:00', TZ);

    const { franjas } = await estadoDelDia(String(puesto._id), dia, ahora);

    expect(franjas.every((f) => f.estado === 'pendiente')).toBe(true);
    expect(franjas.every((f) => f.semaforo === 'gris')).toBe(true);
  });

  it('devuelve el registro junto a la franja cuando ya fue realizado', async () => {
    const franja = horaLocalDesplazada(0);
    await actualizarConfiguracion({
      horariosExhibicion: [franja],
      horariosRefrigeracion: [franja],
    });
    const { sesion, puesto } = await crearSesionPuesto(1);

    await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({ ...controlExhibicion, franjaProgramada: franja });

    const { franjas } = await estadoDelDia(String(puesto._id), zonedDayKey(new Date(), TZ));
    const exhibicion = franjas.find((f) => f.tipo === 'exhibicion');
    const refrigeracion = franjas.find((f) => f.tipo === 'refrigeracion');

    expect(exhibicion?.estado).toBe('a_tiempo');
    expect(exhibicion?.semaforo).toBe('verde');
    expect(exhibicion?.registro).not.toBeNull();
    expect(refrigeracion?.registro).toBeNull();
  });

  it('un control con medición fuera de rango es rojo aunque sea puntual', async () => {
    const franja = horaLocalDesplazada(0);
    await actualizarConfiguracion({ horariosExhibicion: [franja], horariosRefrigeracion: [] });
    const { sesion, puesto } = await crearSesionPuesto(1);

    await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({ ...controlExhibicion, franjaProgramada: franja, temperatura: 9 });

    const { franjas } = await estadoDelDia(String(puesto._id), zonedDayKey(new Date(), TZ));
    expect(franjas[0]?.estado).toBe('a_tiempo');
    expect(franjas[0]?.semaforo).toBe('rojo');
  });
});

describe('GET /api/controles/dia', () => {
  it('el vendedor consulta su propio día sin indicar el puesto', async () => {
    await actualizarConfiguracion({
      horariosExhibicion: ['07:00', '10:30', '13:30'],
      horariosRefrigeracion: ['07:00', '13:30'],
    });
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .get('/api/controles/dia')
      .set('Authorization', sesion.auth);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.franjas).toHaveLength(5);
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
