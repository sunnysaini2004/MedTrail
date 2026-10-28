CREATE TABLE IF NOT EXISTS hospital_settings (
    id TINYINT UNSIGNED PRIMARY KEY,
    hospital_name VARCHAR(160) NULL,
    official_email VARCHAR(254) NULL,
    contact_phone VARCHAR(30) NULL,
    address VARCHAR(500) NULL,
    working_hours VARCHAR(250) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_hospital_settings_singleton CHECK (id = 1)
) ENGINE=InnoDB;
