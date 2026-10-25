# MediTrail Demonstration Flow

Use synthetic data only. The demo covers patient registration, account
provisioning, explicit doctor access, and a treatment timeline.

1. Install dependencies in `client/` and `server/` and configure `server/.env`
   from `server/.env.example`.
2. Start MySQL and run `npm run db:migrate:access` from `server/`.
3. Create the first administrator with `npm run account:bootstrap-admin` from
   `server/`; the password is entered through a hidden terminal prompt.
4. Start the API with `npm start` in `server/` and Vite with `npm run dev` in
   `client/`.
5. Register a synthetic patient. Confirm that registration opens the patient
   dashboard with a generated patient code and empty timeline.
6. Log in as administrator, create two synthetic doctor accounts, and grant
   one doctor access to the patient.
7. Log in as that doctor, record a consultation, create a prescription, and
   send a referral to the second doctor.
8. Log in as the receiving doctor, accept the referral, view the patient
   history, and complete the referral.
9. Log back in as the patient and confirm that the dashboard shows the
   consultation, prescription, and referral history.
10. Revoke the first doctor's grant and verify that the doctor can no longer
    read the patient's history.

Do not use real patient details or present the prototype as clinically ready.
