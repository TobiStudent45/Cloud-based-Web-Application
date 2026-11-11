// impressions microservice: GET /images, GET /images/:key.
// Creates the bucket and seeds it from seed-images on startup.

const express = require("express");
const fs = require("fs");
const path = require("path");
const Minio = require("minio");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SERVICE_NAME = "impressions";

const BUCKET = process.env.MINIO_BUCKET || "impressions";
const minio = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || "minio",
  port: Number(process.env.MINIO_PORT) || 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

const IMAGE_BASE_URL = process.env.IMAGE_BASE_URL || "/api/impressions/images";
const CONTENT_TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: SERVICE_NAME });
});

app.get("/images", async (req, res) => {
  try {
    const keys = [];
    const stream = minio.listObjectsV2(BUCKET, "", true);
    for await (const obj of stream) {
      if (CONTENT_TYPES[path.extname(obj.name).toLowerCase()]) keys.push(obj.name);
    }
    keys.sort();
    res.json(keys.map((key) => ({ key, url: `${IMAGE_BASE_URL}/${encodeURIComponent(key)}` })));
  } catch (err) {
    console.error(`[${SERVICE_NAME}] GET /images:`, err.message);
    res.status(502).json({ error: "Bildspeicher nicht erreichbar." });
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

const SEED_DIR = path.join(__dirname, "seed-images");

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
