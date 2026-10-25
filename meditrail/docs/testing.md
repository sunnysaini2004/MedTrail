# MediTrail Testing Notes

Use synthetic data only. The backend auth smoke test creates a temporary
account with an `example.invalid` email and removes that account afterward.
Run it from `server/` with `npm run test:auth` while MySQL is available.

The smoke test checks:

- Short passwords and duplicate email addresses are rejected.
- Patient registration creates both the account and profile, stores a password
  hash, and does not accept a caller-supplied privileged role.
- Valid login sets an HttpOnly cookie; invalid credentials fail.
- The protected `/api/v1/auth/me` route accepts a valid cookie and rejects an
  anonymous request.
- The patient dashboard endpoint accepts the patient's session, returns that
  account's patient code and counts, and rejects anonymous requests.

The frontend build can be checked from `client/` with `npm run build`. The
backend health endpoint is `GET /api/health`.

Run the complete synthetic doctor workflow from `server/` with
`npm run test:workflows`. It exercises administrator provisioning, grants,
consultations, prescriptions, referrals, revocation, and the patient timeline,
then removes the test users and related records. The additive access table is
created with `npm run db:migrate:access`; the migration uses `CREATE TABLE IF
NOT EXISTS` and preserves existing data.
