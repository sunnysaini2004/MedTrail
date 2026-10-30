# MediTrail online demo deployment

This guide describes the Vercel, Render, and Aiven setup for a public academic demo. Use synthetic accounts and records only. These free plans do not make MediTrail a reliable clinical production system.

## Current local configuration

- Frontend root: `client`
- Backend root: `server`
- Database name: `meditrail`
- Vercel static output: `dist`
- Vercel API base: `/api/v1`
- The Vercel API rewrite currently targets `https://meditrail-api.onrender.com`. Create the Render service with that hostname if it is available. If Render assigns a different hostname, update `client/vercel.json` before deploying the frontend.

## Free-plan limitations

- **Vercel Hobby:** appropriate for a personal, non-commercial academic demo. It provides the free Vercel hostname and static site hosting. Check the current [Hobby plan and terms](https://vercel.com/docs/plans/hobby) before use.
- **Render Free Web Service:** sleeps after 15 minutes without inbound traffic and can take about a minute to wake. It has a shared monthly instance-hour allowance, and Render describes free instances as suitable for testing and hobby projects, not production. Keep durable application data in MySQL, not on Render's filesystem. See [Render free limits](https://render.com/docs/free).
- **Aiven MySQL Free:** current offering is one node with 1 CPU, 1 GB RAM, 1 GB storage, and up to 76 connections. It has no HA/SLA, may power down inactive free services, and backup recovery is limited compared with paid tiers. Aiven can change free-plan terms. See [Aiven free MySQL](https://aiven.io/docs/products/mysql/concepts/mysql-free-tier) and [pricing](https://aiven.io/pricing/mysql).

## Stage A: create provider accounts and resources

Do this only after approving the external deployment stage.

1. Create/sign in to Vercel and Render accounts. Do not push this repository to GitHub unless you explicitly approve that later. Local CLI/image deployment or a Git-connected deployment both upload project material and require approval.
2. In Aiven, create a free MySQL service and a database named `meditrail`. Aiven MySQL's default service hostname is DNS-based; use the hostname and port shown in its dashboard, not a copied IP.
3. Create a database application user with only the privileges MediTrail needs after schema setup. Avoid using a full administrator credential as the permanent Render runtime user.
4. Configure Aiven's network allowlist. Render Free uses shared regional outbound IP ranges; find the current ranges in the Render service dashboard and allow only the required ranges plus a temporary local migration address. Remove the temporary local address after setup. Do not leave the database open to `0.0.0.0/0`.
5. Download the Aiven project CA certificate through its dashboard. Do not send the certificate or database credentials in chat. Aiven MySQL does not enforce TLS on every user by default; MediTrail's client will require TLS and verify both certificate chain and DNS identity. If you also want the server to reject all non-TLS clients, run the provider-supported `ALTER USER ... REQUIRE SSL` only after reviewing and approving that database operation.

## Stage B: initialize the empty cloud database

The current [schema](../database/schema.sql) creates the MediTrail tables and preserves the current role, access, account-recovery, hospital-settings, and blood-group fields. The additive migration files are `001_doctor_patient_access.sql` and `002_hospital_settings.sql`; the account-recovery script adds its columns only if missing.

Before running these against the cloud database, inspect the provider target and approve the DDL. Do not import local database records. From the `server` folder, the setup commands are:

```powershell
npm run db:init
npm run db:migrate:access
npm run db:migrate:account-recovery
npm run db:migrate:hospital-settings
npm run db:check
```

`db:init` uses `CREATE DATABASE/TABLE IF NOT EXISTS`; the migrations add missing access/settings/account-recovery structures and widen `patients.blood_group` only when needed. They do not drop or truncate tables. Do not run `demo:seed` or `demo:reset` on the hosted database. Create the first synthetic administrator using the existing hidden-password bootstrap command after the schema is ready.

## Stage C: deploy the backend on Render

Create a **Web Service** from the approved project source. Use:

- Root directory: `server`
- Build command: `npm ci`
- Start command: `npm start`
- Health check path: `/api/health`

Render supplies `PORT`. MediTrail binds to `0.0.0.0` and uses that port. `/api/health` is a liveness check; `/api/health/ready` executes `SELECT 1` and returns a generic 503 when MySQL is unavailable.

Set these variables in Render's service dashboard:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DB_HOST` | Aiven DNS hostname |
| `DB_PORT` | Aiven port |
| `DB_USER` | Runtime database username |
| `DB_PASSWORD` | Runtime database password; enter only in Render |
| `DB_NAME` | `meditrail` |
| `DB_SSL` | `true` |
| `DB_SSL_CA` | Full PEM content of Aiven's project CA |
| `JWT_SECRET` | A locally generated random value of at least 32 bytes |
| `CLIENT_ORIGIN` | Exact Vercel site origin, for example `https://your-project.vercel.app` |
| `PORT` | Do not set manually; Render supplies it |

`DB_SSL=true` requires `DB_SSL_CA` and a DNS hostname. The connection uses TLS 1.2 or newer, trusts only the supplied CA, rejects unauthorized certificates, and verifies that the certificate identity matches the database hostname. It fails closed if those checks cannot be configured. No TLS verification bypass is supported.

The first Admin is created with `npm run account:bootstrap-admin` from the `server` folder. Use a temporary PowerShell environment populated with the Aiven connection details for that command so it does not accidentally target the local `server/.env`. The script prompts for the Admin password without displaying it. Clear the temporary environment variables after it finishes. Never use the public demo-seed credentials for the hosted site.

Generate a JWT secret locally in PowerShell without sharing it:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
```

Paste its output directly into Render's `JWT_SECRET` field. Do not put it in a `VITE_` variable, GitHub, or chat. Do not overwrite `server/.env` for deployment.

## Stage D: deploy the frontend on Vercel

In Vercel, create a project from the approved source and set its root directory to `client`, install command to `npm ci`, build command to `npm run build`, and output directory to `dist`. Set this environment variable for Production and redeploy after setting it:

```text
VITE_API_BASE_URL=/api/v1
```

The [Vercel config](../client/vercel.json) sends `/api/*` through Vercel to Render and rewrites other paths to `index.html`, supporting React Router deep links. Because browser requests use the Vercel origin, the existing HttpOnly, Secure, `SameSite=Lax` cookie is intended to remain first-party; verify login, refresh/session restoration, and logout in a real browser before treating this as confirmed.

The proxy destination must match the final Render service hostname. The current value assumes `meditrail-api.onrender.com`; update it if that hostname was unavailable.

Vercel's CLI can deploy directly from the local `client` folder, but doing so uploads source and requires approval. A Git-connected deployment requires the deployment changes to be present in the connected branch; do not push them without explicit approval.

## Stage E: verify the live demo

After deployment and approval to test the live services:

1. Open the Vercel homepage and visit a deep React route directly.
2. Request `https://<render-host>/api/health` and `https://<render-host>/api/health/ready`.
3. Confirm the Vercel-proxied public settings request works.
4. Test patient registration and optional blood group, patient/doctor/admin login, refresh, and logout.
5. Test account provisioning, patient assignment, consultations, prescriptions, referrals, and role-protected API failures with synthetic accounts.
6. Check browser console/network logs and Render/Aiven logs without copying credentials or tokens into reports.

No provider resource, cloud database, or source upload has been created by this local preparation stage.
