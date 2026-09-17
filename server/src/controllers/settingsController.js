const { z } = require('zod');
const { query } = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');
const { recordAudit } = require('../utils/audit');
const { COMPANY_SETTINGS_COLS } = require('../dbColumns');

const SETTINGS_FIELD_TO_COLUMN = {
  companyName: 'company_name',
  logoUrl: 'logo_url',
  address: 'address',
  currency: 'currency',
  fiscalYearStart: 'fiscal_year_start',
  sessionTimeoutMinutes: 'session_timeout_minutes',
  passwordMinLength: 'password_min_length',
  maxFailedLoginAttempts: 'max_failed_login_attempts',
  lockoutMinutes: 'lockout_minutes',
  twoFactorRequired: 'two_factor_required',
};

async function getOrCreateSettings() {
  await query(`INSERT INTO company_settings (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING`);
  const { rows } = await query(`SELECT ${COMPANY_SETTINGS_COLS} FROM company_settings WHERE id = 'singleton'`);
  return rows[0];
}

const getSettings = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings();
  res.json({ settings });
});

const updateSchema = z.object({
  companyName: z.string().min(1).optional(),
  logoUrl: z.string().optional().nullable(),
  address: z.string().optional(),
  currency: z.string().optional(),
  fiscalYearStart: z.string().optional(),
  sessionTimeoutMinutes: z.number().int().min(5).max(240).optional(),
  passwordMinLength: z.number().int().min(6).max(32).optional(),
  maxFailedLoginAttempts: z.number().int().min(3).max(10).optional(),
  lockoutMinutes: z.number().int().min(5).max(120).optional(),
  twoFactorRequired: z.boolean().optional(),
});

const updateSettings = asyncHandler(async (req, res) => {
  const data = updateSchema.parse(req.body);
  const previous = await getOrCreateSettings();

  const setClauses = [];
  const params = [];
  for (const [key, value] of Object.entries(data)) {
    const column = SETTINGS_FIELD_TO_COLUMN[key];
    if (!column) continue;
    params.push(value);
    setClauses.push(`${column} = $${params.length}`);
  }

  let settings;
  if (setClauses.length > 0) {
    const { rows } = await query(`UPDATE company_settings SET ${setClauses.join(', ')} WHERE id = 'singleton' RETURNING ${COMPANY_SETTINGS_COLS}`, params);
    settings = rows[0];
  } else {
    settings = previous;
  }

  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'SETTINGS_CHANGED', entityType: 'CompanySettings', entityId: 'singleton', previousValue: previous, newValue: data });
  res.json({ settings });
});

module.exports = { getSettings, updateSettings };
