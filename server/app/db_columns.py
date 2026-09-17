# Reusable "SELECT <columns>" fragments, one per table, aliasing each
# snake_case column to the camelCase name the rest of the app (and the
# frontend, unchanged from the Node backend) expects.

USER_COLS = """
  id, employee_code AS "employeeCode", email, password_hash AS "passwordHash", role, status,
  department_id AS "departmentId", manager_id AS "managerId",
  two_factor_enabled AS "twoFactorEnabled", two_factor_secret AS "twoFactorSecret",
  failed_login_attempts AS "failedLoginAttempts", locked_until AS "lockedUntil",
  last_login_at AS "lastLoginAt", last_login_ip AS "lastLoginIp",
  must_change_password AS "mustChangePassword", reset_token AS "resetToken",
  reset_token_expires AS "resetTokenExpires", created_at AS "createdAt", updated_at AS "updatedAt"
"""

SESSION_COLS = """
  id, user_id AS "userId", token_hash AS "tokenHash", user_agent AS "userAgent", ip,
  remember_me AS "rememberMe", revoked, expires_at AS "expiresAt", created_at AS "createdAt"
"""

DEPARTMENT_COLS = """
  id, name, description, manager_id AS "managerId", created_at AS "createdAt"
"""

DESIGNATION_COLS = """
  id, title, department_id AS "departmentId"
"""

EMPLOYEE_COLS = """
  id, user_id AS "userId", first_name AS "firstName", last_name AS "lastName", phone, address,
  date_of_birth AS "dateOfBirth", date_of_joining AS "dateOfJoining",
  department_id AS "departmentId", designation_id AS "designationId",
  employment_type AS "employmentType", status, photo_url AS "photoUrl",
  bank_account_number AS "bankAccountNumber", bank_name AS "bankName", tax_id AS "taxId",
  emergency_contact_name AS "emergencyContactName", emergency_contact_phone AS "emergencyContactPhone",
  created_at AS "createdAt", updated_at AS "updatedAt"
"""

DOCUMENT_COLS = """
  id, employee_id AS "employeeId", name, type, file_name AS "fileName", uploaded_at AS "uploadedAt"
"""

ATTENDANCE_COLS = """
  id, employee_id AS "employeeId", date, check_in AS "checkIn", check_out AS "checkOut",
  status, hours_worked AS "hoursWorked"
"""

LEAVE_REQUEST_COLS = """
  id, employee_id AS "employeeId", leave_type AS "leaveType", start_date AS "startDate",
  end_date AS "endDate", days, reason, status, approver_id AS "approverId",
  approved_at AS "approvedAt", reject_reason AS "rejectReason", created_at AS "createdAt"
"""

LEAVE_BALANCE_COLS = """
  id, employee_id AS "employeeId", leave_type AS "leaveType", year, allocated, used
"""

SALARY_STRUCTURE_COLS = """
  id, employee_id AS "employeeId", basic, hra, conveyance, medical,
  special_allowance AS "specialAllowance", other_allowances AS "otherAllowances",
  provident_fund AS "providentFund", professional_tax AS "professionalTax",
  income_tax AS "incomeTax", other_deductions AS "otherDeductions", ctc,
  effective_from AS "effectiveFrom", is_active AS "isActive", created_at AS "createdAt"
"""

PAYROLL_RUN_COLS = """
  id, period, status, total_gross AS "totalGross", total_deductions AS "totalDeductions",
  total_net AS "totalNet", employee_count AS "employeeCount",
  created_by_id AS "createdById", submitted_at AS "submittedAt",
  reviewed_by_id AS "reviewedById", reviewed_at AS "reviewedAt",
  approved_by_id AS "approvedById", approved_at AS "approvedAt",
  processed_at AS "processedAt", rejection_reason AS "rejectionReason",
  created_at AS "createdAt", updated_at AS "updatedAt"
"""

PAYSLIP_COLS = """
  id, payroll_run_id AS "payrollRunId", employee_id AS "employeeId", period,
  gross, deductions, net, breakdown, generated_at AS "generatedAt"
"""

AUDIT_LOG_COLS = """
  id, user_id AS "userId", user_name AS "userName", action, entity_type AS "entityType",
  entity_id AS "entityId", previous_value AS "previousValue", new_value AS "newValue",
  ip_address AS "ipAddress", user_agent AS "userAgent", created_at AS "createdAt"
"""

ANNOUNCEMENT_COLS = """
  id, title, body, created_by_id AS "createdById", audience,
  department_id AS "departmentId", created_at AS "createdAt"
"""

COMPANY_SETTINGS_COLS = """
  id, company_name AS "companyName", logo_url AS "logoUrl", address, currency,
  fiscal_year_start AS "fiscalYearStart", session_timeout_minutes AS "sessionTimeoutMinutes",
  password_min_length AS "passwordMinLength", max_failed_login_attempts AS "maxFailedLoginAttempts",
  lockout_minutes AS "lockoutMinutes", two_factor_required AS "twoFactorRequired",
  default_provident_fund_rate AS "defaultProvidentFundRate",
  default_professional_tax AS "defaultProfessionalTax", default_income_tax_rate AS "defaultIncomeTaxRate"
"""
