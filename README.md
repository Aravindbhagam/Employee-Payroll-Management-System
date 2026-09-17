# PayrollPro — Employee Payroll Management System

**A full-stack, role-based payroll platform** with secure authentication, server-enforced
RBAC, a multi-stage payroll approval workflow, and five tailored role dashboards.

🔗 **[Live demo](https://aravindbhagam.github.io/Employee-Payroll-Management-System/)** —
log in with `superadmin@nimbuscorp.com` / `Password123!` (or any [demo account](#demo-accounts))
to explore.

Built with a dependency-free HTML/CSS/JavaScript frontend and a Node.js, Express, Prisma
backend. Deployed via GitHub Actions (frontend → GitHub Pages) and Render (backend API).

## Highlights

- **Role-based access control, enforced server-side.** Five roles — Super Admin, HR Admin,
  Payroll Admin, Manager, Employee — each governed by a database-backed permission matrix
  (16 resources × 8 actions) checked independently on every API route, not just hidden in
  the UI. Super Admin can customize the matrix, or override permissions per individual user.
- **Real authentication security.** JWT access/refresh token rotation, bcrypt password
  hashing, TOTP-based two-factor authentication, account lockout after repeated failed
  logins, and a full audit trail of sensitive actions.
- **A real payroll approval workflow.** Draft → Calculating → Pending Review → Pending
  Approval → Approved → Processing → Completed/Rejected, with role-gated transitions and
  automated payslip generation.
- **Row-level data scoping.** Managers see only their team; employees see only themselves;
  company-wide administrative views are restricted to admin roles — enforced in the query
  layer, not just the response shape.
- **Five tailored dashboards.** Each role sees different KPIs, charts, and navigation, all
  driven by the same underlying permission system.

## Architecture

- **`server/`** — Node.js + Express + TypeScript API, Prisma ORM (PostgreSQL), JWT auth
  (access + refresh tokens), bcrypt password hashing, TOTP-based two-factor authentication,
  account lockout, audit logging, and a database-backed role/permission matrix enforced on
  every route.
- **`client/`** — Plain HTML/CSS/JavaScript SPA (no framework, no build step): ES modules
  loaded directly by the browser, Tailwind CSS via its CDN script, and a small hash-based
  router (`src/router.js`). Role-aware navigation, dashboards, and feature pages (Employees,
  Attendance, Leave, Payroll, Payslips, Reports, Tax & Compliance, Users & Roles, Audit Logs,
  Settings) each live in `src/pages/` as a module exporting a `render(container, ctx)`
  function.

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

Requires a local PostgreSQL server (e.g. `createdb payrollpro_dev`).

```bash
cd server
cp .env.example .env   # edit DATABASE_URL / JWT secrets for your local Postgres
npm install
npx prisma migrate dev   # applies the schema to your Postgres database
npx prisma db seed                    # seeds demo data (or: npx ts-node prisma/seed.ts)
npm run dev                           # starts the API on http://localhost:4000
```

### 2. Frontend

No install or build step — it's static HTML/CSS/JS. Serve the `client/` directory with any
static file server on port 5173, which is the backend's default `CLIENT_ORIGIN` for CORS
(ES modules and `fetch` both need a real HTTP origin, not `file://`):

```bash
cd client
npx serve . -l 5173   # or: python3 -m http.server 5173
```

`client/config.js` already points at `http://localhost:4000/api` by default, matching the
backend's default port above. Open http://localhost:5173.

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
