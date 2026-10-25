# MediTrail API Specification

The API is served by Express. Authentication endpoints are under `/api/v1/auth`.
The browser sends the session cookie automatically; frontend requests must use
credentials and the server allows the configured `CLIENT_ORIGIN` only.

## Health

- `GET /api/health` returns `{ success: true, message }` without authentication.

## Authentication

- `POST /api/v1/auth/register` accepts `fullName`, `email`, `phone`, `password`,
  and `confirmPassword`. It always creates a `PATIENT` account, creates the
  patient profile in the same database transaction, hashes the password, and
  returns `201` with a public user object. A duplicate email returns `409`.
- `POST /api/v1/auth/login` accepts `email` and `password`. A successful login
  returns `200` and sets the signed `meditrail_token` cookie. Invalid credentials
  return a generic `401` response.
- `POST /api/v1/auth/logout` clears the browser cookie.
- `GET /api/v1/auth/me` requires the valid cookie and returns the current user's
  public account fields. Inactive or missing accounts are rejected.
- `GET /api/v1/patient/dashboard` requires a `PATIENT` session and returns that
  patient's profile, consultation/prescription/referral counts, and latest
  treatment activity. It derives the patient profile from the authenticated
  user; callers cannot pass another patient's ID.

The cookie is HttpOnly, SameSite=Lax, and valid for 15 minutes. It is marked
Secure when `NODE_ENV=production`. The JWT secret must be at least 32 bytes and
must be supplied through the ignored local `server/.env` file. Since the token
is stateless, clearing the cookie does not revoke a copied token before its
expiry.

Registration and login validation errors use `400`, unauthenticated requests
use `401`, duplicate email uses `409`, and unexpected server errors return a
generic message without SQL details or stack traces.

Document endpoints are not implemented yet.

## Administration and doctor workflows

- The first administrator is created locally with `npm run account:bootstrap-admin`
  from `server/`; the password prompt is hidden. There is no public admin signup.
- `GET /api/v1/admin/doctors` and `GET /api/v1/admin/patients` require `ADMIN`.
- `POST /api/v1/admin/doctors` requires `ADMIN` and accepts `fullName`, `email`,
  `password`, `specialty`, and optional `registrationNumber`. The server assigns
  the `DOCTOR` role.
- `GET /api/v1/admin/patient-access`, `POST /api/v1/admin/patient-access`, and
  `PATCH /api/v1/admin/patient-access` require `ADMIN`. Grant/revoke requests
  use `patientCode` and `doctorUserId`. Grants are stored in the additive
  `doctor_patient_access` table.
- `GET /api/v1/doctor/me`, `GET /api/v1/doctor/patients`, and
  `GET /api/v1/doctor/patients/:patientCode/consultations` require `DOCTOR` and
  an active patient access grant.
- `GET /api/v1/doctor/referrals/doctors` lists active doctors for referral
  selection and does not disclose patient information.
- `POST /api/v1/doctor/consultations` records symptoms, diagnosis, and notes
  for an accessible patient. `POST /api/v1/doctor/consultations/:id/prescriptions`
  creates a prescription and its medicine items in one transaction.
- `POST /api/v1/doctor/referrals` creates a referral for an accessible patient.
  The receiving doctor can use `GET /api/v1/doctor/referrals/inbox` and
  `PATCH /api/v1/doctor/referrals/:id/status`. Accepting a referral grants the
  receiving doctor access; completion and cancellation are role- and
  state-checked.

Consultation, prescription, referral, provisioning, and access grant changes
write audit events in the same transaction as the related change. Patient
dashboard queries are scoped by the authenticated account, and doctor record
queries require an active access grant.
