# MediTrail API Specification

The API is served by Express. Authentication endpoints are under `/api/v1/auth`.
The browser sends the session cookie automatically; frontend requests must use
credentials and the server allows the configured `CLIENT_ORIGIN` only.

## Health

- `GET /api/health` returns `{ success: true, message }` without authentication.

## Authentication

- `POST /api/v1/auth/register` accepts `fullName`, a Gmail `email`, `phone`, `password`,
  and `confirmPassword`. It always creates a `PATIENT` account, creates the
  patient profile in the same database transaction, hashes the password, and
  returns `201` with a public user object. A duplicate email returns `409`.
- `POST /api/v1/auth/login` accepts a Gmail `email`, `password`, and the selected
  `role` (`PATIENT`, `DOCTOR`, or `ADMIN`). The database role must match the
  selected role. A successful login returns `200` and sets the
  `meditrail_token` cookie. Invalid credentials or a role mismatch return a
  generic `401` response.
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

- The local demo administrator is configured by `npm run demo:seed`; it creates
  an admin if none exists or updates the one existing admin row. The seed stops
  if multiple admins exist. `npm run account:bootstrap-admin` remains available
  for a manually provisioned Gmail administrator. There is no public admin signup.
- `GET /api/v1/admin/doctors` and `GET /api/v1/admin/patients` require `ADMIN`.
- `POST /api/v1/admin/patients` creates a PATIENT account; it never accepts a
  requested role. `DELETE /api/v1/admin/patients/:patientCode` removes the
  patient's consultations, prescriptions/items, referrals, grants, profile, and
  account in foreign-key order while retaining audit history.
- `POST /api/v1/admin/doctors` requires `ADMIN` and accepts `fullName`, a Gmail `email`,
  `password`, `specialty`, and optional `registrationNumber`. The server assigns
  the `DOCTOR` role.
- `DELETE /api/v1/admin/doctors/:doctorUserId` removes the doctor account and
  clinical records linked to that doctor; other user accounts remain.
- `PUT /api/v1/admin/patient-assignment` accepts `patientCode` and
  `doctorUserId`. It revokes the patient's other active grants before assigning
  the selected doctor.
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

## Current route inventory

The route list below is derived from the Express routers in
`server/src/app.js`. Protected-route checks are enforced by the backend, even
when the frontend also hides or redirects a page.

### Health, authentication, and patient

| Method and path | Access | Input and result |
| --- | --- | --- |
| `GET /api/health` | Public | No input; returns API health. No database query. |
| `POST /api/v1/auth/register` | Public | `fullName`, Gmail `email`, `phone`, `password`, `confirmPassword`, optional `bloodGroup` (`A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`, or `UNKNOWN`); creates a PATIENT user/profile and returns public user fields plus session cookie. |
| `POST /api/v1/auth/login` | Public | `email`, `password`, selected `role`; role is checked against MySQL and a successful response sets the session cookie. |
| `POST /api/v1/auth/logout` | Public | No body; expires the session cookie. |
| `GET /api/v1/auth/me` | Any valid session | Returns the active account's public fields; never returns a password hash. |
| `POST /api/v1/auth/change-password` | Valid session with a temporary-password change pending | `password`, `confirmPassword`; updates the bcrypt hash and session version. |
| `GET /api/v1/patient/dashboard` | PATIENT | No caller-supplied patient ID; returns only the signed-in patient's summary, assigned doctor, and activity. |
| `GET /api/v1/public/hospital-settings` | Public | Returns the configured public contact details, or `settings: null` before an admin configures them. |

### Admin

Every route in this section requires an authenticated ADMIN session.

| Method and path | Input and result |
| --- | --- |
| `GET /api/v1/admin/doctors` | Returns doctor profiles, account status, and active assigned-patient counts. |
| `GET /api/v1/admin/hospital-settings` | Returns the editable hospital contact fields, with blanks where no values are configured. |
| `PUT /api/v1/admin/hospital-settings` | `hospitalName`, `officialEmail`, `contactPhone`, `address`, `workingHours`; validates and saves public settings, and writes an audit event. |
| `GET /api/v1/admin/patients` | Returns patient profiles and current assigned-doctor fields. |
| `GET /api/v1/admin/patient-access` | Returns active and revoked doctor-patient grant history. |
| `GET /api/v1/admin/accounts?search=...` | Searches patient/doctor name, email, or account ID; returns identifying fields only. |
| `POST /api/v1/admin/accounts/:userId/reset-password` | Issues a one-time temporary password; stores only its bcrypt hash, increments session version, and writes an audit event without the password. |
| `POST /api/v1/admin/patients` | `fullName`, Gmail `email`, `password`, optional `phone`; server always creates PATIENT. |
| `POST /api/v1/admin/doctors` | `fullName`, Gmail `email`, `password`, `specialty`, optional `registrationNumber`; server always creates DOCTOR. |
| `DELETE /api/v1/admin/patients/:patientCode` | Requires confirmation in the UI; deletes the selected patient and linked clinical records in a transaction, retaining audit history. |
| `DELETE /api/v1/admin/doctors/:doctorUserId` | Requires confirmation in the UI; deletes the selected doctor and linked records in a transaction. |
| `PUT /api/v1/admin/patient-assignment` | `patientCode`, `doctorUserId`; revokes prior active assignment and activates the chosen doctor grant. |
| `POST /api/v1/admin/patient-access` | `patientCode`, `doctorUserId`; grants access and records an audit event. |
| `PATCH /api/v1/admin/patient-access` | `patientCode`, `doctorUserId`; revokes access while retaining the grant history row. |

### Doctor

Every route in this section requires an authenticated DOCTOR session. Patient
record reads and writes also require an active grant or access created by an
accepted referral.

| Method and path | Input and result |
| --- | --- |
| `GET /api/v1/doctor/me` | Returns the signed-in doctor's profile. |
| `GET /api/v1/doctor/patients` | Returns patients with an active grant to this doctor. |
| `GET /api/v1/doctor/patients/:patientCode/consultations` | Returns consultations only when this doctor has active access. |
| `POST /api/v1/doctor/consultations` | `patientCode` and at least one of `symptoms`, `diagnosis`, or `notes`; writes a consultation and audit event transactionally. |
| `POST /api/v1/doctor/consultations/:consultationId/prescriptions` | Prescription `instructions` and 1–20 validated `items`; writes the prescription, items, and audit event in one transaction. |
| `POST /api/v1/doctor/referrals` | `patientCode`, `receivingDoctorUserId`, `reason`, optional `consultationId`; creates a pending referral. |
| `GET /api/v1/doctor/referrals/inbox` | Returns pending/accepted referrals addressed to this doctor. |
| `GET /api/v1/doctor/referrals/doctors` | Returns active doctors available for referral, excluding the current doctor. |
| `PATCH /api/v1/doctor/referrals/:referralId/status` | `status` in the allowed workflow states; the receiver may accept/complete or cancel by state, and the referrer may cancel a pending referral. Acceptance creates access. |

Admin-account route regression coverage lives in `server/test-auth.js`: an
anonymous request must reach the route and receive `401`, not the Express
unknown-route `404`.
