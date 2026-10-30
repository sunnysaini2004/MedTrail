# MediTrail

MediTrail is an MCA academic prototype for patient accounts, doctor assignments, consultations, prescriptions, and referrals. It uses synthetic data only and is not for real clinical or hospital use.

## Demo account defaults

These credentials are created by the optional `demo:seed` command for a fresh demonstration database. A read-only check of this local database found the documented Admin credentials match an active Admin account, but no active accounts use the documented Doctor or Patient demo emails. To preserve existing accounts, skip `demo:seed`; the Admin can create a Doctor account, and Patients can self-register.

| Role | Email | Password |
| --- | --- | --- |
| Admin | **sunnysaini@gmail.com** | **sunny123** |
| Doctor | **doctor123@gmail.com** | **doctor123** |
| Patient | **patient123@gmail.com** | **patient123** |

Passwords are stored as bcrypt hashes. Demo seed data is synthetic. Do not enter real patient or personal information.

## Features

- Three separate login choices for Admin, Doctor, and Patient.
- Patient self-registration; registration always makes a PATIENT account.
- Admin tools to create patients and doctors, assign or change a doctor, and delete accounts.
- Doctors can see only patients with an active assignment or accepted referral.
- Patient dashboard with assigned doctor and available consultation, prescription, and referral history.
- Server-side authentication and role checks for protected API routes.

## Technology and folders

- Frontend: React, Vite, Tailwind CSS, React Router (client/).
- Backend: Node.js and Express (server/).
- Database: MySQL schema and migrations (database/).
- Project notes and demo flow (docs/).

## Online demo deployment

See [`meditrail/docs/deployment.md`](meditrail/docs/deployment.md) for the Vercel, Render, and Aiven setup. It uses a same-origin Vercel API proxy for cookie authentication and requires verified TLS for the production MySQL connection. The free hosting plans are for an academic synthetic-data demo, not dependable clinical production.

## Requirements

Install Node.js with npm and MySQL 8. Commands below use this project location: D:\College Project\meditrail. Change the path if your folder is elsewhere.

## Windows PowerShell setup

### 1. Start MySQL

Start your local MySQL service from Windows Services or MySQL Workbench. To see its service name from PowerShell:

~~~powershell
Get-Service *MySQL*
~~~

If the service is called MySQL80, an elevated PowerShell window can start it with:

~~~powershell
Start-Service MySQL80
~~~

Use the service name shown on your computer.

### 2. Install backend dependencies and configure .env

Open **PowerShell Terminal 1**:

~~~powershell
Set-Location "D:\College Project\meditrail\server"
npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
~~~

In the local server/.env file, set your own MySQL connection values:

- DB_HOST=localhost
- DB_PORT=3306
- DB_USER=root (or your MySQL user)
- DB_PASSWORD= followed by your local MySQL password; leave it empty if your local account has no password.
- DB_NAME=meditrail
- CLIENT_ORIGIN=http://localhost:5173
- PORT=5000
- NODE_ENV=development
- JWT_SECRET= followed by a local random value of at least 32 characters.

To generate a random JWT secret locally, run this in PowerShell, then put its output in JWT_SECRET in the local file:

~~~powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
~~~

Keep .env on your computer. Never share your MySQL password or JWT secret in chat or commit them.

### 3. Initialize the database safely

From **Terminal 1**, still in server/:

~~~powershell
npm run db:init
npm run db:check
npm run db:migrate:account-recovery
npm run db:migrate:hospital-settings
~~~

db:init creates the meditrail database and any missing tables. It does not delete existing rows. The MySQL user needs permission to create the database and tables.

`db:migrate:account-recovery` is a safe, additive migration for an existing installation. It adds only `must_change_password` and `session_version` columns to `users` when they are missing. Existing accounts keep their passwords and sessions; it does not remove or update any user or clinical records.

`db:migrate:hospital-settings` safely adds the hospital contact settings table and widens the existing nullable `patients.blood_group` column so it can store “Unknown / Not sure”. It checks that the connected database is exactly `meditrail` and preserves existing accounts and records. Admins can edit the public home-page contact details in the Admin dashboard under **Hospital contact settings**. Patient registration accepts an optional blood group; leaving it blank is fine.

For a fresh, disposable demo database only, add the optional synthetic demo records with:

~~~powershell
npm run demo:seed
~~~

demo:seed adds the synthetic demo patient if absent and ensures one sample consultation and prescription without duplicating them. It does not delete existing rows. It creates the default Admin if none exists; if one Admin exists, it updates that same row to the demo Admin name, email, and password. If multiple Admins exist, it only reuses the fixed prior demo account (admin@meditrail.test) when exactly one such account exists; otherwise it stops instead of taking over an arbitrary Admin. It also creates or updates the fixed demo Doctor account, reusing its fixed prior registration number if present.

**Existing-database warning:** `demo:seed` can change the credentials for its fixed demo Admin and Doctor accounts. Do not run it just to troubleshoot a login on a database with accounts you want to keep. The account-recovery migration does not change existing account credentials.

### Reset patient demo data (destructive)

This operation deletes **all PATIENT-role accounts** in the meditrail database, plus their patient profiles, consultations, prescriptions and prescription items, referrals, and doctor access grants. Admin and Doctor rows are kept. The fixed prior demo Admin/Doctor rows may be updated to the documented demo login; unrelated accounts remain unchanged. Audit history is kept. After deletion, it recreates the synthetic demo patient and sample visit. It does not drop the database, clear all tables, or touch another database.

Only run this if you are okay losing those patient records:

~~~powershell
Set-Location "D:\College Project\meditrail\server"
npm run demo:reset
~~~

The script checks the connected database and expected foreign keys first. It then requires you to type exactly RESET MEDTRAIL PATIENTS. If the database is not exactly meditrail, the expected schema is missing, you decline confirmation, or the transaction fails, it does not complete the reset. Do not start this command unattended.

### 4. Run the backend

Use **Terminal 1**:

~~~powershell
Set-Location "D:\College Project\meditrail\server"
npm start
~~~

The API is at http://localhost:5000. Its health check is http://localhost:5000/api/health. Leave this terminal open.

### 5. Run the frontend

Open **PowerShell Terminal 2**:

~~~powershell
Set-Location "D:\College Project\meditrail\client"
npm install
npm run dev
~~~

Open the URL printed by Vite, normally http://localhost:5173.

## Sign in and demonstrate

- Home page: choose Admin, Doctor, or Patient.
- Direct login pages: /login/admin, /login/doctor, and /login/patient.
- General login chooser: /login.
- Admin dashboard: /admin.
- Doctor dashboard: /doctor.
- Patient dashboard: /dashboard.
- Patient registration: /register. Use a Gmail address. This form can create only a patient account.
- Admin can add doctors and patients, then select a patient and doctor in **Assign or change doctor**.
- Admins can maintain the hospital name, email, phone, address, and working hours shown in the public home-page contact section.
- A doctor sees only patients currently assigned to them or made accessible by an accepted referral.
- Admin deletion asks for confirmation. Deleting a patient also deletes that patient's linked clinical records and grants, while retaining audit history. Deleting a doctor deletes their account, access grants, referrals involving that doctor, consultations they recorded, and prescriptions they wrote. Other user accounts and unrelated patients are kept.
- Admin account management can issue a one-time temporary password to an active patient or doctor. It is shown once on screen, stored only as a bcrypt hash, and requires the account owner to change it before opening a dashboard. No email service is configured, so the administrator must share it through a private channel. The temporary password is not included in logs or account listings.

Every role login checks that the database account has that exact role. A patient cannot sign in using the Admin or Doctor login option. Patient registration ignores any requested role and always creates PATIENT.

## Run available checks

Run these commands from **Terminal 1** in server/ after configuring MySQL and initializing the schema:

~~~powershell
npm run test:auth
npm run test:workflows
npm run test:demo
npm run test:db-config
~~~

Run the production build from **Terminal 2** in client/:

~~~powershell
npm run build
~~~

The authentication and workflow checks use temporary synthetic records and remove them afterward. The demo seed check uses a mock database connection. db:check verifies the current MySQL connection.

## If MySQL does not connect

From server/, try:

~~~powershell
Get-Service *MySQL*
npm run db:check
~~~

- ECONNREFUSED: start MySQL and check DB_HOST and DB_PORT.
- ER_ACCESS_DENIED_ERROR: check DB_USER and DB_PASSWORD in your local .env; do not share those values.
- ER_BAD_DB_ERROR: check DB_NAME=meditrail, then run npm run db:init.
- A permission error during db:init: use a MySQL account that can create a database and tables, or create the meditrail database through MySQL Workbench first, then run npm run db:init.
- If the server says authentication is not configured, set JWT_SECRET to a random value with 32 or more characters and restart the backend.

## Important limitation

This is a college demonstration prototype. It is not a real medical record system and has not been designed or certified for real healthcare use. Use only synthetic data.
