# PayrollPro — Employee Payroll Management System

A full-stack, role-based Employee Payroll Management System with secure authentication,
fine-grained RBAC, payroll approval workflows, and dedicated dashboards for every role.

## Architecture

- **`server/`** — Node.js + Express + TypeScript API, Prisma ORM (SQLite), JWT auth
  (access + refresh tokens), bcrypt password hashing, TOTP-based two-factor authentication,
  account lockout, audit logging, and a database-backed role/permission matrix enforced on
  every route.
- **`client/`** — React + TypeScript + Vite + Tailwind CSS SPA with role-aware navigation,
  dashboards, and feature pages (Employees, Attendance, Leave, Payroll, Payslips, Reports,
  Tax & Compliance, Users & Roles, Audit Logs, Settings).

## Roles

Super Admin · HR Admin · Payroll Admin · Manager · Employee — each with a distinct
dashboard, navigation, and permission set. Permissions are defined per
`(role, resource, action)` in the database and are enforced **server-side** on every API
route (`server/src/middleware/rbac.ts`) — the frontend only uses them to decide what to
render. A Super Admin can customize the role permission matrix, or grant/revoke individual
permission overrides per user, from **Users & Roles**.

## Getting started

Running locally is below. To put this online (GitHub Pages + a free Render
backend), see **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

### 1. Backend

```bash
cd server
cp .env.example .env   # edit JWT secrets for anything beyond local dev
npm install
npx prisma migrate dev --name init   # creates the SQLite DB and applies the schema
npx prisma db seed                    # seeds demo data (or: npx ts-node prisma/seed.ts)
npm run dev                           # starts the API on http://localhost:4000
```

### 2. Frontend

```bash
cd client
npm install
npm run dev   # starts the SPA on http://localhost:5173 (proxies /api to :4000)
```

Open http://localhost:5173.

### Demo accounts

All demo accounts use the password `Password123!`.

| Role          | Email                          |
|---------------|---------------------------------|
| Super Admin   | superadmin@nimbuscorp.com      |
| HR Admin      | hradmin@nimbuscorp.com         |
| Payroll Admin | payrolladmin@nimbuscorp.com    |
| Manager       | manager@nimbuscorp.com         |
| Employee      | employee@nimbuscorp.com        |

## Security notes

- Passwords are hashed with bcrypt; JWT access tokens are short-lived (15 min) and paired
  with a rotating, httpOnly-cookie refresh token.
- Every protected API route independently re-verifies the caller's role/permission —
  hiding a button in the UI is never the only safeguard.
- Failed logins are rate-limited and accounts lock after repeated failures
  (configurable in **Settings**).
- Optional TOTP two-factor authentication (compatible with any standard authenticator app).
- Sensitive fields (bank account numbers, tax IDs) are masked for roles that shouldn't see
  them in full.
- Every sensitive action (logins, employee/payroll/user changes, permission changes, leave
  approvals, etc.) is written to the audit log, visible to Super Admin under **Audit Logs**.

## Copyright

Copyright © 2026 Aravind Bhagam. All rights reserved.

This repository is proprietary and unlicensed. No license, express or implied, is
granted to any person to use, copy, modify, merge, publish, distribute, sublicense,
or sell copies of this software, in whole or in part, without the prior written
permission of the copyright holder.
