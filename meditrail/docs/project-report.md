# MediTrail Project Report Draft

## Title

**MediTrail: A Digital Patient Medical Record and Referral Management System**

## Abstract

MediTrail is an academic full-stack prototype for organizing a patient's
consultations, prescriptions, and referrals in one treatment timeline. It uses
a React/Vite client, a Node.js/Express API, and MySQL. Patients create accounts
through public registration; administrators provision doctor accounts and
grant or revoke doctor access. Server-side role and access checks protect
patient records. The prototype uses synthetic data and is not intended for
clinical use.

## Problem statement

Patient information can be fragmented across separate consultation notes,
prescription records, and referrals. MediTrail demonstrates a structured
application model for linking these records to a patient and controlling which
doctors may work with them.

## Objectives

- Provide patient registration and authenticated account access.
- Store a patient profile linked to a shared user account.
- Allow controlled doctor account creation and patient access grants.
- Record consultations, prescriptions, and doctor-to-doctor referrals.
- Show the patient's own treatment history from database records.
- Record important account, access, and treatment changes in audit logs.

## Scope and limitations

The current prototype covers patient, administrator, and doctor workflows for
synthetic local data. It does not implement medical document storage, patient
consent capture, password recovery, multi-factor authentication, deployment
hardening, or clinical integrations. A short-lived stateless cookie token
cannot be revoked server-side before expiry. The project is not a medical
device, clinical record system, or production-ready service.

## Technology and architecture

- Frontend: React, Vite, React Router, Tailwind CSS, and existing custom CSS.
- Backend: Node.js, Express, bcryptjs, jsonwebtoken, cookie-parser, and mysql2.
- Database: MySQL 8 with foreign keys and parameterized queries.
- Authentication: 15-minute JWT in an HttpOnly, SameSite=Lax cookie.
- Authorization: role middleware plus active doctor/patient access grants.

See `architecture.md` and `er-diagram.md` for the data flow and schema.

## Implementation summary

The patient registration transaction writes the account, profile, and audit
event together. Public registration always assigns the patient role. Admins
create doctor accounts and manage explicit access grants. Doctor workflows
record consultations, prescriptions, and referrals; accepting a referral
grants the receiving doctor access. Patient dashboard queries scope data from
the authenticated user's patient profile.

## Verification evidence

The frontend production build has been run successfully. Backend smoke checks
exercise authentication, validation, role restrictions, doctor provisioning,
access grants, consultation and prescription creation, referral status
transitions, revocation, and the patient timeline using temporary synthetic
accounts that are removed after the checks.

## Conclusion and future work

MediTrail demonstrates a connected patient record flow with role-based access
and an auditable referral process. Future work includes consent capture,
document storage, password recovery, stronger session revocation and
deployment controls, broader automated UI tests, and a formal privacy/security
review before any real-world use.
