-- Owned by the configurator service; applied on every service startup.
CREATE TABLE IF NOT EXISTS configurator_cars (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NOT NULL,
  model_file VARCHAR(180) NOT NULL,
  base_price_cents INT UNSIGNED NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS configurator_choice_prices (
  car_id VARCHAR(64) NOT NULL,
  group_id VARCHAR(40) NOT NULL,
  choice_id VARCHAR(40) NOT NULL,
  price_cents INT UNSIGNED NOT NULL,
  PRIMARY KEY (car_id, group_id, choice_id),
  CONSTRAINT fk_configurator_price_group FOREIGN KEY (car_id, group_id)
    REFERENCES configurator_option_groups(car_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS configurator_configurations (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  car_id VARCHAR(64) NOT NULL,
  configuration JSON NOT NULL,
  total_price_cents BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_configurator_configuration_car (car_id),
  CONSTRAINT fk_configurator_configuration_car FOREIGN KEY (car_id)
    REFERENCES configurator_cars(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
