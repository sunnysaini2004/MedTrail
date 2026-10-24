# MediTrail

**A Digital Patient Medical Record and Referral Management System**

> One Patient. One Connected Treatment Journey.

MediTrail is an academic full-stack web application concept designed to help patients and authorized healthcare professionals maintain a connected treatment journey, including consultations, prescriptions, referrals, and medical documents.

## Project status

🚧 **Currently in initial scaffold and planning.** Features will be implemented step by step as part of an MCA mini-project. It is not a production healthcare system.

## Planned technology stack

- **Frontend:** React.js, Vite, Tailwind CSS, React Router
- **Backend:** Node.js, Express.js, REST APIs
- **Database:** MySQL 8
- **Database driver:** mysql2
- **Tools:** VS Code, Git, GitHub, Postman

## Planned modules

- Patient registration and profile
- Doctor and administrator account management
- Consultations and clinical notes
- Prescriptions and medicine history
- Doctor-to-doctor referrals
- Authorized medical document access
- Patient treatment timeline
- Audit events and dashboard summaries

## Repository structure

```text
MedTrail/
├── meditrail/
│   ├── client/       # React frontend
│   ├── server/       # Express backend
│   ├── database/     # Planned migrations and seed data
│   ├── docs/         # Requirements, architecture, API and testing notes
│   ├── .gitignore
│   └── README.md
└── README.md         # Repository landing page
```

## Development approach

The project will be built incrementally:
1. Finalize API and database specifications.
2. Set up the React + Vite frontend.
3. Build responsive UI and patient registration.
4. Implement Express APIs and MySQL integration.
5. Add authentication, role-based access, and the treatment workflow.
6. Test and document the application.

## Safety and privacy

- Use **synthetic demo data only**. Do not use real patient records in development or public demos.
- Never commit passwords, tokens, `.env` files, or other secrets.
- Medical records and documents must require server-side authorization.
- This academic prototype is not intended for real-world clinical use.

## Getting started

Implementation and local setup instructions will be added as each development phase is completed.