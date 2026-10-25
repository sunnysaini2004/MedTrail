# MediTrail Entity Relationship Diagram

```mermaid
erDiagram
  USERS ||--o| PATIENTS : owns
  USERS ||--o| DOCTORS : owns
  PATIENTS ||--o{ CONSULTATIONS : has
  DOCTORS ||--o{ CONSULTATIONS : records
  CONSULTATIONS ||--o{ PRESCRIPTIONS : produces
  DOCTORS ||--o{ PRESCRIPTIONS : prescribes
  PRESCRIPTIONS ||--o{ PRESCRIPTION_ITEMS : contains
  PATIENTS ||--o{ REFERRALS : receives
  DOCTORS ||--o{ REFERRALS : refers
  DOCTORS ||--o{ REFERRALS : receives_referral
  CONSULTATIONS o|--o{ REFERRALS : may_support
  PATIENTS ||--o{ DOCTOR_PATIENT_ACCESS : grants_access_to
  DOCTORS ||--o{ DOCTOR_PATIENT_ACCESS : receives_access
  USERS o|--o{ DOCTOR_PATIENT_ACCESS : access_granted_by
  USERS o|--o{ AUDIT_LOGS : performs

  USERS {
    bigint id PK
    varchar full_name
    varchar email UK
    varchar password_hash
    enum role
    boolean is_active
  }
  PATIENTS {
    bigint id PK
    bigint user_id FK
    varchar patient_code UK
    date date_of_birth
    varchar blood_group
    varchar phone
  }
  DOCTORS {
    bigint id PK
    bigint user_id FK
    varchar specialty
    varchar registration_number UK
  }
  CONSULTATIONS {
    bigint id PK
    bigint patient_id FK
    bigint doctor_id FK
    datetime consultation_date
    text symptoms
    text diagnosis
    text notes
  }
  PRESCRIPTIONS {
    bigint id PK
    bigint consultation_id FK
    bigint prescribed_by FK
    timestamp prescribed_at
    text instructions
  }
  PRESCRIPTION_ITEMS {
    bigint id PK
    bigint prescription_id FK
    varchar medicine_name
    varchar dosage
    varchar frequency
    varchar duration
  }
  REFERRALS {
    bigint id PK
    bigint patient_id FK
    bigint referring_doctor_id FK
    bigint receiving_doctor_id FK
    bigint consultation_id FK
    enum status
    text reason
  }
  DOCTOR_PATIENT_ACCESS {
    bigint id PK
    bigint patient_id FK
    bigint doctor_id FK
    bigint granted_by FK
    enum status
  }
  AUDIT_LOGS {
    bigint id PK
    bigint user_id FK
    varchar action
    varchar entity_type
    bigint entity_id
    json details
  }
```

The access table is added by
`database/migrations/001_doctor_patient_access.sql`. A unique patient/doctor
pair is reactivated on a new grant; the audit table retains the change history.
