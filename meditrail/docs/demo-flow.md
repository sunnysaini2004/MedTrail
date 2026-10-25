# MediTrail Demo Flow

Use only the synthetic accounts and records seeded by MediTrail. Do not enter real patient information.

## Set up the demo

Follow the PowerShell setup in the root README. In the server terminal, run db:init and db:check, then run demo:seed.

- demo:seed does not remove patient accounts. It creates the fixed synthetic patient if absent, creates or updates the fixed demo doctor, and creates or updates the single administrator.
- To remove all PATIENT-role accounts and their linked records before reseeding, run demo:reset from an interactive PowerShell terminal and type RESET MEDTRAIL PATIENTS. Read the warning first. Admin and doctor accounts remain; audit history remains. The command only works against the meditrail database.
- Demo emails and passwords are in the README.

## Demonstration sequence

1. Open the home page and show the three login choices.
2. Sign in as the patient using the synthetic demo credentials. Show the assigned doctor and sample consultation/prescription activity.
3. Sign out and sign in as the doctor. Show the assigned patient and the consultation, prescription, and referral forms.
4. Sign out and sign in as the admin. Add a synthetic doctor or patient, then assign a patient to a doctor.
5. Sign in as that doctor and show that only assigned patients are listed.
6. Send a referral to another doctor. The receiving doctor accepts it and gets patient access.
7. From Admin, change an assignment or revoke a grant and show that the previous doctor can no longer access that patient's record.
8. If demonstrating deletion, use a disposable synthetic account and read the confirmation prompt. Patient deletion removes linked consultations, prescriptions/items, referrals, and grants, but retains audit history.

This prototype is for academic demonstration only and is not intended for real clinical use.
