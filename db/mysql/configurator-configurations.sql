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
