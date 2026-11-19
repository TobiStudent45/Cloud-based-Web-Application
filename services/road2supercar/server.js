// road2supercar microservice: JSON only, internal port 3000, reached through the gateway at /api/road2supercar.
// The 3D show itself (forest, drive, exhibition) is drawn in the browser. This service keeps the show statistics
// in Redis, shared by all visitors:
//   GET  /show         -> { visitors, photos, topCar }   (topCar = most shown car)
//   POST /show/visit   -> { carName }   one visitor watched the show with this car
//   POST /show/photos  -> { count }     the photographers took this many pictures (batched by the browser)
// Redis keys: r2s:visitors (counter), r2s:photos (counter), r2s:cars (sorted set: car name -> times shown).

const express = require("express");
const Redis = require("ioredis");

const app = express();
app.use(express.json({ limit: "2kb" }));

const redis = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: Number(process.env.REDIS_PORT) || 6379,
});
const PORT = process.env.PORT || 3000;
const SERVICE_NAME = "road2supercar";
const MAX_PHOTOS_PER_REQUEST = 60;

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: SERVICE_NAME });
});

async function stats() {
  const [visitors, photos, top] = await Promise.all([
    redis.get("r2s:visitors"),
    redis.get("r2s:photos"),
    redis.zrevrange("r2s:cars", 0, 0, "WITHSCORES"),
  ]);
  return {
    visitors: Number(visitors) || 0,
    photos: Number(photos) || 0,
    topCar: top.length ? { name: top[0], count: Number(top[1]) } : null,
  };
}

app.get("/show", async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store").json(await stats());
  } catch (err) { next(err); }
});

app.post("/show/visit", async (req, res, next) => {
  try {
    const name = typeof req.body?.carName === "string" ? req.body.carName.trim().slice(0, 60) : "";
    if (!name) return res.status(400).json({ error: "carName fehlt." });
    await redis.multi().incr("r2s:visitors").zincrby("r2s:cars", 1, name).exec();
    res.status(201).json(await stats());
  } catch (err) { next(err); }
});

app.post("/show/photos", async (req, res, next) => {
  try {
    const count = Math.floor(Number(req.body?.count));
    if (!Number.isFinite(count) || count < 1 || count > MAX_PHOTOS_PER_REQUEST) {
      return res.status(400).json({ error: `count muss zwischen 1 und ${MAX_PHOTOS_PER_REQUEST} liegen.` });
    }
    await redis.incrby("r2s:photos", count);
    res.status(201).json(await stats());
  } catch (err) { next(err); }
});

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Ungültiges JSON." });
  console.error(`[${SERVICE_NAME}]`, err.message);
  res.status(503).json({ error: "Road2Supercar derzeit nicht verfügbar." });
});

app.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] läuft auf Port ${PORT}`);
});
