import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// Access token payload: { sub: userId, role, sessionId }.
// Refresh token payload: { sub: userId, sessionId }.

export function signAccessToken(payload) {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: `${env.accessTokenTtlMin}m` });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

export function signRefreshToken(payload, days) {
  return jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: `${days}d` });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}
