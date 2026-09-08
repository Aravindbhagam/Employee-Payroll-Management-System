import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { RoleName } from '../types/enums';

export interface AccessTokenPayload {
  sub: string;
  role: RoleName;
  sessionId: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: `${env.accessTokenTtlMin}m` });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
}

export function signRefreshToken(payload: RefreshTokenPayload, days: number): string {
  return jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: `${days}d` });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.jwtRefreshSecret) as RefreshTokenPayload;
}
