const request = require('supertest');
const { app } = require('../../src/app');
const { closePool } = require('../../src/db');
const { createFixtureSet } = require('../helpers/fixtures');
const { bearer, loginAs } = require('../helpers/api');

describe('Pagination (opt-in via ?page=...)', () => {
  const prefix = 'pagination-it';

  it('returns the full employees list, with no pagination metadata, when page/pageSize are omitted', async () => {
    await createFixtureSet(`${prefix}-full`);
    const fixtures = await createFixtureSet(`${prefix}-full2`);
    const hrToken = await loginAs(fixtures.hrAdmin.email);

    const res = await request(app).get('/api/employees').set(bearer(hrToken));
    expect(res.status).toBe(200);
    expect(res.body.total).toBeUndefined();
    expect(res.body.page).toBeUndefined();
    expect(res.body.employees.length).toBeGreaterThanOrEqual(14);
  });

  it('paginates the employees list into non-overlapping pages when page/pageSize are provided', async () => {
    const fixtures = await createFixtureSet(`${prefix}-slice`);
    const hrToken = await loginAs(fixtures.hrAdmin.email);

    const full = await request(app).get('/api/employees').set(bearer(hrToken));
    const total = full.body.employees.length;

    const pageOne = await request(app).get('/api/employees?page=1&pageSize=2').set(bearer(hrToken));
    expect(pageOne.status).toBe(200);
    expect(pageOne.body.employees).toHaveLength(2);
    expect(pageOne.body.page).toBe(1);
    expect(pageOne.body.pageSize).toBe(2);
    expect(pageOne.body.total).toBe(total);

    const pageTwo = await request(app).get('/api/employees?page=2&pageSize=2').set(bearer(hrToken));
    expect(pageTwo.status).toBe(200);
    expect(pageTwo.body.employees).toHaveLength(2);

    const idsOne = pageOne.body.employees.map((e) => e.id);
    const idsTwo = pageTwo.body.employees.map((e) => e.id);
    expect(idsOne.some((id) => idsTwo.includes(id))).toBe(false);
  });

  it('paginates the users list the same way', async () => {
    const fixtures = await createFixtureSet(`${prefix}-users`);
    const superToken = await loginAs(fixtures.superAdmin.email);

    const unpaginated = await request(app).get('/api/users').set(bearer(superToken));
    expect(unpaginated.body.total).toBeUndefined();

    const paginated = await request(app).get('/api/users?page=1&pageSize=3').set(bearer(superToken));
    expect(paginated.status).toBe(200);
    expect(paginated.body.users).toHaveLength(3);
    expect(paginated.body.total).toBeGreaterThanOrEqual(7);
  });

  it('caps pageSize at the maximum allowed value', async () => {
    const fixtures = await createFixtureSet(`${prefix}-cap`);
    const hrToken = await loginAs(fixtures.hrAdmin.email);

    const res = await request(app).get('/api/employees?page=1&pageSize=999999').set(bearer(hrToken));
    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(200);
  });
});

afterAll(async () => {
  await closePool();
});
