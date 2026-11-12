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
