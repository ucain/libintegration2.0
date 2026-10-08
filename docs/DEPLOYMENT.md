# Deployment

Primary deployment target for this version is GitHub + Vercel + managed PostgreSQL. Read `VERCEL_GITHUB_DEPLOYMENT.md` for the exact steps.

## Why the architecture changed

The old application relied on a long-running Node process and a local-style PostgreSQL assumption. A Vercel deployment may serve the static UI while runtime database configuration is still absent. This made login fail only when the first database query occurred.

The current version adds:

- explicit environment validation;
- Vercel-compatible Node 24 entrypoint;
- managed PostgreSQL connection support;
- automatic/idempotent migration bootstrap when explicitly enabled;
- no permanent `setInterval` background job;
- lazy housekeeping + Cron fallback;
- secure HttpOnly session cookie;
- request IDs and diagnostic endpoints.

## Local Docker

```bash
docker compose up --build
```

## Generic Node host

```bash
npm install
npm run db:migrate
npm run db:seed   # demo only
npm start
```

Production environment should set `NODE_ENV=production`, a secure `JWT_SECRET`, `DATABASE_URL`, and relevant feature flags.

## Institutional production gate

This code is deployable and can run as a real hosted application. It is not equivalent to an authorized PKN STAN institutional production release until official external integrations, data governance, security testing, UAT, operational ownership, backup/restore procedures, and SSO/payment credentials are approved.
