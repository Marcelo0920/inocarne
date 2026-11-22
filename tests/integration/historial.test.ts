import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PUNTOS_INSPECCION_PUESTO, PUNTOS_LIMPIEZA } from '../../src/domain/constants.js';
import { zonedTimeKey } from '../../src/domain/time.js';
import { invalidarConfiguracion } from '../../src/services/configuracion.service.js';
import { cerrarBaseDePrueba, conectarBaseDePrueba, limpiarBaseDePrueba } from '../helpers/db.js';
import { app, crearSesion, crearSesionPuesto } from '../helpers/factories.js';

const TZ = 'America/La_Paz';
const EVIDENCIA = { url: 'https://res.cloudinary.com/demo/image/upload/x.jpg', publicId: 'demo/x' };

const checklistLimpieza = (cumple = true) => PUNTOS_LIMPIEZA.map((nombre) => ({ nombre, cumple }));

const recepcion = {
  proveedor: 'Frigorífico Los Andes',
  tipoCarne: 'res' as const,
  cantidad: 45,
  temperatura: 3.8,
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

/** Deja un puesto con una recepción, un control y una limpieza registrados hoy. */
async function puestoConRegistros(numero = 1) {
  const contexto = await crearSesionPuesto(numero);
  const auth = contexto.sesion.auth;

  await request(app).post('/api/recepciones').set('Authorization', auth).send(recepcion);
  await request(app).post('/api/controles').set('Authorization', auth).send({
    tipo: 'exhibicion',
    horaDispositivo: new Date().toISOString(),
    temperatura: 4,
    ph: 5.6,
    tipoCarne: 'res',
  });
  await request(app)
    .post('/api/limpiezas')
    .set('Authorization', auth)
    .send({ turno: 'inicial', items: checklistLimpieza(), fotos: [] });

  return contexto;
}

describe('GET /api/historial — vendedor', () => {
  it('reúne recepción, control y limpieza en una sola lista', async () => {
    const { sesion } = await puestoConRegistros(1);

    const respuesta = await request(app).get('/api/historial').set('Authorization', sesion.auth);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toHaveLength(3);
    expect(respuesta.body.data.map((e: { tipo: string }) => e.tipo).sort()).toEqual([
      'exhibicion',
      'limpieza',
      'recepcion',
    ]);
  });

  it('cada entrada trae lo que la pantalla necesita mostrar', async () => {
    const { sesion, puesto } = await puestoConRegistros(3);

    const respuesta = await request(app).get('/api/historial').set('Authorization', sesion.auth);
    const recepcionEntrada = respuesta.body.data.find(
      (e: { tipo: string }) => e.tipo === 'recepcion',
    );

    // El icono no viaja en la respuesta: la interfaz lo elige según el tipo.
    expect(recepcionEntrada).not.toHaveProperty('icono');
    expect(recepcionEntrada).toMatchObject({
      tipo: 'recepcion',
      titulo: 'Recepción — Aceptada',
      puestoId: String(puesto._id),
      puestoNumero: 3,
      semaforo: 'verde',
      estadoTexto: 'Aceptada',
      usuario: 'puesto3',
    });
    expect(recepcionEntrada.hora).toMatch(/^\d{2}:\d{2}$/);
    expect(recepcionEntrada.dia).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('ordena del registro más reciente al más antiguo', async () => {
    const { sesion } = await puestoConRegistros(1);

    const respuesta = await request(app).get('/api/historial').set('Authorization', sesion.auth);
    const fechas = respuesta.body.data.map((e: { registradoEn: string }) =>
      new Date(e.registradoEn).getTime(),
    );

    expect(fechas).toEqual([...fechas].sort((a, b) => b - a));
  });

  it('filtra por tipo de registro', async () => {
    const { sesion } = await puestoConRegistros(1);

    const respuesta = await request(app)
      .get('/api/historial')
      .query({ tipo: 'limpieza' })
      .set('Authorization', sesion.auth);

    expect(respuesta.body.data).toHaveLength(1);
    expect(respuesta.body.data[0].tipo).toBe('limpieza');
  });

  it('filtra por semáforo', async () => {
    const { sesion } = await crearSesionPuesto(1);

    await request(app).post('/api/controles').set('Authorization', sesion.auth).send({
      tipo: 'exhibicion',
      horaDispositivo: new Date().toISOString(),
      temperatura: 9,
      ph: 5.6,
      tipoCarne: 'res',
    });
    await request(app)
      .post('/api/limpiezas')
      .set('Authorization', sesion.auth)
      .send({ turno: 'inicial', items: checklistLimpieza(), fotos: [] });

    const rojos = await request(app)
      .get('/api/historial')
      .query({ semaforo: 'rojo' })
      .set('Authorization', sesion.auth);

    expect(rojos.body.data).toHaveLength(1);
    expect(rojos.body.data[0].estadoTexto).toBe('Fuera de rango');
  });

  it('solo devuelve los registros de su propio puesto', async () => {
    await puestoConRegistros(1);
    const otro = await crearSesionPuesto(2);

    const respuesta = await request(app)
      .get('/api/historial')
      .set('Authorization', otro.sesion.auth);

    expect(respuesta.body.data).toHaveLength(0);
  });

  it('no puede pedir el historial de otro puesto', async () => {
    const primero = await puestoConRegistros(1);
    const otro = await crearSesionPuesto(2);

    const respuesta = await request(app)
      .get('/api/historial')
      .query({ puestoId: String(otro.puesto._id) })
      .set('Authorization', primero.sesion.auth);

    expect(respuesta.status).toBe(403);
  });

  it('nunca ve inspecciones ni mantenimientos, aunque los pida', async () => {
    const { puesto, sesion } = await puestoConRegistros(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    await request(app)
      .post('/api/inspecciones')
      .set('Authorization', supervisor.auth)
      .send({
        tipo: 'puesto',
        puestoId: String(puesto._id),
        items: PUNTOS_INSPECCION_PUESTO.map((nombre) => ({ nombre, cumple: true })),
        fotos: [],
      });

    const respuesta = await request(app)
      .get('/api/historial')
      .query({ tipo: 'inspeccion' })
      .set('Authorization', sesion.auth);

    expect(respuesta.body.data).toHaveLength(0);
  });
});

describe('GET /api/historial — supervisión', () => {
  it('ve los registros de todos los puestos con su número y usuario', async () => {
    await puestoConRegistros(1);
    await puestoConRegistros(2);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .get('/api/historial')
      .set('Authorization', supervisor.auth);

    expect(respuesta.body.data).toHaveLength(6);
    expect(
      new Set(respuesta.body.data.map((e: { puestoNumero: number }) => e.puestoNumero)),
    ).toEqual(new Set([1, 2]));
    expect(new Set(respuesta.body.data.map((e: { usuario: string }) => e.usuario))).toEqual(
      new Set(['puesto1', 'puesto2']),
    );
  });

  it('incluye inspecciones y mantenimientos', async () => {
    const { puesto, sesion } = await puestoConRegistros(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    await request(app)
      .post('/api/inspecciones')
      .set('Authorization', supervisor.auth)
      .send({
        tipo: 'puesto',
        puestoId: String(puesto._id),
        items: PUNTOS_INSPECCION_PUESTO.map((nombre) => ({ nombre, cumple: true })),
        fotos: [],
      });

    const equipo = await request(app)
      .post('/api/equipos')
      .set('Authorization', sesion.auth)
      .send({ nombre: 'Vitrina refrigerada' });
    await request(app)
      .post(`/api/equipos/${equipo.body.id}/mantenimientos`)
      .set('Authorization', sesion.auth)
      .send({
        fecha: new Date().toISOString().slice(0, 10),
        tipo: 'preventivo',
        descripcion: 'Limpieza de condensador',
      });

    const respuesta = await request(app)
      .get('/api/historial')
      .set('Authorization', supervisor.auth);
    const tipos = respuesta.body.data.map((e: { tipo: string }) => e.tipo);

    expect(tipos).toContain('inspeccion');
    expect(tipos).toContain('mantenimiento');

    const inspeccion = respuesta.body.data.find((e: { tipo: string }) => e.tipo === 'inspeccion');
    expect(inspeccion.usuario).toBe('supervisora');
  });

  it('puede filtrar por un puesto concreto', async () => {
    const primero = await puestoConRegistros(1);
    await puestoConRegistros(2);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .get('/api/historial')
      .query({ puestoId: String(primero.puesto._id) })
      .set('Authorization', supervisor.auth);

    expect(respuesta.body.data).toHaveLength(3);
  });

  it('pagina el resultado combinado', async () => {
    await puestoConRegistros(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .get('/api/historial')
      .query({ page: 1, limit: 2 })
      .set('Authorization', supervisor.auth);

    expect(respuesta.body.data).toHaveLength(2);
    expect(respuesta.body.meta).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
  });

  it('rechaza un rango de fechas invertido', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .get('/api/historial')
      .query({ desde: '2026-08-20', hasta: '2026-08-10' })
      .set('Authorization', supervisor.auth);

    expect(respuesta.status).toBe(400);
  });

  it('un rango antiguo no devuelve los registros de hoy', async () => {
    await puestoConRegistros(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .get('/api/historial')
      .query({ desde: '2020-01-01', hasta: '2020-01-31' })
      .set('Authorization', supervisor.auth);

    expect(respuesta.body.data).toHaveLength(0);
  });
});

describe('hora que muestra el historial', () => {
  it('un control muestra la hora del teléfono, no la del servidor', async () => {
    const { sesion } = await crearSesionPuesto(1);
    const horaDelTelefono = new Date(Date.now() - 2 * 60 * 60 * 1000);

    await request(app).post('/api/controles').set('Authorization', sesion.auth).send({
      tipo: 'refrigeracion',
      temperatura: 3,
      horaDispositivo: horaDelTelefono.toISOString(),
    });

    const respuesta = await request(app).get('/api/historial').set('Authorization', sesion.auth);
    const entrada = respuesta.body.data.find((e: { tipo: string }) => e.tipo === 'refrigeracion');

    expect(entrada.hora).toBe(zonedTimeKey(horaDelTelefono, TZ));
    expect(entrada.registradoEn).toBe(horaDelTelefono.toISOString());
    expect(entrada.estadoTexto).toBe('Dentro de rango');
  });
});
