-- Datenbank und Rechte -- Teams legen ihre Tabellen in eigenen Migrations-Skripten an
CREATE DATABASE IF NOT EXISTS carmanufacturer CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON carmanufacturer.* TO 'hhzadmin'@'%';
FLUSH PRIVILEGES;
