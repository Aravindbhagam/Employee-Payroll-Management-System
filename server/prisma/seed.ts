import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { flattenDefaults } from '../src/permissions';

const prisma = new PrismaClient();

async function hash(pw: string) {
  return bcrypt.hash(pw, 12);
}

async function main() {
  console.log('Seeding database...');

  // ---- Company settings ----
  await prisma.companySettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      companyName: 'Nimbus Corporation',
      address: '500 Market Street, Suite 900, San Francisco, CA',
      currency: 'USD',
    },
  });

  // ---- Role permission matrix (defaults, editable later by Super Admin) ----
  const defaults = flattenDefaults();
  await prisma.$transaction(
    defaults.map((d) =>
      prisma.rolePermission.upsert({
        where: { role_resource_action: { role: d.role, resource: d.resource, action: d.action } },
        update: { allowed: d.allowed },
        create: d,
      })
    )
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
  const departments: Record<string, string> = {};
  for (const d of departmentNames) {
    const dept = await prisma.department.upsert({ where: { name: d.name }, update: {}, create: d });
    departments[d.name] = dept.id;
  }

  // ---- Designations ----
  const designationDefs: [string, string][] = [
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
  const designations: Record<string, string> = {};
  for (const [title, deptName] of designationDefs) {
    const designation = await prisma.designation.upsert({
      where: { title_departmentId: { title, departmentId: departments[deptName] } },
      update: {},
      create: { title, departmentId: departments[deptName] },
    });
    designations[title] = designation.id;
  }

  const password = await hash('Password123!');

  type SeedUser = {
    employeeCode: string;
    email: string;
    role: string;
    firstName: string;
    lastName: string;
    department: string;
    designation: string;
    managerEmail?: string;
    dateOfBirth?: string;
    dateOfJoining: string;
    basic: number;
    hra: number;
    conveyance: number;
    medical: number;
    specialAllowance: number;
    providentFund: number;
    professionalTax: number;
    incomeTax: number;
    bankAccountNumber: string;
    bankName: string;
    taxId: string;
  };

  const users: SeedUser[] = [
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

  const createdUserIds: Record<string, string> = {};

  for (const u of users) {
    const created = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        employeeCode: u.employeeCode,
        email: u.email,
        passwordHash: password,
        role: u.role,
        status: 'ACTIVE',
        departmentId: departments[u.department],
        employee: {
          create: {
            firstName: u.firstName,
            lastName: u.lastName,
            phone: '+1-555-0100',
            address: '123 Main Street, San Francisco, CA',
            dateOfBirth: u.dateOfBirth ? new Date(u.dateOfBirth) : undefined,
            dateOfJoining: new Date(u.dateOfJoining),
            departmentId: departments[u.department],
            designationId: designations[u.designation],
            employmentType: 'Full-Time',
            status: 'ACTIVE',
            bankAccountNumber: u.bankAccountNumber,
            bankName: u.bankName,
            taxId: u.taxId,
            emergencyContactName: 'Jordan Rivera',
            emergencyContactPhone: '+1-555-0199',
          },
        },
      },
      include: { employee: true },
    });
    createdUserIds[u.email] = created.id;
  }

  // Wire up managers now that all users exist.
  for (const u of users) {
    if (u.managerEmail) {
      await prisma.user.update({ where: { id: createdUserIds[u.email] }, data: { managerId: createdUserIds[u.managerEmail] } });
    }
  }

  // Department heads
  await prisma.department.update({ where: { id: departments['Human Resources'] }, data: { managerId: createdUserIds['hradmin@nimbuscorp.com'] } });
  await prisma.department.update({ where: { id: departments['Finance'] }, data: { managerId: createdUserIds['payrolladmin@nimbuscorp.com'] } });
  await prisma.department.update({ where: { id: departments['Engineering'] }, data: { managerId: createdUserIds['manager@nimbuscorp.com'] } });

  // ---- Salary structures ----
  const employeeIdByEmail: Record<string, string> = {};
  for (const u of users) {
    const emp = await prisma.employee.findUnique({ where: { userId: createdUserIds[u.email] } });
    employeeIdByEmail[u.email] = emp!.id;
    const ctc = u.basic + u.hra + u.conveyance + u.medical + u.specialAllowance;
    await prisma.salaryStructure.create({
      data: {
        employeeId: emp!.id,
        basic: u.basic,
        hra: u.hra,
        conveyance: u.conveyance,
        medical: u.medical,
        specialAllowance: u.specialAllowance,
        providentFund: u.providentFund,
        professionalTax: u.professionalTax,
        incomeTax: u.incomeTax,
        ctc,
        isActive: true,
      },
    });
  }

  // ---- Leave balances (current year) ----
  const year = new Date().getFullYear();
  const leaveTypes: { type: string; allocated: number }[] = [
    { type: 'ANNUAL', allocated: 20 },
    { type: 'SICK', allocated: 10 },
    { type: 'CASUAL', allocated: 6 },
  ];
  for (const u of users) {
    for (const lt of leaveTypes) {
      await prisma.leaveBalance.create({
        data: { employeeId: employeeIdByEmail[u.email], leaveType: lt.type, year, allocated: lt.allocated, used: 0 },
      });
    }
  }

  // Sample leave requests
  await prisma.leaveRequest.create({
    data: {
      employeeId: employeeIdByEmail['employee@nimbuscorp.com'],
      leaveType: 'ANNUAL',
      startDate: new Date(new Date().setDate(new Date().getDate() + 10)),
      endDate: new Date(new Date().setDate(new Date().getDate() + 12)),
      days: 3,
      reason: 'Family trip',
      status: 'PENDING',
    },
  });
  await prisma.leaveRequest.create({
    data: {
      employeeId: employeeIdByEmail['noah.kim@nimbuscorp.com'],
      leaveType: 'SICK',
      startDate: new Date(new Date().setDate(new Date().getDate() - 3)),
      endDate: new Date(new Date().setDate(new Date().getDate() - 2)),
      days: 2,
      reason: 'Flu',
      status: 'APPROVED',
      approverId: createdUserIds['manager@nimbuscorp.com'],
      approvedAt: new Date(),
    },
  });
  await prisma.leaveRequest.create({
    data: {
      employeeId: employeeIdByEmail['linda.osei@nimbuscorp.com'],
      leaveType: 'CASUAL',
      startDate: new Date(new Date().setDate(new Date().getDate() + 3)),
      endDate: new Date(new Date().setDate(new Date().getDate() + 3)),
      days: 1,
      reason: 'Personal errand',
      status: 'PENDING',
    },
  });

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

      await prisma.attendance.upsert({
        where: { employeeId_date: { employeeId, date } },
        update: {},
        create: {
          employeeId,
          date,
          status,
          checkIn: status === 'PRESENT' || status === 'HALF_DAY' ? checkInTime.toISOString() : null,
          checkOut: status === 'PRESENT' || status === 'HALF_DAY' ? checkOutTime.toISOString() : null,
          hoursWorked: status === 'PRESENT' ? 8 : status === 'HALF_DAY' ? 4 : 0,
        },
      });
    }
  }

  // ---- A completed payroll run (last month) + one in-flight run (this month) ----
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const lastPeriod = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

  const structures = await prisma.salaryStructure.findMany({ where: { isActive: true } });
  let totalGross = 0, totalDeductions = 0, totalNet = 0;
  const completedRun = await prisma.payrollRun.create({
    data: {
      period: lastPeriod,
      status: 'COMPLETED',
      createdById: createdUserIds['payrolladmin@nimbuscorp.com'],
      reviewedById: createdUserIds['payrolladmin@nimbuscorp.com'],
      reviewedAt: new Date(),
      approvedById: createdUserIds['superadmin@nimbuscorp.com'],
      approvedAt: new Date(),
      submittedAt: new Date(),
      processedAt: new Date(),
      employeeCount: structures.length,
    },
  });

  for (const s of structures) {
    const gross = s.basic + s.hra + s.conveyance + s.medical + s.specialAllowance + s.otherAllowances;
    const deductions = s.providentFund + s.professionalTax + s.incomeTax + s.otherDeductions;
    const net = gross - deductions;
    totalGross += gross;
    totalDeductions += deductions;
    totalNet += net;
    await prisma.payslip.create({
      data: {
        payrollRunId: completedRun.id,
        employeeId: s.employeeId,
        period: lastPeriod,
        gross,
        deductions,
        net,
        breakdown: JSON.stringify({
          earnings: { basic: s.basic, hra: s.hra, conveyance: s.conveyance, medical: s.medical, specialAllowance: s.specialAllowance, otherAllowances: s.otherAllowances },
          deductions: { providentFund: s.providentFund, professionalTax: s.professionalTax, incomeTax: s.incomeTax, otherDeductions: s.otherDeductions },
        }),
      },
    });
  }
  await prisma.payrollRun.update({ where: { id: completedRun.id }, data: { totalGross, totalDeductions, totalNet } });

  const thisMonth = new Date();
  const currentPeriod = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, '0')}`;
  await prisma.payrollRun.create({
    data: { period: currentPeriod, status: 'DRAFT', createdById: createdUserIds['payrolladmin@nimbuscorp.com'] },
  });

  // ---- Announcements ----
  await prisma.announcement.create({
    data: {
      title: 'Welcome to PayrollPro',
      body: 'Our new Employee Payroll Management System is now live. Explore your dashboard, payslips, and self-service tools.',
      createdById: createdUserIds['superadmin@nimbuscorp.com'],
      audience: 'ALL',
    },
  });
  await prisma.announcement.create({
    data: {
      title: 'Quarterly All-Hands Meeting',
      body: 'Join us this Friday at 10:00 AM for the quarterly company all-hands meeting in the main auditorium.',
      createdById: createdUserIds['hradmin@nimbuscorp.com'],
      audience: 'ALL',
    },
  });

  // ---- Sample audit log entries (system bootstrap) ----
  await prisma.auditLog.create({
    data: {
      userId: createdUserIds['superadmin@nimbuscorp.com'],
      userName: 'superadmin@nimbuscorp.com',
      action: 'SYSTEM_SEEDED',
      entityType: 'System',
      newValue: JSON.stringify({ note: 'Initial demo data seeded.' }),
    },
  });

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

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
