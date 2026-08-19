import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { formatInZone, zonedDayKey } from '../../src/domain/time.js';
import { cerrarBaseDePrueba, conectarBaseDePrueba, limpiarBaseDePrueba } from '../helpers/db.js';
import { app, crearPuesto, crearSesion } from '../helpers/factories.js';

const TZ = 'America/La_Paz';

beforeAll(async () => {
  await conectarBaseDePrueba();
});

afterAll(async () => {
  await cerrarBaseDePrueba();
});

beforeEach(async () => {
  await limpiarBaseDePrueba();
});

/**
 * Una fecha sin hora es un día del mercado, no un instante UTC.
 *
 * `new Date('2030-03-10')` es medianoche UTC, que en Bolivia todavía es el 9 a
 * las 20:00: los plazos vencían un día antes y los avisos anunciaban la fecha
 * equivocada.
 */
describe('las fechas sin hora se guardan como día del mercado', () => {
  it('una capacitación queda en el día que se pidió', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    await crearPuesto(1);

    const respuesta = await request(app)
      .post('/api/capacitaciones')
      .set('Authorization', supervisor.auth)
      .send({ tema: 'HACCP', fechaProgramada: '2030-03-10', hora: '15:00' });

    expect(respuesta.status).toBe(201);
    expect(zonedDayKey(new Date(respuesta.body.fechaProgramada), TZ)).toBe('2030-03-10');
  });

  it('y el aviso al puesto anuncia esa misma fecha', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const puesto = await crearPuesto(1);
    const vendedor = await crearSesion({
      rol: 'puesto',
      usuario: 'puesto1',
      puestoId: String(puesto._id),
    });

    await request(app)
      .post('/api/capacitaciones')
      .set('Authorization', supervisor.auth)
      .send({ tema: 'HACCP', fechaProgramada: '2030-03-10', hora: '15:00' });

    const avisos = await request(app)
      .get('/api/notificaciones')
      .set('Authorization', vendedor.auth);

    expect(avisos.body.data[0].mensaje).toContain('10/03/2030');
    expect(avisos.body.data[0].mensaje).not.toContain('09/03/2030');
  });

  it('una fumigación programada anuncia el día correcto', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const puesto = await crearPuesto(1);
    const vendedor = await crearSesion({
      rol: 'puesto',
      usuario: 'puesto1',
      puestoId: String(puesto._id),
    });

    await request(app)
      .post('/api/control-plagas')
      .set('Authorization', supervisor.auth)
      .send({ fechaProgramada: '2026-08-25', hora: '16:00', todosLosPuestos: true });

    const avisos = await request(app)
      .get('/api/notificaciones')
      .set('Authorization', vendedor.auth);
    const aviso = avisos.body.data.find((a: { tipo: string }) => a.tipo === 'control_plagas');

    expect(aviso.mensaje).toContain('25/08/2026');
  });

  it('un plazo no vence el día antes de cumplirse', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const puesto = await crearPuesto(1);

    // El plazo es hoy: mientras el día no termine, la acción sigue en plazo.
    const hoy = zonedDayKey(new Date(), TZ);
    const creada = await request(app)
      .post('/api/no-conformidades')
      .set('Authorization', supervisor.auth)
      .send({ puestoId: String(puesto._id), hallazgo: 'Piso sucio', fechaLimite: hoy });

    expect(creada.body.estadoActual).toBe('pendiente');
    expect(formatInZone(new Date(creada.body.fechaLimite), TZ)).toContain(
      hoy.split('-').reverse().join('/'),
    );
  });

  it('un equipo con mantenimiento para hoy no figura vencido', async () => {
    const puesto = await crearPuesto(1);
    const vendedor = await crearSesion({
      rol: 'puesto',
      usuario: 'puesto1',
      puestoId: String(puesto._id),
    });
    const hoy = zonedDayKey(new Date(), TZ);

    const equipo = await request(app)
      .post('/api/equipos')
      .set('Authorization', vendedor.auth)
      .send({ nombre: 'Vitrina', proximoMantenimiento: hoy });

    expect(equipo.body.estadoMantenimiento).toBe('proximo');
  });

  it('sigue aceptando un instante completo tal como llega', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    await crearPuesto(1);

    const respuesta = await request(app)
      .post('/api/capacitaciones')
      .set('Authorization', supervisor.auth)
      .send({ tema: 'HACCP', fechaProgramada: '2030-03-10T18:30:00.000Z', hora: '15:00' });

    expect(new Date(respuesta.body.fechaProgramada).toISOString()).toBe('2030-03-10T18:30:00.000Z');
  });

  it('rechaza una fecha que no se entiende', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .post('/api/capacitaciones')
      .set('Authorization', supervisor.auth)
      .send({ tema: 'HACCP', fechaProgramada: 'el jueves', hora: '15:00' });

    expect(respuesta.status).toBe(400);
  });
});
