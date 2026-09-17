const request = require('supertest');
const { app } = require('../../src/app');
const { PASSWORD } = require('./fixtures');

/** Logs in as the given user and returns the access token (throws with a readable message on failure). */
async function loginAs(email, password = PASSWORD) {
  const res = await request(app).post('/api/auth/login').send({ identifier: email, password });
  if (res.status !== 200 || !res.body.accessToken) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken;
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = { loginAs, bearer };
