const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

function signAccessToken(payload) {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: `${env.accessTokenTtlMin}m` });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

function signRefreshToken(payload, days) {
  return jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: `${days}d` });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}

module.exports = { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken };
