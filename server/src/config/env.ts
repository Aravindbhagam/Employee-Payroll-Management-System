import dotenv from 'dotenv';
dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// CLIENT_ORIGIN accepts a comma-separated list so the same deployment can
// allow both a local dev origin and a deployed frontend (e.g. GitHub Pages).
const clientOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const env = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  clientOrigins,
  jwtAccessSecret: required('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  accessTokenTtlMin: parseInt(process.env.ACCESS_TOKEN_TTL_MIN || '15', 10),
  refreshTokenTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10),
  refreshTokenTtlDaysRemember: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS_REMEMBER || '30', 10),
};
