// Microservice: merchandise
// GET /products, GET /products/:id, GET /images/:key

const express = require("express");
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const Minio = require("minio");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SERVICE_NAME = "merchandise";

const db = mysql.createPool({
  host: process.env.MYSQL_HOST || "mysql",
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || "merchandise",
  connectionLimit: 10,
  decimalNumbers: true,
});

const BUCKET = process.env.MINIO_BUCKET || "merchandise";
const minio = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || "minio",
  port: Number(process.env.MINIO_PORT) || 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

const IMAGE_BASE_URL = process.env.IMAGE_BASE_URL || "/api/merchandise/images";

const PRODUCT_COLUMNS = `
  id, sku, name, short_description, description, category, price, stock,
  color, sizes, image_key, is_featured, created_at, updated_at`;

function toProduct(row) {
  return {
    ...row,
    is_featured: Boolean(row.is_featured),
    in_stock: row.stock > 0,
    image_url: row.image_key ? `${IMAGE_BASE_URL}/${encodeURIComponent(row.image_key)}` : null,
  };
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: SERVICE_NAME });
});

app.get("/products", async (req, res) => {
  try {
    let sql = `SELECT ${PRODUCT_COLUMNS} FROM products WHERE is_active = TRUE`;
    const params = [];
    if (req.query.category) {
      sql += " AND category = ?";
      params.push(req.query.category);
    }
    sql += " ORDER BY name";

    const [rows] = await db.query(sql, params);
    res.json(rows.map(toProduct));
  } catch (err) {
    console.error(`[${SERVICE_NAME}] GET /products:`, err.message);
    res.status(500).json({ error: "Produkte konnten nicht geladen werden." });
  }
});

app.get("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Ungültige Produkt-ID." });
  }
  try {
    const [rows] = await db.query(
      `SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = ? AND is_active = TRUE`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Produkt nicht gefunden." });
    }
    res.json(toProduct(rows[0]));
  } catch (err) {
    console.error(`[${SERVICE_NAME}] GET /products/${id}:`, err.message);
    res.status(500).json({ error: "Produkt konnte nicht geladen werden." });
  }
});

app.get("/images/:key", async (req, res) => {
  const key = req.params.key;
  try {
    const stat = await minio.statObject(BUCKET, key);
    res.set("Content-Type", stat.metaData["content-type"] || "application/octet-stream");
    res.set("Content-Length", stat.size);
    res.set("Cache-Control", "public, max-age=86400");
    const stream = await minio.getObject(BUCKET, key);
    stream.on("error", (err) => {
      console.error(`[${SERVICE_NAME}] Bild-Stream ${key}:`, err.message);
      res.destroy(err);
    });
    stream.pipe(res);
  } catch (err) {
    if (err.code === "NotFound" || err.code === "NoSuchKey") {
      return res.status(404).json({ error: "Bild nicht gefunden." });
    }
    console.error(`[${SERVICE_NAME}] GET /images/${key}:`, err.message);
    res.status(502).json({ error: "Bildspeicher nicht erreichbar." });
  }
});

// Beim Start fehlende Bilder aus seed-images in den Bucket hochladen
const SEED_DIR = path.join(__dirname, "seed-images");
const CONTENT_TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

async function seedImages() {
  if (!(await minio.bucketExists(BUCKET))) {
    await minio.makeBucket(BUCKET);
    console.log(`[${SERVICE_NAME}] Bucket '${BUCKET}' angelegt`);
  }
  if (!fs.existsSync(SEED_DIR)) return;

  const files = fs.readdirSync(SEED_DIR).filter((f) => CONTENT_TYPES[path.extname(f).toLowerCase()]);
  let uploaded = 0;
  for (const file of files) {
    try {
      await minio.statObject(BUCKET, file);
    } catch {
      await minio.fPutObject(BUCKET, file, path.join(SEED_DIR, file), {
        "Content-Type": CONTENT_TYPES[path.extname(file).toLowerCase()],
      });
      uploaded++;
    }
  }
  console.log(`[${SERVICE_NAME}] Startbilder: ${uploaded} hochgeladen, ${files.length - uploaded} schon vorhanden`);
}

async function seedWithRetry(attempts = 10) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await seedImages();
    } catch (err) {
      console.warn(`[${SERVICE_NAME}] MinIO noch nicht bereit (Versuch ${i}/${attempts}): ${err.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  console.error(`[${SERVICE_NAME}] Startbilder konnten nicht hochgeladen werden`);
}

app.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] läuft auf Port ${PORT}`);
  seedWithRetry();
});
