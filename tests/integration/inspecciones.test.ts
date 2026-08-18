import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PUNTOS_INSPECCION_MERCADO, PUNTOS_INSPECCION_PUESTO } from '../../src/domain/constants.js';
import { invalidarConfiguracion } from '../../src/services/configuracion.service.js';
import { cerrarBaseDePrueba, conectarBaseDePrueba, limpiarBaseDePrueba } from '../helpers/db.js';
import { app, crearSesion, crearSesionPuesto } from '../helpers/factories.js';

const EVIDENCIA = { url: 'https://res.cloudinary.com/demo/image/upload/x.jpg', publicId: 'demo/x' };

const checklistMercado = (cumple = true) =>
  PUNTOS_INSPECCION_MERCADO.map((nombre) => ({ nombre, cumple }));
const checklistPuesto = (cumple = true) =>
  PUNTOS_INSPECCION_PUESTO.map((nombre) => ({ nombre, cumple }));

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

describe('POST /api/inspecciones — mercado', () => {
  it('registra la inspección con fecha, hora y supervisor automáticos', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .post('/api/inspecciones')
      .set('Authorization', supervisor.auth)
      .send({ tipo: 'mercado', items: checklistMercado(), fotos: [] });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.inspeccion.cumple).toBe(true);
    expect(respuesta.body.inspeccion.supervisorId).toBe(supervisor.usuarioId);
    expect(respuesta.body.inspeccion.registradoEn).toBeTruthy();
    expect(respuesta.body.noConformidades).toHaveLength(0);
  });

  it('rechaza una inspección incompleta', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .post('/api/inspecciones')
      .set('Authorization', supervisor.auth)
      .send({ tipo: 'mercado', items: checklistMercado().slice(0, 3), fotos: [] });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalle.faltantes).toHaveLength(7);
  });

  it('un usuario de puesto no puede inspeccionar', async () => {
    const { sesion } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/inspecciones')
      .set('Authorization', sesion.auth)
      .send({ tipo: 'mercado', items: checklistMercado(), fotos: [] });

    expect(respuesta.status).toBe(403);
  });

  it('el coordinador HACCP tiene el mismo acceso que el supervisor', async () => {
    const coordinador = await crearSesion({ rol: 'coordinador', usuario: 'coordinador' });

    const respuesta = await request(app)
      .post('/api/inspecciones')
      .set('Authorization', coordinador.auth)
      .send({ tipo: 'mercado', items: checklistMercado(), fotos: [] });

    expect(respuesta.status).toBe(201);
  });
});

describe('POST /api/inspecciones — puesto y generación automática de no conformidades (R7)', () => {
  it('genera una no conformidad por cada punto marcado como no cumple', async () => {
    const { puesto } = await crearSesionPuesto(7);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const items = checklistPuesto();
    items[0] = {
      nombre: 'Limpieza — mesones',
      cumple: false,
      comentario: 'Mesón con restos',
    } as never;
    items[5] = { nombre: 'Utensilios — cuchillos', cumple: false } as never;

    const respuesta = await request(app)
      .post('/api/inspecciones')
      .set('Authorization', supervisor.auth)
      .send({
        tipo: 'puesto',
        puestoId: String(puesto._id),
        items,
        fotos: [EVIDENCIA],
        observaciones: 'Revisar al día siguiente',
      });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.inspeccion.cumple).toBe(false);
    expect(respuesta.body.noConformidades).toHaveLength(2);

    const [primera, segunda] = respuesta.body.noConformidades;
    // Llega con los datos del puesto ya cargados: nada se escribe dos veces.
    expect(primera.puestoId).toBe(String(puesto._id));
    expect(primera.hallazgo).toBe('Limpieza — mesones: Mesón con restos');
    expect(primera.estado).toBe('pendiente');
    expect(primera.evidencia).toHaveLength(1);
    expect(primera.origen).toBe('Inspección de puesto');
    expect(segunda.hallazgo).toBe('Utensilios — cuchillos');
    expect(segunda.numero).toBe(primera.numero + 1);
  });

  it('numera las no conformidades de forma correlativa y sin repetir', async () => {
    const { puesto } = await crearSesionPuesto(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const conUnFallo = () => {
      const items = checklistPuesto();
      items[2] = { nombre: 'Limpieza — piso', cumple: false } as never;
      return { tipo: 'puesto', puestoId: String(puesto._id), items, fotos: [] };
    };

    const a = await request(app)
      .post('/api/inspecciones')
      .set('Authorization', supervisor.auth)
      .send(conUnFallo());
    const b = await request(app)
      .post('/api/inspecciones')
      .set('Authorization', supervisor.auth)
      .send(conUnFallo());

    expect(a.body.noConformidades[0].numero).toBe(1);
    expect(b.body.noConformidades[0].numero).toBe(2);
  });

  it('una medición fuera de rango también genera no conformidad', async () => {
    const { puesto } = await crearSesionPuesto(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .post('/api/inspecciones')
      .set('Authorization', supervisor.auth)
      .send({
        tipo: 'puesto',
        puestoId: String(puesto._id),
        items: checklistPuesto(),
        medicion: { temperatura: 9.5, ph: 5.6, tipoCarne: 'res' },
        fotos: [],
      });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.inspeccion.medicion.dentroRango).toBe(false);
    expect(respuesta.body.inspeccion.cumple).toBe(false);
    expect(respuesta.body.noConformidades).toHaveLength(1);
    expect(respuesta.body.noConformidades[0].hallazgo).toMatch(/Temperatura fuera del rango/);
  });

  it('una medición dentro de rango no genera nada', async () => {
    const { puesto } = await crearSesionPuesto(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .post('/api/inspecciones')
      .set('Authorization', supervisor.auth)
      .send({
        tipo: 'puesto',
        puestoId: String(puesto._id),
        items: checklistPuesto(),
        medicion: { temperatura: 4, ph: 5.6, tipoCarne: 'res' },
        fotos: [],
      });

    expect(respuesta.body.inspeccion.cumple).toBe(true);
    expect(respuesta.body.noConformidades).toHaveLength(0);
  });

  it('exige el puesto cuando la inspección es de puesto', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .post('/api/inspecciones')
      .set('Authorization', supervisor.auth)
      .send({ tipo: 'puesto', items: checklistPuesto(), fotos: [] });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalle).toHaveProperty('puestoId');
  });

  it('avisa al puesto de los incumplimientos detectados', async () => {
    const { puesto, sesion } = await crearSesionPuesto(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const items = checklistPuesto();
    items[3] = { nombre: 'Limpieza — pared', cumple: false } as never;
    await request(app)
      .post('/api/inspecciones')
      .set('Authorization', supervisor.auth)
      .send({ tipo: 'puesto', puestoId: String(puesto._id), items, fotos: [] });

    const notificaciones = await request(app)
      .get('/api/notificaciones')
      .set('Authorization', sesion.auth);

    expect(notificaciones.status).toBe(200);
    expect(notificaciones.body.data).toHaveLength(1);
    expect(notificaciones.body.data[0].tipo).toBe('accion_correctiva');
  });
});

describe('seguimiento de la acción correctiva', () => {
  async function inspeccionConHallazgo() {
    const { puesto, sesion } = await crearSesionPuesto(3);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const items = checklistPuesto();
    items[2] = { nombre: 'Limpieza — piso', cumple: false, comentario: 'Piso sucio' } as never;

    const respuesta = await request(app)
      .post('/api/inspecciones')
      .set('Authorization', supervisor.auth)
      .send({ tipo: 'puesto', puestoId: String(puesto._id), items, fotos: [] });

    return {
      puesto,
      sesionPuesto: sesion,
      supervisor,
      noConformidad: respuesta.body.noConformidades[0],
    };
  }

  it('recorre el ciclo completo hasta el cierre verificado', async () => {
    const { supervisor, noConformidad } = await inspeccionConHallazgo();

    const enProceso = await request(app)
      .patch(`/api/no-conformidades/${noConformidad.id}`)
      .set('Authorization', supervisor.auth)
      .send({
        accionCorrectiva: 'Limpieza profunda del piso',
        responsable: 'Vendedor del puesto 3',
        fechaLimite: '2030-01-10',
        estado: 'en_proceso',
      });

    expect(enProceso.status).toBe(200);
    expect(enProceso.body.estado).toBe('en_proceso');
    expect(enProceso.body.estadoActual).toBe('en_proceso');

    const cerrada = await request(app)
      .post(`/api/no-conformidades/${noConformidad.id}/cerrar`)
      .set('Authorization', supervisor.auth)
      .send({ comentarioCierre: 'Verificado en sitio', evidenciaCierre: [EVIDENCIA] });

    expect(cerrada.status).toBe(200);
    expect(cerrada.body.estado).toBe('realizado');
    expect(cerrada.body.verificadaPor).toBe(supervisor.usuarioId);
    expect(cerrada.body.verificadaEn).toBeTruthy();
    expect(cerrada.body.evidenciaCierre).toHaveLength(1);
  });

  it('no permite cerrar sin haber registrado la acción correctiva', async () => {
    const { supervisor, noConformidad } = await inspeccionConHallazgo();

    const respuesta = await request(app)
      .post(`/api/no-conformidades/${noConformidad.id}/cerrar`)
      .set('Authorization', supervisor.auth)
      .send({});

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.mensaje).toMatch(/acción correctiva/i);
  });

  it('no permite modificar ni volver a cerrar una acción ya cerrada', async () => {
    const { supervisor, noConformidad } = await inspeccionConHallazgo();

    await request(app)
      .patch(`/api/no-conformidades/${noConformidad.id}`)
      .set('Authorization', supervisor.auth)
      .send({ accionCorrectiva: 'Limpieza profunda' });
    await request(app)
      .post(`/api/no-conformidades/${noConformidad.id}/cerrar`)
      .set('Authorization', supervisor.auth)
      .send({});

    const reCierre = await request(app)
      .post(`/api/no-conformidades/${noConformidad.id}/cerrar`)
      .set('Authorization', supervisor.auth)
      .send({});
    const cambio = await request(app)
      .patch(`/api/no-conformidades/${noConformidad.id}`)
      .set('Authorization', supervisor.auth)
      .send({ responsable: 'Otro' });

    expect(reCierre.status).toBe(409);
    expect(cambio.status).toBe(409);
  });

  it('marca el plazo vencido sin necesidad de tarea programada', async () => {
    const { supervisor, noConformidad } = await inspeccionConHallazgo();

    await request(app)
      .patch(`/api/no-conformidades/${noConformidad.id}`)
      .set('Authorization', supervisor.auth)
      .send({ accionCorrectiva: 'Limpieza profunda', fechaLimite: '2020-01-01' });

    const consulta = await request(app)
      .get(`/api/no-conformidades/${noConformidad.id}`)
      .set('Authorization', supervisor.auth);

    expect(consulta.body.estado).toBe('pendiente');
    expect(consulta.body.estadoActual).toBe('plazo_vencido');
  });

  it('el puesto ve sus propias no conformidades pero no puede cerrarlas', async () => {
    const { sesionPuesto, noConformidad } = await inspeccionConHallazgo();

    const lista = await request(app)
      .get('/api/no-conformidades')
      .set('Authorization', sesionPuesto.auth);
    expect(lista.body.data).toHaveLength(1);

    const intento = await request(app)
      .post(`/api/no-conformidades/${noConformidad.id}/cerrar`)
      .set('Authorization', sesionPuesto.auth)
      .send({});
    expect(intento.status).toBe(403);
  });

  it('un puesto no ve las no conformidades de otro', async () => {
    const { noConformidad } = await inspeccionConHallazgo();
    const otro = await crearSesionPuesto(9);

    const lista = await request(app)
      .get('/api/no-conformidades')
      .set('Authorization', otro.sesion.auth);
    const detalle = await request(app)
      .get(`/api/no-conformidades/${noConformidad.id}`)
      .set('Authorization', otro.sesion.auth);

    expect(lista.body.data).toHaveLength(0);
    expect(detalle.status).toBe(403);
  });
});
