-- Creates the shared database and grants; each team creates its tables in its own scripts.
CREATE DATABASE IF NOT EXISTS carmanufacturer CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON carmanufacturer.* TO 'hhzadmin'@'%';
FLUSH PRIVILEGES;
