const { z } = require('zod');
const { query } = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');
const { recordAudit } = require('../utils/audit');
const { COMPANY_SETTINGS_COLS, PAYROLL_RUN_COLS } = require('../dbColumns');

async function getOrCreateSettings() {
  await query(`INSERT INTO company_settings (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING`);
  const { rows } = await query(`SELECT ${COMPANY_SETTINGS_COLS} FROM company_settings WHERE id = 'singleton'`);
  return rows[0];
}

const getTaxSettings = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings();
  const { rows } = await query(`SELECT ${PAYROLL_RUN_COLS} FROM payroll_runs WHERE status = 'COMPLETED' ORDER BY created_at DESC LIMIT 12`);
  res.json({
    rates: {
      providentFundRate: settings.defaultProvidentFundRate,
      professionalTax: settings.defaultProfessionalTax,
      incomeTaxRate: settings.defaultIncomeTaxRate,
    },
    statutoryDeductionHistory: rows.map((r) => ({ period: r.period, totalDeductions: r.totalDeductions })),
  });
});

const updateSchema = z.object({
  providentFundRate: z.number().min(0).max(100).optional(),
  professionalTax: z.number().min(0).optional(),
  incomeTaxRate: z.number().min(0).max(100).optional(),
});

const updateTaxSettings = asyncHandler(async (req, res) => {
  const data = updateSchema.parse(req.body);
  await getOrCreateSettings();

  const setClauses = [];
  const params = [];
  if (data.providentFundRate !== undefined) {
    params.push(data.providentFundRate);
    setClauses.push(`default_provident_fund_rate = $${params.length}`);
  }
  if (data.professionalTax !== undefined) {
    params.push(data.professionalTax);
    setClauses.push(`default_professional_tax = $${params.length}`);
  }
  if (data.incomeTaxRate !== undefined) {
    params.push(data.incomeTaxRate);
    setClauses.push(`default_income_tax_rate = $${params.length}`);
  }

  let settings;
  if (setClauses.length > 0) {
    const { rows } = await query(`UPDATE company_settings SET ${setClauses.join(', ')} WHERE id = 'singleton' RETURNING ${COMPANY_SETTINGS_COLS}`, params);
    settings = rows[0];
  } else {
    settings = await getOrCreateSettings();
  }

  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'SETTINGS_CHANGED', entityType: 'TaxCompliance', newValue: data });
  res.json({ settings });
});

module.exports = { getTaxSettings, updateTaxSettings };
