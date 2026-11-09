CREATE TABLE IF NOT EXISTS configurator_option_groups (
  car_id VARCHAR(64) NOT NULL,
  id VARCHAR(40) NOT NULL,
  label VARCHAR(120) NOT NULL,
  section VARCHAR(16) NOT NULL DEFAULT 'exterior',
  material_names JSON NOT NULL,
  choices JSON NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (car_id, id),
  CONSTRAINT fk_configurator_option_car FOREIGN KEY (car_id)
    REFERENCES configurator_cars(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
