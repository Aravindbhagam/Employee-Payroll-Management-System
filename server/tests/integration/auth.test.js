import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';
import { createFixtureSet, PASSWORD } from '../helpers/fixtures.js';
import { bearer, loginAs } from '../helpers/api.js';

describe('auth', () => {
  const prefix = 'auth-it';

  it('logs in successfully with correct credentials and returns an access token plus a refresh cookie', async () => {
    const fixtures = await createFixtureSet(prefix);
    const res = await request(app).post('/api/auth/login').send({ identifier: fixtures.employee.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe(fixtures.employee.email);
    expect(res.body.user.role).toBe('EMPLOYEE');
    expect(res.headers['set-cookie']?.[0]).toMatch(/refreshToken=/);
  });

  it('rejects an unknown identifier with a generic error (no user enumeration)', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: 'nobody@test.local', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials.');
  });

  it('rejects a wrong password and reports remaining attempts', async () => {
    const fixtures = await createFixtureSet(`${prefix}-wrongpw`);
    const res = await request(app).post('/api/auth/login').send({ identifier: fixtures.employee.email, password: 'WrongPassword1' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials.');
    expect(res.body.attemptsRemaining).toBeGreaterThan(0);
  });

  it('locks the account after repeated failed attempts, then rejects even the correct password', async () => {
    const fixtures = await createFixtureSet(`${prefix}-lockout`);
    let last;
    for (let i = 0; i < 6; i++) {
      last = await request(app).post('/api/auth/login').send({ identifier: fixtures.employee.email, password: 'WrongPassword1' });
    }
    expect(last.status).toBe(423);

    const withCorrectPassword = await request(app).post('/api/auth/login').send({ identifier: fixtures.employee.email, password: PASSWORD });
    expect(withCorrectPassword.status).toBe(423);
  });

  it('accepts login by employee code as well as email', async () => {
    const fixtures = await createFixtureSet(`${prefix}-empcode`);
    const user = await prisma.user.findUnique({ where: { id: fixtures.employee.id } });
    const res = await request(app).post('/api/auth/login').send({ identifier: user.employeeCode, password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it('rejects requests to protected routes with no token', async () => {
    const res = await request(app).get('/api/employees');
    expect(res.status).toBe(401);
  });

  it('rejects requests with a garbage bearer token', async () => {
    const res = await request(app).get('/api/employees').set(bearer('not-a-real-token'));
    expect(res.status).toBe(401);
  });

  it('returns the correct effective permissions for the caller on /api/auth/me', async () => {
    const fixtures = await createFixtureSet(`${prefix}-me`);
    const token = await loginAs(fixtures.employee.email);
    const res = await request(app).get('/api/auth/me').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.user.permissions.USERS).toBeUndefined();
    expect(res.body.user.permissions.LEAVE).toContain('CREATE');
  });

  describe('forgot password', () => {
    it('includes the reset token in the response outside production (dev/test convenience)', async () => {
      const fixtures = await createFixtureSet(`${prefix}-forgot-dev`);
      const res = await request(app).post('/api/auth/forgot-password').send({ identifier: fixtures.employee.email });
      expect(res.status).toBe(200);
      expect(res.body.devResetToken).toBeTruthy();
    });

    it('never includes the reset token in the response in production (security regression guard)', async () => {
      const fixtures = await createFixtureSet(`${prefix}-forgot-prod`);
      const originalNodeEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const res = await request(app).post('/api/auth/forgot-password').send({ identifier: fixtures.employee.email });
        expect(res.status).toBe(200);
        expect(res.body.devResetToken).toBeUndefined();
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('resets the password with a valid token and the old password stops working', async () => {
      const fixtures = await createFixtureSet(`${prefix}-reset`);
      const forgot = await request(app).post('/api/auth/forgot-password').send({ identifier: fixtures.employee.email });
      const token = forgot.body.devResetToken;

      const reset = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'NewPassword456' });
      expect(reset.status).toBe(200);

      const oldPasswordLogin = await request(app).post('/api/auth/login').send({ identifier: fixtures.employee.email, password: PASSWORD });
      expect(oldPasswordLogin.status).toBe(401);

      const newPasswordLogin = await request(app).post('/api/auth/login').send({ identifier: fixtures.employee.email, password: 'NewPassword456' });
      expect(newPasswordLogin.status).toBe(200);
    });

    it('does not reveal whether an account exists for an unknown identifier', async () => {
      const res = await request(app).post('/api/auth/forgot-password').send({ identifier: 'nobody-at-all@test.local' });
      expect(res.status).toBe(200);
      expect(res.body.devResetToken).toBeUndefined();
      expect(res.body.message).toMatch(/if an account exists/i);
    });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
