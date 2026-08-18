import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { cerrarBaseDePrueba, conectarBaseDePrueba, limpiarBaseDePrueba } from '../helpers/db.js';
import {
  PASSWORD_PRUEBA,
  app,
  crearPuesto,
  crearSesion,
  crearSesionPuesto,
  crearUsuario,
} from '../helpers/factories.js';

beforeAll(async () => {
  await conectarBaseDePrueba();
});

afterAll(async () => {
  await cerrarBaseDePrueba();
});

beforeEach(async () => {
  await limpiarBaseDePrueba();
});

describe('GET /health', () => {
  it('responde que el servicio está en pie', async () => {
    const respuesta = await request(app).get('/health');
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.estado).toBe('ok');
  });
});

describe('POST /api/auth/login', () => {
  it('devuelve un token y el perfil con credenciales correctas', async () => {
    const puesto = await crearPuesto(7);
    await crearUsuario({
      rol: 'puesto',
      usuario: 'puesto7',
      nombre: 'Juan Pérez',
      puestoId: String(puesto._id),
    });

    const respuesta = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'puesto7', password: PASSWORD_PRUEBA });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.token).toEqual(expect.any(String));
    expect(respuesta.body.usuario).toMatchObject({
      nombre: 'Juan Pérez',
      usuario: 'puesto7',
      rol: 'puesto',
    });
    expect(respuesta.body.usuario.puesto).toMatchObject({ numero: 7 });
  });

  it('nunca devuelve el hash de la contraseña', async () => {
    await crearUsuario({ rol: 'supervisor', usuario: 'supervisora' });
    const respuesta = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'supervisora', password: PASSWORD_PRUEBA });

    expect(respuesta.status).toBe(200);
    expect(JSON.stringify(respuesta.body)).not.toContain('passwordHash');
  });

  it('acepta el usuario sin distinguir mayúsculas', async () => {
    await crearUsuario({ rol: 'supervisor', usuario: 'supervisora' });
    const respuesta = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'SuperVisorA', password: PASSWORD_PRUEBA });

    expect(respuesta.status).toBe(200);
  });

  it('rechaza una contraseña incorrecta sin revelar si el usuario existe', async () => {
    await crearUsuario({ rol: 'supervisor', usuario: 'supervisora' });

    const conClaveMala = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'supervisora', password: 'incorrecta' });
    const usuarioInexistente = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'noexiste', password: 'incorrecta' });

    expect(conClaveMala.status).toBe(401);
    expect(usuarioInexistente.status).toBe(401);
    expect(conClaveMala.body.error.mensaje).toBe(usuarioInexistente.body.error.mensaje);
  });

  it('rechaza a un usuario desactivado', async () => {
    await crearUsuario({ rol: 'supervisor', usuario: 'inactiva', activo: false });
    const respuesta = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'inactiva', password: PASSWORD_PRUEBA });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.mensaje).toMatch(/desactivado/i);
  });

  it('valida los datos enviados', async () => {
    const respuesta = await request(app).post('/api/auth/login').send({ usuario: 'ab' });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalle).toHaveProperty('usuario');
    expect(respuesta.body.error.detalle).toHaveProperty('password');
  });
});

describe('GET /api/auth/yo', () => {
  it('devuelve el perfil del usuario autenticado', async () => {
    const { sesion, puesto } = await crearSesionPuesto(3);

    const respuesta = await request(app).get('/api/auth/yo').set('Authorization', sesion.auth);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.rol).toBe('puesto');
    expect(respuesta.body.puestoId).toBe(String(puesto._id));
  });

  it('rechaza la petición sin token', async () => {
    const respuesta = await request(app).get('/api/auth/yo');
    expect(respuesta.status).toBe(401);
  });

  it('rechaza un token inventado', async () => {
    const respuesta = await request(app)
      .get('/api/auth/yo')
      .set('Authorization', 'Bearer token.falso.aqui');
    expect(respuesta.status).toBe(401);
  });
});

describe('POST /api/auth/cambiar-password', () => {
  it('permite cambiar la contraseña y volver a ingresar con la nueva', async () => {
    const sesion = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const cambio = await request(app)
      .post('/api/auth/cambiar-password')
      .set('Authorization', sesion.auth)
      .send({ passwordActual: PASSWORD_PRUEBA, passwordNueva: 'nuevaClave99' });
    expect(cambio.status).toBe(200);

    const conNueva = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'supervisora', password: 'nuevaClave99' });
    expect(conNueva.status).toBe(200);

    const conAnterior = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'supervisora', password: PASSWORD_PRUEBA });
    expect(conAnterior.status).toBe(401);
  });

  it('rechaza el cambio si la contraseña actual no coincide', async () => {
    const sesion = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const respuesta = await request(app)
      .post('/api/auth/cambiar-password')
      .set('Authorization', sesion.auth)
      .send({ passwordActual: 'equivocada', passwordNueva: 'nuevaClave99' });

    expect(respuesta.status).toBe(400);
  });

  it('exige que la nueva contraseña sea distinta', async () => {
    const sesion = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const respuesta = await request(app)
      .post('/api/auth/cambiar-password')
      .set('Authorization', sesion.auth)
      .send({ passwordActual: PASSWORD_PRUEBA, passwordNueva: PASSWORD_PRUEBA });

    expect(respuesta.status).toBe(400);
  });
});

describe('reglas del modelo de usuario', () => {
  it('un usuario de puesto no puede existir sin puesto asignado', async () => {
    await expect(crearUsuario({ rol: 'puesto', usuario: 'sinpuesto' })).rejects.toThrow(
      /debe estar asociado a un puesto/i,
    );
  });

  it('un supervisor nunca queda asociado a un puesto', async () => {
    const puesto = await crearPuesto(2);
    const supervisor = await crearUsuario({
      rol: 'supervisor',
      usuario: 'supervisor2',
      puestoId: String(puesto._id),
    });
    expect(supervisor.puestoId).toBeNull();
  });

  it('no admite dos usuarios con el mismo nombre de usuario', async () => {
    await crearUsuario({ rol: 'supervisor', usuario: 'repetida' });
    await expect(crearUsuario({ rol: 'supervisor', usuario: 'repetida' })).rejects.toThrow();
  });
});
