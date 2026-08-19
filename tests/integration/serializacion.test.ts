import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { cerrarBaseDePrueba, conectarBaseDePrueba, limpiarBaseDePrueba } from '../helpers/db.js';
import { app, crearPuesto, crearSesion, crearUsuario } from '../helpers/factories.js';

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
 * La interfaz espera `id` en todas partes. Una consulta `lean()` devuelve `_id`
 * y un documento devuelve `id`: sin normalizar, cada lista rompía los enlaces.
 */
describe('los identificadores salen siempre como id', () => {
  it('en una lista', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    await crearPuesto(1);

    const respuesta = await request(app).get('/api/puestos').set('Authorization', supervisor.auth);

    expect(respuesta.body[0]).toHaveProperty('id');
    expect(respuesta.body[0]).not.toHaveProperty('_id');
    expect(respuesta.body[0].id).toMatch(/^[0-9a-f]{24}$/);
  });

  it('en un alta', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .post('/api/puestos')
      .set('Authorization', supervisor.auth)
      .send({ numero: 7, nombre: 'Puesto 7' });

    expect(respuesta.body).toHaveProperty('id');
    expect(respuesta.body).not.toHaveProperty('_id');
  });

  it('también en los documentos poblados, que es donde se rompía el vínculo', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const puesto = await crearPuesto(1);
    await crearUsuario({ rol: 'puesto', usuario: 'puesto1', puestoId: String(puesto._id) });

    const respuesta = await request(app).get('/api/usuarios').set('Authorization', supervisor.auth);
    const vendedor = respuesta.body.find((u: { rol: string }) => u.rol === 'puesto');

    expect(vendedor.id).toMatch(/^[0-9a-f]{24}$/);
    expect(vendedor.puestoId).toHaveProperty('id', String(puesto._id));
    expect(vendedor.puestoId).not.toHaveProperty('_id');
  });

  it('dentro de un listado paginado', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const puesto = await crearPuesto(1);
    await request(app)
      .post('/api/no-conformidades')
      .set('Authorization', supervisor.auth)
      .send({ puestoId: String(puesto._id), hallazgo: 'Piso sucio' });

    const respuesta = await request(app)
      .get('/api/no-conformidades')
      .set('Authorization', supervisor.auth);

    expect(respuesta.body.data[0]).toHaveProperty('id');
    expect(respuesta.body.data[0]).not.toHaveProperty('_id');
    expect(respuesta.body.data[0].puestoId).toHaveProperty('id');
  });

  it('no altera los identificadores que ya son texto', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const puesto = await crearPuesto(3);

    const respuesta = await request(app)
      .get(`/api/puestos/${String(puesto._id)}`)
      .set('Authorization', supervisor.auth);

    expect(respuesta.body.id).toBe(String(puesto._id));
    expect(respuesta.body.numero).toBe(3);
  });
});
