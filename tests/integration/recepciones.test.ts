import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { invalidarConfiguracion } from '../../src/services/configuracion.service.js';
import { cerrarBaseDePrueba, conectarBaseDePrueba, limpiarBaseDePrueba } from '../helpers/db.js';
import { app, crearSesion, crearSesionPuesto } from '../helpers/factories.js';

const EVIDENCIA = { url: 'https://res.cloudinary.com/demo/image/upload/x.jpg', publicId: 'demo/x' };

/** Recepción válida: todo dentro de rango y organolépticas aceptables. */
const recepcionValida = {
  proveedor: 'Frigorífico San Javier',
  tipoCarne: 'res' as const,
  cantidad: 80,
  unidad: 'kg',
  temperatura: 3.5,
  ph: 5.6,
  organolepticas: { color: true, olor: true, textura: true, grasa: true },
  resultado: 'aceptado' as const,
  firma: EVIDENCIA,
  fotos: [],
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

describe('POST /api/recepciones', () => {
  it('registra una recepción y le pone fecha y hora del servidor', async () => {
    const { sesion, puesto } = await crearSesionPuesto(1);
    const antes = Date.now();

    const respuesta = await request(app)
      .post('/api/recepciones')
      .set('Authorization', sesion.auth)
      .send(recepcionValida);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.dentroRango).toBe(true);
    expect(respuesta.body.puestoId).toBe(String(puesto._id));
    expect(respuesta.body.usuarioId).toBe(sesion.usuarioId);

    const registradoEn = new Date(respuesta.body.registradoEn).getTime();
    expect(registradoEn).toBeGreaterThanOrEqual(antes - 1000);
    expect(registradoEn).toBeLessThanOrEqual(Date.now() + 1000);
    expect(respuesta.body.dia).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('ignora cualquier fecha que el cliente intente enviar', async () => {
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/recepciones')
      .set('Authorization', sesion.auth)
      .send({
        ...recepcionValida,
        registradoEn: '2020-01-01T00:00:00.000Z',
        dia: '2020-01-01',
      });

    expect(respuesta.status).toBe(201);
    expect(new Date(respuesta.body.registradoEn).getFullYear()).toBe(new Date().getFullYear());
    expect(respuesta.body.dia).not.toBe('2020-01-01');
  });

  it('marca fuera de rango una temperatura mayor a 5 °C', async () => {
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/recepciones')
      .set('Authorization', sesion.auth)
      .send({ ...recepcionValida, temperatura: 8.2, fotos: [EVIDENCIA] });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.dentroRango).toBe(false);
    expect(respuesta.body.desviaciones[0]).toMatch(/Temperatura fuera del rango/);
  });

  it('aplica el rango de pH del pollo cuando el tipo de carne es pollo', async () => {
    const { sesion } = await crearSesionPuesto(1);

    const pollo = await request(app)
      .post('/api/recepciones')
      .set('Authorization', sesion.auth)
      .send({ ...recepcionValida, tipoCarne: 'pollo', ph: 6.0 });
    expect(pollo.status).toBe(201);
    expect(pollo.body.dentroRango).toBe(true);

    const res = await request(app)
      .post('/api/recepciones')
      .set('Authorization', sesion.auth)
      .send({ ...recepcionValida, tipoCarne: 'res', ph: 6.0, fotos: [EVIDENCIA] });
    expect(res.body.dentroRango).toBe(false);
  });

  it('exige el motivo cuando la carne es rechazada', async () => {
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/recepciones')
      .set('Authorization', sesion.auth)
      .send({ ...recepcionValida, resultado: 'rechazado', fotos: [EVIDENCIA] });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalle).toHaveProperty('motivoRechazo');
  });

  it('exige fotografía cuando la carne no cumple', async () => {
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/recepciones')
      .set('Authorization', sesion.auth)
      .send({
        ...recepcionValida,
        organolepticas: { color: false, olor: true, textura: true, grasa: true },
        fotos: [],
      });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.mensaje).toMatch(/fotografía/i);
  });

  it('acepta el rechazo completo con motivo y evidencia', async () => {
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/recepciones')
      .set('Authorization', sesion.auth)
      .send({
        ...recepcionValida,
        resultado: 'rechazado',
        motivoRechazo: 'Olor no característico y temperatura elevada',
        temperatura: 9,
        organolepticas: { color: true, olor: false, textura: true, grasa: true },
        fotos: [EVIDENCIA],
      });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.resultado).toBe('rechazado');
    expect(respuesta.body.dentroRango).toBe(false);
    expect(respuesta.body.desviaciones.join(' ')).toMatch(/organolépticas/i);
  });

  it('exige la firma del responsable', async () => {
    const { sesion } = await crearSesionPuesto(1);
    const { firma: _firma, ...sinFirma } = recepcionValida;

    const respuesta = await request(app)
      .post('/api/recepciones')
      .set('Authorization', sesion.auth)
      .send(sinFirma);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalle).toHaveProperty('firma');
  });

  it('un supervisor no registra controles en nombre del puesto', async () => {
    await crearSesionPuesto(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .post('/api/recepciones')
      .set('Authorization', supervisor.auth)
      .send(recepcionValida);

    expect(respuesta.status).toBe(403);
  });
});

describe('GET /api/recepciones', () => {
  it('el vendedor solo ve las recepciones de su propio puesto', async () => {
    const puesto1 = await crearSesionPuesto(1);
    const puesto2 = await crearSesionPuesto(2);

    await request(app)
      .post('/api/recepciones')
      .set('Authorization', puesto1.sesion.auth)
      .send(recepcionValida);
    await request(app)
      .post('/api/recepciones')
      .set('Authorization', puesto2.sesion.auth)
      .send({ ...recepcionValida, proveedor: 'Otro proveedor' });

    const respuesta = await request(app)
      .get('/api/recepciones')
      .set('Authorization', puesto1.sesion.auth);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toHaveLength(1);
    expect(respuesta.body.data[0].puestoId).toBe(String(puesto1.puesto._id));
  });

  it('no puede consultar otro puesto ni indicándolo por parámetro', async () => {
    const puesto1 = await crearSesionPuesto(1);
    const puesto2 = await crearSesionPuesto(2);

    const respuesta = await request(app)
      .get('/api/recepciones')
      .query({ puestoId: String(puesto2.puesto._id) })
      .set('Authorization', puesto1.sesion.auth);

    expect(respuesta.status).toBe(403);
  });

  it('el supervisor ve las recepciones de todos los puestos', async () => {
    const puesto1 = await crearSesionPuesto(1);
    const puesto2 = await crearSesionPuesto(2);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    await request(app)
      .post('/api/recepciones')
      .set('Authorization', puesto1.sesion.auth)
      .send(recepcionValida);
    await request(app)
      .post('/api/recepciones')
      .set('Authorization', puesto2.sesion.auth)
      .send(recepcionValida);

    const respuesta = await request(app)
      .get('/api/recepciones')
      .set('Authorization', supervisor.auth);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toHaveLength(2);
    expect(respuesta.body.meta.total).toBe(2);
  });

  it('filtra por resultado', async () => {
    const { sesion } = await crearSesionPuesto(1);
    await request(app)
      .post('/api/recepciones')
      .set('Authorization', sesion.auth)
      .send(recepcionValida);
    await request(app)
      .post('/api/recepciones')
      .set('Authorization', sesion.auth)
      .send({
        ...recepcionValida,
        resultado: 'rechazado',
        motivoRechazo: 'Carne en mal estado',
        fotos: [EVIDENCIA],
      });

    const respuesta = await request(app)
      .get('/api/recepciones')
      .query({ resultado: 'rechazado' })
      .set('Authorization', sesion.auth);

    expect(respuesta.body.data).toHaveLength(1);
    expect(respuesta.body.data[0].motivoRechazo).toBe('Carne en mal estado');
  });
});
