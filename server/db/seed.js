const bcrypt = require('bcryptjs');
const { query, withTransaction, closePool } = require('../src/db');
const { flattenDefaults } = require('../src/permissions');
const { newId } = require('../src/utils/id');

async function hash(pw) {
  return bcrypt.hash(pw, 12);
}

async function main() {
  // The role -> permission matrix is always (re)synced from code on every
  // boot, before the "already seeded" early return below -- it's a cheap,
  // idempotent set of upserts, and it must run even on a long-lived database
  // so that permission-matrix fixes shipped in code actually take effect
  // without requiring a full data wipe. A Super Admin's own customizations
  // (made via the Users & Roles UI) live in the same table and will be
  // overwritten back to these defaults on deploy -- that's an accepted
  // tradeoff for this demo deployment, not something a real multi-tenant
  // system should do.
  const defaults = flattenDefaults();
  await withTransaction(async (client) => {
    for (const d of defaults) {
      await client.query(
        `INSERT INTO role_permissions (id, role, resource, action, allowed)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (role, resource, action) DO UPDATE SET allowed = EXCLUDED.allowed`,
        [newId(), d.role, d.resource, d.action, d.allowed]
      );
    }
  });

  // Safe to invoke on every boot (see server/package.json "start:prod"):
  // this is a no-op once the demo superadmin exists, so restarts and
  // redeploys never re-run (and crash on) the one-time-only inserts below.
  // If real data already exists, skip straight through instead.
  const alreadySeededRes = await query('SELECT id FROM users WHERE email = $1', ['superadmin@nimbuscorp.com']);
  if (alreadySeededRes.rows.length > 0) {
    console.log('Database already seeded (role permission matrix re-synced).');
    return;
  }

  console.log('Seeding database...');

  // ---- Company settings ----
  await query(
    `INSERT INTO company_settings (id, company_name, address, currency)
     VALUES ('singleton', $1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    ['Nimbus Corporation', '500 Market Street, Suite 900, San Francisco, CA', 'USD']
  );

  // ---- Departments ----
  const departmentNames = [
    { name: 'Executive', description: 'Company leadership' },
    { name: 'Human Resources', description: 'People operations & HR' },
    { name: 'Finance', description: 'Finance & payroll operations' },
    { name: 'Engineering', description: 'Product engineering' },
    { name: 'Sales', description: 'Sales & business development' },
    { name: 'Marketing', description: 'Marketing & communications' },
  ];
  const departments = {};
  for (const d of departmentNames) {
    await query('INSERT INTO departments (id, name, description) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING', [newId(), d.name, d.description]);
    const { rows } = await query('SELECT id FROM departments WHERE name = $1', [d.name]);
    departments[d.name] = rows[0].id;
  }

  // ---- Designations ----
  const designationDefs = [
    ['Chief Executive Officer', 'Executive'],
    ['HR Director', 'Human Resources'],
    ['HR Generalist', 'Human Resources'],
    ['Payroll Manager', 'Finance'],
    ['Financial Analyst', 'Finance'],
    ['Engineering Manager', 'Engineering'],
    ['Senior Software Engineer', 'Engineering'],
    ['Software Engineer', 'Engineering'],
    ['Sales Manager', 'Sales'],
    ['Account Executive', 'Sales'],
    ['Marketing Specialist', 'Marketing'],
  ];
  const designations = {};
  for (const [title, deptName] of designationDefs) {
    await query('INSERT INTO designations (id, title, department_id) VALUES ($1, $2, $3) ON CONFLICT (title, department_id) DO NOTHING', [newId(), title, departments[deptName]]);
    const { rows } = await query('SELECT id FROM designations WHERE title = $1 AND department_id = $2', [title, departments[deptName]]);
    designations[title] = rows[0].id;
  }

  const password = await hash('Password123!');

  const users = [
    {
      employeeCode: 'EMP10001',
      email: 'superadmin@nimbuscorp.com',
      role: 'SUPER_ADMIN',
      firstName: 'Ava',
      lastName: 'Sterling',
      department: 'Executive',
      designation: 'Chief Executive Officer',
      dateOfBirth: '1978-04-12',
      dateOfJoining: '2015-01-05',
      basic: 12000, hra: 4800, conveyance: 800, medical: 1000, specialAllowance: 3000,
      providentFund: 1440, professionalTax: 200, incomeTax: 2500,
      bankAccountNumber: '000123456789', bankName: 'First National Bank', taxId: 'TAX-9001-A',
    },
    {
      employeeCode: 'EMP10002',
      email: 'hradmin@nimbuscorp.com',
      role: 'HR_ADMIN',
      firstName: 'Priya',
      lastName: 'Nair',
      department: 'Human Resources',
      designation: 'HR Director',
      managerEmail: 'superadmin@nimbuscorp.com',
      dateOfBirth: '1985-09-22',
      dateOfJoining: '2017-03-14',
      basic: 7500, hra: 3000, conveyance: 600, medical: 700, specialAllowance: 1500,
      providentFund: 900, professionalTax: 200, incomeTax: 1200,
      bankAccountNumber: '000223456789', bankName: 'First National Bank', taxId: 'TAX-9002-B',
    },
    {
      employeeCode: 'EMP10003',
      email: 'payrolladmin@nimbuscorp.com',
      role: 'PAYROLL_ADMIN',
      firstName: 'Marcus',
      lastName: 'Chen',
      department: 'Finance',
      designation: 'Payroll Manager',
      managerEmail: 'superadmin@nimbuscorp.com',
      dateOfBirth: '1988-01-30',
      dateOfJoining: '2018-06-01',
      basic: 7000, hra: 2800, conveyance: 600, medical: 700, specialAllowance: 1400,
      providentFund: 840, professionalTax: 200, incomeTax: 1100,
      bankAccountNumber: '000323456789', bankName: 'First National Bank', taxId: 'TAX-9003-C',
    },
    {
      employeeCode: 'EMP10004',
      email: 'manager@nimbuscorp.com',
      role: 'MANAGER',
      firstName: 'Diego',
      lastName: 'Alvarez',
      department: 'Engineering',
      designation: 'Engineering Manager',
      managerEmail: 'superadmin@nimbuscorp.com',
      dateOfBirth: '1983-11-08',
      dateOfJoining: '2016-08-19',
      basic: 8200, hra: 3280, conveyance: 600, medical: 700, specialAllowance: 1600,
      providentFund: 984, professionalTax: 200, incomeTax: 1300,
      bankAccountNumber: '000423456789', bankName: 'First National Bank', taxId: 'TAX-9004-D',
    },
    {
      employeeCode: 'EMP10005',
      email: 'employee@nimbuscorp.com',
      role: 'EMPLOYEE',
      firstName: 'Sofia',
      lastName: 'Martins',
      department: 'Engineering',
      designation: 'Software Engineer',
      managerEmail: 'manager@nimbuscorp.com',
      dateOfBirth: '1996-06-17',
      dateOfJoining: '2022-02-21',
      basic: 5200, hra: 2080, conveyance: 500, medical: 500, specialAllowance: 900,
      providentFund: 624, professionalTax: 200, incomeTax: 650,
      bankAccountNumber: '000523456789', bankName: 'First National Bank', taxId: 'TAX-9005-E',
    },
    // Extra employees for realistic dashboard data
    {
      employeeCode: 'EMP10006',
      email: 'noah.kim@nimbuscorp.com',
      role: 'EMPLOYEE',
      firstName: 'Noah',
      lastName: 'Kim',
      department: 'Engineering',
      designation: 'Senior Software Engineer',
      managerEmail: 'manager@nimbuscorp.com',
      dateOfBirth: '1991-03-03',
      dateOfJoining: '2020-05-11',
      basic: 6800, hra: 2720, conveyance: 500, medical: 600, specialAllowance: 1200,
      providentFund: 816, professionalTax: 200, incomeTax: 900,
      bankAccountNumber: '000623456789', bankName: 'First National Bank', taxId: 'TAX-9006-F',
    },
    {
      employeeCode: 'EMP10007',
      email: 'linda.osei@nimbuscorp.com',
      role: 'EMPLOYEE',
      firstName: 'Linda',
      lastName: 'Osei',
      department: 'Sales',
      designation: 'Account Executive',
      managerEmail: 'manager@nimbuscorp.com',
      dateOfBirth: '1994-12-25',
      dateOfJoining: '2021-09-01',
      basic: 4800, hra: 1920, conveyance: 450, medical: 450, specialAllowance: 800,
      providentFund: 576, professionalTax: 200, incomeTax: 550,
      bankAccountNumber: '000723456789', bankName: 'First National Bank', taxId: 'TAX-9007-G',
    },
    {
      employeeCode: 'EMP10008',
      email: 'james.wu@nimbuscorp.com',
      role: 'EMPLOYEE',
      firstName: 'James',
      lastName: 'Wu',
      department: 'Marketing',
      designation: 'Marketing Specialist',
      managerEmail: 'manager@nimbuscorp.com',
      dateOfBirth: '1990-07-14',
      dateOfJoining: '2019-11-04',
      basic: 4600, hra: 1840, conveyance: 450, medical: 450, specialAllowance: 750,
      providentFund: 552, professionalTax: 200, incomeTax: 520,
      bankAccountNumber: '000823456789', bankName: 'First National Bank', taxId: 'TAX-9008-H',
    },
  ];

  const createdUserIds = {};

  for (const u of users) {
    const userId = newId();
    await query(
      `INSERT INTO users (id, employee_code, email, password_hash, role, status, department_id)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6)
       ON CONFLICT (email) DO NOTHING`,
      [userId, u.employeeCode, u.email, password, u.role, departments[u.department]]
    );
    const { rows } = await query('SELECT id FROM users WHERE email = $1', [u.email]);
    createdUserIds[u.email] = rows[0].id;

    await query(
      `INSERT INTO employees (id, user_id, first_name, last_name, phone, address, date_of_birth, date_of_joining, department_id, designation_id, employment_type, status, bank_account_number, bank_name, tax_id, emergency_contact_name, emergency_contact_phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Full-Time', 'ACTIVE', $11, $12, $13, $14, $15)
       ON CONFLICT (user_id) DO NOTHING`,
      [
        newId(),
        rows[0].id,
        u.firstName,
        u.lastName,
        '+1-555-0100',
        '123 Main Street, San Francisco, CA',
        u.dateOfBirth ? new Date(u.dateOfBirth) : null,
        new Date(u.dateOfJoining),
        departments[u.department],
        designations[u.designation],
        u.bankAccountNumber,
        u.bankName,
        u.taxId,
        'Jordan Rivera',
        '+1-555-0199',
      ]
    );
  }

  // Wire up managers now that all users exist.
  for (const u of users) {
    if (u.managerEmail) {
      await query('UPDATE users SET manager_id = $1 WHERE id = $2', [createdUserIds[u.managerEmail], createdUserIds[u.email]]);
    }
  }

  // Department heads
  await query('UPDATE departments SET manager_id = $1 WHERE id = $2', [createdUserIds['hradmin@nimbuscorp.com'], departments['Human Resources']]);
  await query('UPDATE departments SET manager_id = $1 WHERE id = $2', [createdUserIds['payrolladmin@nimbuscorp.com'], departments['Finance']]);
  await query('UPDATE departments SET manager_id = $1 WHERE id = $2', [createdUserIds['manager@nimbuscorp.com'], departments['Engineering']]);

  // ---- Salary structures ----
  const employeeIdByEmail = {};
  for (const u of users) {
    const empRes = await query('SELECT id FROM employees WHERE user_id = $1', [createdUserIds[u.email]]);
    const employeeId = empRes.rows[0].id;
    employeeIdByEmail[u.email] = employeeId;
    const ctc = u.basic + u.hra + u.conveyance + u.medical + u.specialAllowance;
    await query(
      `INSERT INTO salary_structures (id, employee_id, basic, hra, conveyance, medical, special_allowance, provident_fund, professional_tax, income_tax, ctc, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)`,
      [newId(), employeeId, u.basic, u.hra, u.conveyance, u.medical, u.specialAllowance, u.providentFund, u.professionalTax, u.incomeTax, ctc]
    );
  }

  // ---- Leave balances (current year) ----
  const year = new Date().getFullYear();
  const leaveTypes = [
    { type: 'ANNUAL', allocated: 20 },
    { type: 'SICK', allocated: 10 },
    { type: 'CASUAL', allocated: 6 },
  ];
  for (const u of users) {
    for (const lt of leaveTypes) {
      await query('INSERT INTO leave_balances (id, employee_id, leave_type, year, allocated, used) VALUES ($1, $2, $3, $4, $5, 0)', [
        newId(),
        employeeIdByEmail[u.email],
        lt.type,
        year,
        lt.allocated,
      ]);
    }
  }

  // Sample leave requests
  await query(
    `INSERT INTO leave_requests (id, employee_id, leave_type, start_date, end_date, days, reason, status)
     VALUES ($1, $2, 'ANNUAL', $3, $4, 3, 'Family trip', 'PENDING')`,
    [newId(), employeeIdByEmail['employee@nimbuscorp.com'], new Date(new Date().setDate(new Date().getDate() + 10)), new Date(new Date().setDate(new Date().getDate() + 12))]
  );
  await query(
    `INSERT INTO leave_requests (id, employee_id, leave_type, start_date, end_date, days, reason, status, approver_id, approved_at)
     VALUES ($1, $2, 'SICK', $3, $4, 2, 'Flu', 'APPROVED', $5, $6)`,
    [
      newId(),
      employeeIdByEmail['noah.kim@nimbuscorp.com'],
      new Date(new Date().setDate(new Date().getDate() - 3)),
      new Date(new Date().setDate(new Date().getDate() - 2)),
      createdUserIds['manager@nimbuscorp.com'],
      new Date(),
    ]
  );
  await query(
    `INSERT INTO leave_requests (id, employee_id, leave_type, start_date, end_date, days, reason, status)
     VALUES ($1, $2, 'CASUAL', $3, $4, 1, 'Personal errand', 'PENDING')`,
    [newId(), employeeIdByEmail['linda.osei@nimbuscorp.com'], new Date(new Date().setDate(new Date().getDate() + 3)), new Date(new Date().setDate(new Date().getDate() + 3))]
  );

  // ---- Attendance for the last 10 days ----
  const allEmployeeIds = Object.values(employeeIdByEmail);
  for (let dayOffset = 0; dayOffset < 10; dayOffset++) {
    const date = new Date();
    date.setDate(date.getDate() - dayOffset);
    date.setHours(0, 0, 0, 0);
    const dayOfWeek = date.getDay();
    for (const employeeId of allEmployeeIds) {
      let status = 'PRESENT';
      if (dayOfWeek === 0 || dayOfWeek === 6) status = 'WEEKEND';
      else if (Math.random() < 0.06) status = 'ABSENT';
      else if (Math.random() < 0.05) status = 'HALF_DAY';

      const checkInTime = new Date(date);
      checkInTime.setHours(9, Math.floor(Math.random() * 9), 0, 0);
      const checkOutTime = new Date(date);
      checkOutTime.setHours(status === 'HALF_DAY' ? 13 : 18, status === 'HALF_DAY' ? 30 : Math.floor(Math.random() * 9), 0, 0);

      await query(
        `INSERT INTO attendance (id, employee_id, date, status, check_in, check_out, hours_worked)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (employee_id, date) DO NOTHING`,
        [
          newId(),
          employeeId,
          date,
          status,
          status === 'PRESENT' || status === 'HALF_DAY' ? checkInTime.toISOString() : null,
          status === 'PRESENT' || status === 'HALF_DAY' ? checkOutTime.toISOString() : null,
          status === 'PRESENT' ? 8 : status === 'HALF_DAY' ? 4 : 0,
        ]
      );
    }
  }

  // ---- A completed payroll run (last month) + one in-flight run (this month) ----
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const lastPeriod = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

  const structuresRes = await query('SELECT employee_id AS "employeeId", basic, hra, conveyance, medical, special_allowance AS "specialAllowance", other_allowances AS "otherAllowances", provident_fund AS "providentFund", professional_tax AS "professionalTax", income_tax AS "incomeTax", other_deductions AS "otherDeductions" FROM salary_structures WHERE is_active = true');
  const structures = structuresRes.rows;
  let totalGross = 0, totalDeductions = 0, totalNet = 0;

  const completedRunId = newId();
  await query(
    `INSERT INTO payroll_runs (id, period, status, created_by_id, reviewed_by_id, reviewed_at, approved_by_id, approved_at, submitted_at, processed_at, employee_count)
     VALUES ($1, $2, 'COMPLETED', $3, $4, $5, $6, $5, $5, $5, $7)`,
    [completedRunId, lastPeriod, createdUserIds['payrolladmin@nimbuscorp.com'], createdUserIds['payrolladmin@nimbuscorp.com'], new Date(), createdUserIds['superadmin@nimbuscorp.com'], structures.length]
  );

  for (const s of structures) {
    const gross = s.basic + s.hra + s.conveyance + s.medical + s.specialAllowance + s.otherAllowances;
    const deductions = s.providentFund + s.professionalTax + s.incomeTax + s.otherDeductions;
    const net = gross - deductions;
    totalGross += gross;
    totalDeductions += deductions;
    totalNet += net;
    const breakdown = JSON.stringify({
      earnings: { basic: s.basic, hra: s.hra, conveyance: s.conveyance, medical: s.medical, specialAllowance: s.specialAllowance, otherAllowances: s.otherAllowances },
      deductions: { providentFund: s.providentFund, professionalTax: s.professionalTax, incomeTax: s.incomeTax, otherDeductions: s.otherDeductions },
    });
    await query(
      `INSERT INTO payslips (id, payroll_run_id, employee_id, period, gross, deductions, net, breakdown)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [newId(), completedRunId, s.employeeId, lastPeriod, gross, deductions, net, breakdown]
    );
  }
  await query('UPDATE payroll_runs SET total_gross = $1, total_deductions = $2, total_net = $3 WHERE id = $4', [totalGross, totalDeductions, totalNet, completedRunId]);

  const thisMonth = new Date();
  const currentPeriod = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, '0')}`;
  await query(`INSERT INTO payroll_runs (id, period, status, created_by_id) VALUES ($1, $2, 'DRAFT', $3)`, [newId(), currentPeriod, createdUserIds['payrolladmin@nimbuscorp.com']]);

  // ---- Announcements ----
  await query(
    `INSERT INTO announcements (id, title, body, created_by_id, audience)
     VALUES ($1, $2, $3, $4, 'ALL')`,
    [newId(), 'Welcome to PayrollPro', 'Our new Employee Payroll Management System is now live. Explore your dashboard, payslips, and self-service tools.', createdUserIds['superadmin@nimbuscorp.com']]
  );
  await query(
    `INSERT INTO announcements (id, title, body, created_by_id, audience)
     VALUES ($1, $2, $3, $4, 'ALL')`,
    [newId(), 'Quarterly All-Hands Meeting', 'Join us this Friday at 10:00 AM for the quarterly company all-hands meeting in the main auditorium.', createdUserIds['hradmin@nimbuscorp.com']]
  );

  // ---- Sample audit log entries (system bootstrap) ----
  await query(
    `INSERT INTO audit_logs (id, user_id, user_name, action, entity_type, new_value)
     VALUES ($1, $2, $3, 'SYSTEM_SEEDED', 'System', $4)`,
    [newId(), createdUserIds['superadmin@nimbuscorp.com'], 'superadmin@nimbuscorp.com', JSON.stringify({ note: 'Initial demo data seeded.' })]
  );

  console.log('Seed complete.');
  console.log('---------------------------------------------');
  console.log('Demo accounts (all use password: Password123!)');
  console.log('  Super Admin    superadmin@nimbuscorp.com');
  console.log('  HR Admin       hradmin@nimbuscorp.com');
  console.log('  Payroll Admin  payrolladmin@nimbuscorp.com');
  console.log('  Manager        manager@nimbuscorp.com');
  console.log('  Employee       employee@nimbuscorp.com');
  console.log('---------------------------------------------');
}

module.exports = { seed: main };

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await closePool();
    });
}
