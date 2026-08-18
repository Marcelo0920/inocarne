import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PUNTOS_LIMPIEZA } from '../../src/domain/constants.js';
import { invalidarConfiguracion } from '../../src/services/configuracion.service.js';
import { cerrarBaseDePrueba, conectarBaseDePrueba, limpiarBaseDePrueba } from '../helpers/db.js';
import { app, crearSesion, crearSesionPuesto } from '../helpers/factories.js';

/** Checklist completo con todos los puntos en cumple. */
const checklistCompleto = (cumple = true) => PUNTOS_LIMPIEZA.map((nombre) => ({ nombre, cumple }));

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

describe('GET /api/limpiezas/plantilla', () => {
  it('devuelve los diez puntos del checklist', async () => {
    const { sesion } = await crearSesionPuesto(1);
    const respuesta = await request(app)
      .get('/api/limpiezas/plantilla')
      .set('Authorization', sesion.auth);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.puntos).toHaveLength(10);
    expect(respuesta.body.puntos[0]).toBe('Higiene del personal');
  });
});

describe('POST /api/limpiezas', () => {
  it('registra el turno inicial con la hora del servidor', async () => {
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/limpiezas')
      .set('Authorization', sesion.auth)
      .send({ turno: 'inicial', items: checklistCompleto(), fotos: [] });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.cumple).toBe(true);
    expect(respuesta.body.incumplimientos).toHaveLength(0);
    expect(respuesta.body.registradoEn).toBeTruthy();
    expect(respuesta.body.turno).toBe('inicial');
  });

  it('registra los incumplimientos marcados', async () => {
    const { sesion } = await crearSesionPuesto(1);
    const items = checklistCompleto();
    items[7] = { nombre: 'Limpieza y desinfección del piso', cumple: false };

    const respuesta = await request(app)
      .post('/api/limpiezas')
      .set('Authorization', sesion.auth)
      .send({ turno: 'final', items, observaciones: 'Piso con residuos', fotos: [] });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.cumple).toBe(false);
    expect(respuesta.body.incumplimientos).toEqual(['Limpieza y desinfección del piso']);
  });

  it('rechaza un checklist incompleto', async () => {
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/limpiezas')
      .set('Authorization', sesion.auth)
      .send({ turno: 'inicial', items: checklistCompleto().slice(0, 4), fotos: [] });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalle.faltantes).toHaveLength(6);
  });

  it('rechaza puntos que no pertenecen al checklist', async () => {
    const { sesion } = await crearSesionPuesto(1);
    const items = [...checklistCompleto(), { nombre: 'Punto inventado', cumple: true }];

    const respuesta = await request(app)
      .post('/api/limpiezas')
      .set('Authorization', sesion.auth)
      .send({ turno: 'inicial', items, fotos: [] });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalle.sobrantes).toEqual(['Punto inventado']);
  });

  it('no admite dos checklists del mismo turno en el mismo día', async () => {
    const { sesion } = await crearSesionPuesto(1);
    const cuerpo = { turno: 'inicial', items: checklistCompleto(), fotos: [] };

    const primero = await request(app)
      .post('/api/limpiezas')
      .set('Authorization', sesion.auth)
      .send(cuerpo);
    const segundo = await request(app)
      .post('/api/limpiezas')
      .set('Authorization', sesion.auth)
      .send(cuerpo);

    expect(primero.status).toBe(201);
    expect(segundo.status).toBe(409);
  });

  it('permite registrar el turno inicial y el final el mismo día', async () => {
    const { sesion } = await crearSesionPuesto(1);

    const inicial = await request(app)
      .post('/api/limpiezas')
      .set('Authorization', sesion.auth)
      .send({ turno: 'inicial', items: checklistCompleto(), fotos: [] });
    const final = await request(app)
      .post('/api/limpiezas')
      .set('Authorization', sesion.auth)
      .send({ turno: 'final', items: checklistCompleto(), fotos: [] });

    expect(inicial.status).toBe(201);
    expect(final.status).toBe(201);
  });
});

describe('GET /api/limpiezas/dia', () => {
  it('muestra qué turnos ya se registraron', async () => {
    const { sesion } = await crearSesionPuesto(1);
    await request(app)
      .post('/api/limpiezas')
      .set('Authorization', sesion.auth)
      .send({ turno: 'inicial', items: checklistCompleto(), fotos: [] });

    const respuesta = await request(app)
      .get('/api/limpiezas/dia')
      .set('Authorization', sesion.auth);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.turnos).toHaveLength(2);
    expect(respuesta.body.turnos[0]).toMatchObject({
      turno: 'inicial',
      registrado: true,
      cumple: true,
    });
    expect(respuesta.body.turnos[1]).toMatchObject({
      turno: 'final',
      registrado: false,
      cumple: null,
    });
  });
});

describe('aislamiento entre puestos', () => {
  it('el vendedor solo ve sus propios checklists', async () => {
    const puesto1 = await crearSesionPuesto(1);
    const puesto2 = await crearSesionPuesto(2);

    await request(app)
      .post('/api/limpiezas')
      .set('Authorization', puesto1.sesion.auth)
      .send({ turno: 'inicial', items: checklistCompleto(), fotos: [] });
    await request(app)
      .post('/api/limpiezas')
      .set('Authorization', puesto2.sesion.auth)
      .send({ turno: 'inicial', items: checklistCompleto(), fotos: [] });

    const respuesta = await request(app)
      .get('/api/limpiezas')
      .set('Authorization', puesto1.sesion.auth);

    expect(respuesta.body.data).toHaveLength(1);
    expect(respuesta.body.data[0].puestoId).toBe(String(puesto1.puesto._id));
  });

  it('el supervisor ve los de todos y puede filtrar por incumplimiento', async () => {
    const puesto1 = await crearSesionPuesto(1);
    const puesto2 = await crearSesionPuesto(2);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    await request(app)
      .post('/api/limpiezas')
      .set('Authorization', puesto1.sesion.auth)
      .send({ turno: 'inicial', items: checklistCompleto(), fotos: [] });
    await request(app)
      .post('/api/limpiezas')
      .set('Authorization', puesto2.sesion.auth)
      .send({ turno: 'inicial', items: checklistCompleto(false), fotos: [] });

    const todos = await request(app).get('/api/limpiezas').set('Authorization', supervisor.auth);
    expect(todos.body.data).toHaveLength(2);

    const incumplidos = await request(app)
      .get('/api/limpiezas')
      .query({ cumple: 'false' })
      .set('Authorization', supervisor.auth);
    expect(incumplidos.body.data).toHaveLength(1);
    expect(incumplidos.body.data[0].incumplimientos).toHaveLength(10);
  });
});
