-- Additive migration: explicit grants are required before doctors can access a patient.
CREATE TABLE IF NOT EXISTS doctor_patient_access (
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
