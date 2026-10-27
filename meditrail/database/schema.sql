CREATE DATABASE IF NOT EXISTS meditrail;

USE meditrail;

-- Login accounts for patients and doctors
CREATE TABLE
    IF NOT EXISTS users (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        full_name VARCHAR(120) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM ('PATIENT', 'DOCTOR', 'ADMIN') NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
        session_version INT UNSIGNED NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

-- Patient profile linked to a login account
CREATE TABLE
    IF NOT EXISTS patients (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL UNIQUE,
        patient_code VARCHAR(30) NOT NULL UNIQUE,
        date_of_birth DATE NULL,
        blood_group VARCHAR(5) NULL,
        phone VARCHAR(20) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_patients_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
    );

-- Doctor profile linked to a login account
CREATE TABLE
    IF NOT EXISTS doctors (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL UNIQUE,
        specialty VARCHAR(120) NOT NULL,
        registration_number VARCHAR(100) NULL UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_doctors_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
    );

-- Each consultation belongs to a patient and a doctor
CREATE TABLE
    IF NOT EXISTS consultations (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        patient_id BIGINT UNSIGNED NOT NULL,
        doctor_id BIGINT UNSIGNED NOT NULL,
        consultation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        symptoms TEXT NULL,
        diagnosis TEXT NULL,
        notes TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_consultations_patient_date (patient_id, consultation_date),
        CONSTRAINT fk_consultations_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE RESTRICT,
        CONSTRAINT fk_consultations_doctor FOREIGN KEY (doctor_id) REFERENCES doctors (id) ON DELETE RESTRICT
    );

-- One prescription can belong to a consultation
CREATE TABLE
    IF NOT EXISTS prescriptions (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        consultation_id BIGINT UNSIGNED NOT NULL,
        prescribed_by BIGINT UNSIGNED NOT NULL,
        prescribed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        instructions TEXT NULL,
        CONSTRAINT fk_prescriptions_consultation FOREIGN KEY (consultation_id) REFERENCES consultations (id) ON DELETE RESTRICT,
        CONSTRAINT fk_prescriptions_doctor FOREIGN KEY (prescribed_by) REFERENCES doctors (id) ON DELETE RESTRICT
    );

-- Individual medicines within a prescription
CREATE TABLE
    IF NOT EXISTS prescription_items (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        prescription_id BIGINT UNSIGNED NOT NULL,
        medicine_name VARCHAR(200) NOT NULL,
        dosage VARCHAR(100) NOT NULL,
        frequency VARCHAR(100) NULL,
        duration VARCHAR(100) NULL,
        instructions TEXT NULL,
        CONSTRAINT fk_items_prescription FOREIGN KEY (prescription_id) REFERENCES prescriptions (id) ON DELETE RESTRICT
    );

-- Referral from one doctor to another
CREATE TABLE
    IF NOT EXISTS referrals (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        patient_id BIGINT UNSIGNED NOT NULL,
        referring_doctor_id BIGINT UNSIGNED NOT NULL,
        receiving_doctor_id BIGINT UNSIGNED NOT NULL,
        consultation_id BIGINT UNSIGNED NULL,
        reason TEXT NOT NULL,
        status ENUM ('PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
        referred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_referrals_patient_date (patient_id, referred_at),
        CONSTRAINT fk_referrals_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE RESTRICT,
        CONSTRAINT fk_referrals_referring_doctor FOREIGN KEY (referring_doctor_id) REFERENCES doctors (id) ON DELETE RESTRICT,
        CONSTRAINT fk_referrals_receiving_doctor FOREIGN KEY (receiving_doctor_id) REFERENCES doctors (id) ON DELETE RESTRICT,
        CONSTRAINT fk_referrals_consultation FOREIGN KEY (consultation_id) REFERENCES consultations (id) ON DELETE RESTRICT
    );

-- Record important actions for accountability
CREATE TABLE
    IF NOT EXISTS audit_logs (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id BIGINT UNSIGNED NULL,
        details JSON NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_logs_user_date (user_id, created_at),
        CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
    );

-- Explicit access grants: a doctor can work with a patient only while active.
CREATE TABLE
    IF NOT EXISTS doctor_patient_access (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        patient_id BIGINT UNSIGNED NOT NULL,
        doctor_id BIGINT UNSIGNED NOT NULL,
        granted_by BIGINT UNSIGNED NULL,
        status ENUM ('ACTIVE', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
        granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_doctor_patient_access (patient_id, doctor_id),
        INDEX idx_access_doctor_status (doctor_id, status),
        CONSTRAINT fk_access_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE RESTRICT,
        CONSTRAINT fk_access_doctor FOREIGN KEY (doctor_id) REFERENCES doctors (id) ON DELETE RESTRICT,
        CONSTRAINT fk_access_granted_by FOREIGN KEY (granted_by) REFERENCES users (id) ON DELETE SET NULL
    );
