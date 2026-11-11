-- Merchandise service: own database. Runs on first start with an empty MySQL volume.
-- File must stay UTF-8, otherwise the mysql client reads it as latin1 and breaks umlauts.
-- Image credits: db/minio/merchandise/QUELLEN.md
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS merchandise CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON merchandise.* TO 'hhzadmin'@'%';
FLUSH PRIVILEGES;

USE merchandise;

CREATE TABLE IF NOT EXISTS products (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  sku               VARCHAR(50)   NOT NULL UNIQUE  COMMENT 'Artikelnummer',
  name              VARCHAR(255)  NOT NULL,
  short_description VARCHAR(255)                   COMMENT 'Teaser für Produktkarten',
  description       TEXT                           COMMENT 'Langtext für die Detailansicht',
  category          VARCHAR(50)   NOT NULL         COMMENT 'z. B. Bekleidung, Accessoires, Lifestyle',
  price             DECIMAL(10,2) NOT NULL         COMMENT 'Preis in EUR inkl. MwSt.',
  stock             INT           NOT NULL DEFAULT 0,
  color             VARCHAR(50),
  sizes             JSON                           COMMENT 'Verfügbare Größen, NULL = keine Größen',
  image_key         VARCHAR(500)                   COMMENT 'Objekt-Key im MinIO-Bucket "merchandise"',
  is_featured       BOOLEAN       NOT NULL DEFAULT FALSE COMMENT 'Auf der Startseite hervorheben',
  is_active         BOOLEAN       NOT NULL DEFAULT TRUE  COMMENT 'FALSE = im Shop ausgeblendet',
  created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO products (sku, name, short_description, description, category, price, stock, color, sizes, image_key, is_featured) VALUES
  ('AD-CAP-001', 'Racing Cap',
   'Baseball-Cap im Washed-Look mit gesticktem Logo.',
   'Six-Panel-Cap aus stonewashed Baumwolle mit Ton-in-Ton-Stickerei des Aetheria-Dynamics-Logos auf der Front. Vorgebogener Schirm, verstellbarer Riemen, Einheitsgröße.',
   'Bekleidung', 29.90, 50, 'Grau', NULL, 'yang-deng-2loKxdi6Hmo-unsplash.jpg', TRUE),

  ('AD-TSH-001', 'Tshirt Leisure',
   'Lässiges Shirt aus Bio-Baumwolle.',
   'Relaxed-Fit T-Shirt aus 100 % Bio-Baumwolle (180 g/m²). Dezenter Logo-Print im Nacken, perfekt für den Sommer am Steuer.',
   'Bekleidung', 39.90, 120, 'Hellgrau', '["S","M","L","XL","XXL"]', 'abolfazl-babaei-8W0pdiCVqdw-unsplash.jpg', FALSE),

  ('AD-HOD-001', 'Team Hoodie',
   'Schwarzer Hoodie mit Print auf der Brust.',
   'Kapuzenpullover aus Baumwoll-Polyester-Mix mit angerautem Innenfutter, Kordelzug und Kängurutasche. Großer Print in Signal-Orange auf der Brust.',
   'Bekleidung', 79.90, 60, 'Schwarz', '["S","M","L","XL"]', 'marcel-strauss-q8xWifxWYfM-unsplash.jpg', TRUE),

  ('AD-JKT-001', 'Jacke Classic',
   'Overshirt-Jacke mit Karomuster.',
   'Hemdjacke (Overshirt) aus festem Jacquard mit Karomuster in Grau und Schwarz. Druckknopfleiste, klassischer Hemdkragen, lässt sich offen oder geschlossen tragen.',
   'Bekleidung', 149.00, 25, 'Grau/Schwarz', '["S","M","L","XL","XXL"]', 'praise-judah-puqRAxHMWNU-unsplash.jpg', FALSE),

  ('AD-KEY-001', 'Schlüsselanhänger Metall',
   'Edelstahl-Anhänger in Fahrzeugform.',
   'Schlüsselanhänger aus gebürstetem Edelstahl in Form einer Fahrzeugsilhouette, mit stabilem Schlüsselring. Passt zu jedem Fahrzeugschlüssel.',
   'Accessoires', 34.90, 80, 'Silber', NULL, 'erik-mclean-PKwmiy1JafE-unsplash.jpg', FALSE),

  ('AD-UMB-001', 'Regenschirm',
   'Heller Schirm für Regen und Sonne.',
   'Regenschirm mit weißem Bezug und schwarzem Griff, windfestes Fiberglas-Gestell. Schützt bei Regen und spendet Schatten an sonnigen Tagen.',
   'Accessoires', 49.90, 35, 'Weiß', NULL, 'takashi-sakamoto-hXfCmfmUPt0-unsplash.jpg', FALSE),

  ('AD-BAG-001', 'Leder Shopper',
   'Große Ledertasche für Alltag und Reise.',
   'Shopper aus schwarzem Glattleder mit zwei stabilen Henkeln und Innenfach mit Reißverschluss. Bietet Platz für Laptop, Dokumente und alles für die Fahrt.',
   'Accessoires', 219.00, 10, 'Schwarz', NULL, 'marlon-silva-3lOrwq1JMfM-unsplash.jpg', TRUE),

  ('AD-PST-001', 'Poster Golden Hour',
   'Fotodruck eines Supersportwagens im Abendlicht.',
   'Hochwertiger Fotodruck (50 × 70 cm) eines weißen Supersportwagens mit Heckflügel im warmen Licht der untergehenden Sonne, auf 200 g/m² Fine-Art-Papier. Ohne Rahmen.',
   'Lifestyle', 29.90, 5, 'Weiß/Gold', NULL, 'pexels-wearelivingart-8237006.jpg', FALSE);
