# MediTrail Testing Notes

Use synthetic data only. The authentication and workflow smoke tests create and delete temporary rows in the configured meditrail database. Do not point them at a database with unrelated data.

## Database setup checks

Run from server/ in PowerShell:

- npm run db:check connects to the configured database and prints its name and MySQL version.
- npm run db:init creates the meditrail database and missing tables from database/schema.sql. It does not delete rows.
- npm run demo:seed creates demo records when needed and configures the intended demo admin. It does not delete other patients.
- npm run demo:reset is destructive to all PATIENT-role accounts in meditrail and their linked clinical records. It requires typing RESET MEDTRAIL PATIENTS, keeps Admin and Doctor rows, may update the fixed old demo accounts to their documented logins, retains audit history, and reseeds the synthetic demo patient. Do not confirm if patient data must be kept.

The reset is intentionally not run by automated tests.

## Authentication smoke test

Run npm run test:auth from server/. It creates a temporary synthetic Gmail patient, checks invalid domains and passwords, patient-only registration, bcrypt hashing, the selected role at login, the cookie session, /me, the patient dashboard, and anonymous access denial. It deletes the temporary synthetic account afterward.

## Workflow smoke test

Run npm run test:workflows from server/. It creates temporary synthetic patient, admin, and doctor accounts. It checks role restrictions, doctor provisioning, admin-created patients, assignment and reassignment, assigned-patient access boundaries, consultations, prescriptions, referrals, safe account deletion, and the patient timeline. It removes its remaining test records afterward.

Run npm run test:demo from server/. It tests the demo account seed with a mock database connection, confirms passwords are bcrypt hashes, checks Gmail validation, and checks each role's login and dashboard destination without changing MySQL data.

## Frontend build

Run npm run build from client/ to create the production build.

Role dashboards are /dashboard for PATIENT, /doctor for DOCTOR, and /admin for ADMIN. Separate login pages are /login/patient, /login/doctor, and /login/admin.
