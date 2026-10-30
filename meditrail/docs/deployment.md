# MediTrail deployment: Vercel + Aiven

This guide describes the intended academic demo setup: a Vercel-hosted React frontend, a Vercel-hosted Express API, and the existing Aiven MySQL database. MediTrail is a synthetic-data academic prototype, not a hospital production system.

## Current project layout

- Frontend Vercel project root: `client` (Vite build output: `dist`).
- Backend Vercel project root: `server` (one Express Function for the whole API).
- Database: the existing Aiven MySQL database named `meditrail`.
- Frontend API base: `/api/v1`; the browser should call the frontend's own origin and Vercel should proxy `/api/*` to the backend project.

The backend app in `server/src/app.js` is the Vercel Express entry point. The Vercel configuration selects the Express framework, and the app is exported directly. Vercel runs the Express app as one Function; no adapter package or per-route functions are needed. `server/src/server.js` remains the local Node listener used by `npm start` and `npm run dev`, and is excluded only from the Vercel upload.

## Before deployment

1. Confirm the Aiven `meditrail` schema is initialized and that the runtime database user has been verified to have only the application privileges it needs. Do not run seed, reset, bootstrap, migration, or schema initialization commands as part of deployment.
2. The existing runtime user `meditrail_app` still needs its effective MySQL grants verified. An earlier `SHOW GRANTS` attempt was denied, so treat this as a deployment blocker until Aiven confirms the user can access only the required MediTrail tables and cannot administer the database.
3. Vercel Functions need network access to Aiven. Confirm the Aiven service allows the Vercel backend's outbound connections; do not open MySQL to the public internet just to make the connection work.
4. The frontend's current `client/vercel.json` rewrite still targets the retired Render hostname. After the backend Vercel project has a URL, update that rewrite to the backend URL before deploying the frontend. Keep the `/api/:path*` path intact and retain the SPA fallback to `/index.html`.

## Create two Vercel projects

Use the same approved source repository for two separate Vercel projects. Do not deploy the repository root as a single project.

### Backend project

- Root directory: `server`
- Framework preset: Express (also selected by `server/vercel.json`)
- Install command: `npm ci`
- Build command: leave the default/blank unless Vercel asks for one
- Output directory: leave the default/blank
- Function entry: `src/app.js`, automatically detected by Vercel
- Health endpoints: `/api/health` (liveness) and `/api/health/ready` (also checks MySQL)

Add these variables in the backend Vercel project's Environment Variables page. Use the Production environment, and add Preview values separately only when you intend to test preview deployments.

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DB_HOST` | Aiven's DNS hostname |
| `DB_PORT` | Aiven's MySQL port |
| `DB_NAME` | `meditrail` |
| `DB_USER` | The verified, restricted runtime user |
| `DB_PASSWORD` | Runtime user's password; enter only in Vercel settings |
| `DB_SSL` | `true` |
| `DB_SSL_CA` | Complete Aiven CA certificate PEM text; enter only in Vercel settings |
| `DB_CONNECTION_LIMIT` | `3` (optional; this is also the code default per Function instance) |
| `JWT_SECRET` | A fresh, locally generated random secret of at least 32 bytes |
| `CLIENT_ORIGIN` | Exact frontend Vercel origin, such as `https://your-frontend.vercel.app` |

The MySQL TLS client uses the configured CA, rejects unauthorized certificates, checks the certificate against Aiven's DNS hostname, and requires TLS 1.2 or newer. Certificate verification stays enabled. If these values are missing or malformed, fix the Vercel environment settings; do not disable verification.

The pool limit is per warm Function instance, not a global limit across all Vercel instances. Vercel can create multiple instances, so keep this value conservative and check the Aiven connection limit when estimating total connections.

`/api/health` confirms the API process responds. `/api/health/ready` performs `SELECT 1`, so use it only after the Vercel environment variables and Aiven network access are configured. API responses include `Cache-Control: no-store`.

### Frontend project

- Root directory: `client`
- Framework preset: Vite
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`
- Set `VITE_API_BASE_URL=/api/v1` for Production (this is the production default in the client).

Once the backend project URL is known, change the first rewrite in `client/vercel.json` from the old Render URL to the backend Vercel project's HTTPS URL. Leave the SPA fallback rewrite in place. This makes the browser call `/api/...` on the frontend origin, so the API's HttpOnly cookie remains associated with the frontend host. The Express CORS configuration still allows credentials and uses `CLIENT_ORIGIN`; keep that origin exact. Login, refresh/session restoration, and logout must be checked in a browser after deployment.

## Generate a JWT secret locally

Run this in PowerShell. Copy the output directly into the backend Vercel `JWT_SECRET` setting. Do not put it in a `VITE_` variable, source control, or chat.

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
```

Do not copy Aiven passwords, JWT secrets, or CA contents into this README or a frontend environment variable. Do not overwrite the local `server/.env` for deployment.

## First verification after deployment

1. Visit the backend URL at `/api/health`; expect an API success response.
2. Visit `/api/health/ready`; expect `database: "available"` only after Aiven connectivity is set up.
3. Visit the frontend homepage and a nested React route directly to check the SPA fallback.
4. Use the frontend's proxied `/api/v1/public/hospital-settings` request to check routing.
5. Test synthetic patient, doctor, and admin login, session restoration, and logout. Check that role-protected API endpoints reject the wrong role.
6. Test admin doctor provisioning, assignments, consultations, prescriptions, and referrals with synthetic records.
7. Check Vercel and Aiven logs for errors without copying credentials, cookies, or tokens into reports.

The local preparation in this repository does not create provider resources, upload source, change database contents, or deploy the application. Vercel and Aiven plans, connection limits, and network features can change; check the providers' current documentation before choosing a plan.
