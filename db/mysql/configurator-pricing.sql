CREATE TABLE IF NOT EXISTS configurator_choice_prices (
  car_id VARCHAR(64) NOT NULL,
  group_id VARCHAR(40) NOT NULL,
  choice_id VARCHAR(40) NOT NULL,
  price_cents INT UNSIGNED NOT NULL,
  PRIMARY KEY (car_id, group_id, choice_id),
  CONSTRAINT fk_configurator_price_group FOREIGN KEY (car_id, group_id)
    REFERENCES configurator_option_groups(car_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
