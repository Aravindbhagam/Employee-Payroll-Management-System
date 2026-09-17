# Deploying PayrollPro

The frontend (`client/`) deploys as a static site to **GitHub Pages**. The
backend (`server/`) is an Express + Prisma API backed by **PostgreSQL**, so
both the API and its database deploy to **Render**'s free tier. Both are
wired up with config already committed to this repo — you just need to flip
a few switches in each platform's UI.

Do these in order: the backend first (frontend needs its URL), then the
frontend, then point the backend back at the frontend's URL for CORS.

## 1. Deploy the backend to Render

1. Go to https://dashboard.render.com → **New** → **Blueprint**.
2. Connect this GitHub repo. Render will detect `render.yaml` at the repo
   root and propose two resources: a free PostgreSQL database
   (**payrollpro-db**) and a web service (**payrollpro-api**, Node, free
   plan, built from `server/`) already wired to that database's
   `DATABASE_URL`.
3. Click **Apply**. Render provisions the database first, then builds and
   starts the API. `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are
   auto-generated; the database schema is applied and demo data seeded
   automatically on first boot (see `server/package.json`'s `start:prod`
   script).
4. Once live, note the service URL, e.g. `https://payrollpro-api.onrender.com`.
5. Leave the `CLIENT_ORIGIN` environment variable for now — you'll set it in
   step 3 once you know the Pages URL. (Render will prompt for it during
   blueprint setup since it's marked `sync: false`; any placeholder value is
   fine there, you'll update it after.)

**Note on the free tier:** Render's free PostgreSQL databases expire 90 days
after creation — Render will email you before that happens. At that point
you can either upgrade the database to a paid plan (~$6-7/mo) or spin up a
fresh free instance and re-apply the blueprint. Either way, the web
service's own free plan (no persistent disk) is no longer where data lives,
so restarts and redeploys of **payrollpro-api** itself no longer wipe your
data — only the database's own 90-day expiry does.

## 2. Deploy the frontend to GitHub Pages

1. In this repo on GitHub: **Settings → Pages → Build and deployment →
   Source** → select **GitHub Actions**. (One-time setup; the workflow at
   `.github/workflows/deploy-pages.yml` does the rest.)
2. **Settings → Secrets and variables → Actions → Variables → New repository
   variable**: name `API_URL`, value the Render URL from step 1 plus `/api`,
   e.g. `https://payrollpro-api.onrender.com/api`.
3. Push to `main` (or re-run the workflow manually from the **Actions** tab)
   to trigger a build. The workflow builds `client/` with the correct GitHub
   Pages base path and the `API_URL` above baked in, then publishes it.
4. Once the workflow finishes, your site is live at
   `https://<your-username>.github.io/<repo-name>/`.

## 3. Point the backend at the deployed frontend (CORS)

1. Back in the Render dashboard, open the **payrollpro-api** service →
   **Environment**.
2. Set `CLIENT_ORIGIN` to your Pages URL **without a trailing slash**, e.g.
   `https://your-username.github.io`. (Comma-separate multiple origins if
   you also want to allow a local dev frontend against this deployed API.)
3. Save — Render redeploys the service with the new value.

That's it: open the Pages URL and log in with any of the demo accounts from
the README (`Password123!`).

## Troubleshooting

- **Login succeeds but nothing loads / "Session expired" immediately** —
  almost always a `CLIENT_ORIGIN` mismatch (step 3) or the `API_URL`
  repository variable being wrong/missing at build time (step 2.2) — check
  your browser's network tab for the actual request origin/URL and compare.
- **Deep link (e.g. reloading on `/employees/123`) 404s** — this is handled
  by `client/public/404.html` + the redirect script in `client/index.html`;
  make sure both shipped in the built `client/dist` (they will, as long as
  you didn't move `404.html` out of `client/public/`).
- **Render service sleeps / first request is slow** — expected on the free
  tier; it spins back up on the next request within a few seconds.
