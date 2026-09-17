-- Initial schema. IDs are generated application-side (crypto.randomUUID()),
-- not DB-side, so no default is declared on id columns.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  employee_code TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  department_id TEXT,
  manager_id TEXT,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  two_factor_secret TEXT,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMP,
  last_login_at TIMESTAMP,
  last_login_ip TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  reset_token TEXT,
  reset_token_expires TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX users_role_idx ON users (role);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  user_agent TEXT,
  ip TEXT,
  remember_me BOOLEAN NOT NULL DEFAULT false,
  revoked BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE role_permissions (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (role, resource, action)
);

CREATE TABLE user_permissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  allowed BOOLEAN NOT NULL,
  UNIQUE (user_id, resource, action)
);

CREATE TABLE departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  manager_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD CONSTRAINT users_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE SET NULL;
ALTER TABLE users ADD CONSTRAINT users_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES users (id) ON DELETE SET NULL;

CREATE TABLE designations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  department_id TEXT NOT NULL REFERENCES departments (id) ON DELETE RESTRICT,
  UNIQUE (title, department_id)
);

CREATE TABLE employees (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  date_of_birth TIMESTAMP,
  date_of_joining TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  department_id TEXT REFERENCES departments (id) ON DELETE SET NULL,
  designation_id TEXT REFERENCES designations (id) ON DELETE SET NULL,
  employment_type TEXT NOT NULL DEFAULT 'Full-Time',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  photo_url TEXT,
  bank_account_number TEXT,
  bank_name TEXT,
  tax_id TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attendance (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  date TIMESTAMP NOT NULL,
  check_in TEXT,
  check_out TEXT,
  status TEXT NOT NULL,
  hours_worked DOUBLE PRECISION NOT NULL DEFAULT 0,
  UNIQUE (employee_id, date)
);

CREATE TABLE leave_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  days DOUBLE PRECISION NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  approver_id TEXT,
  approved_at TIMESTAMP,
  reject_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE leave_balances (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  year INTEGER NOT NULL,
  allocated DOUBLE PRECISION NOT NULL,
  used DOUBLE PRECISION NOT NULL DEFAULT 0,
  UNIQUE (employee_id, leave_type, year)
);

CREATE TABLE salary_structures (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  basic DOUBLE PRECISION NOT NULL,
  hra DOUBLE PRECISION NOT NULL DEFAULT 0,
  conveyance DOUBLE PRECISION NOT NULL DEFAULT 0,
  medical DOUBLE PRECISION NOT NULL DEFAULT 0,
  special_allowance DOUBLE PRECISION NOT NULL DEFAULT 0,
  other_allowances DOUBLE PRECISION NOT NULL DEFAULT 0,
  provident_fund DOUBLE PRECISION NOT NULL DEFAULT 0,
  professional_tax DOUBLE PRECISION NOT NULL DEFAULT 0,
  income_tax DOUBLE PRECISION NOT NULL DEFAULT 0,
  other_deductions DOUBLE PRECISION NOT NULL DEFAULT 0,
  ctc DOUBLE PRECISION NOT NULL,
  effective_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payroll_runs (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  total_gross DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_deductions DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_net DOUBLE PRECISION NOT NULL DEFAULT 0,
  employee_count INTEGER NOT NULL DEFAULT 0,
  created_by_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  submitted_at TIMESTAMP,
  reviewed_by_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  approved_by_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  processed_at TIMESTAMP,
  rejection_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payslips (
  id TEXT PRIMARY KEY,
  payroll_run_id TEXT NOT NULL REFERENCES payroll_runs (id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  gross DOUBLE PRECISION NOT NULL,
  deductions DOUBLE PRECISION NOT NULL,
  net DOUBLE PRECISION NOT NULL,
  breakdown TEXT NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (payroll_run_id, employee_id)
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  previous_value TEXT,
  new_value TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at);
CREATE INDEX audit_logs_entity_type_idx ON audit_logs (entity_type);

CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  audience TEXT NOT NULL DEFAULT 'ALL',
  department_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE company_settings (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  company_name TEXT NOT NULL DEFAULT 'Acme Corporation',
  logo_url TEXT,
  address TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  fiscal_year_start TEXT NOT NULL DEFAULT '01-01',
  session_timeout_minutes INTEGER NOT NULL DEFAULT 30,
  password_min_length INTEGER NOT NULL DEFAULT 8,
  max_failed_login_attempts INTEGER NOT NULL DEFAULT 5,
  lockout_minutes INTEGER NOT NULL DEFAULT 15,
  two_factor_required BOOLEAN NOT NULL DEFAULT false,
  default_provident_fund_rate DOUBLE PRECISION NOT NULL DEFAULT 12,
  default_professional_tax DOUBLE PRECISION NOT NULL DEFAULT 200,
  default_income_tax_rate DOUBLE PRECISION NOT NULL DEFAULT 10
);
