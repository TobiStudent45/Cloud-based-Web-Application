// cart microservice: JSON only, internal port 3000, reached through the gateway at /api/cart.
// The cart lives in Redis (cache) under cart:<id>; the anonymous id arrives in the x-cart-id header.

const express = require("express");
const Redis = require("ioredis");

const app = express();
app.use(express.json());

const redis = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: Number(process.env.REDIS_PORT) || 6379,
});
const MERCH = process.env.MERCHANDISE_URL || "http://merchandise:3000";
const TTL = 60 * 60 * 24 * 7;
const UUID = /^[0-9a-f-]{36}$/i;

const PORT = process.env.PORT || 3000;
const SERVICE_NAME = "cart";

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: SERVICE_NAME });
});

app.use((req, res, next) => {
  const id = req.get("x-cart-id");
  if (!id || !UUID.test(id)) return res.status(400).json({ error: "Ungültige Warenkorb-ID" });
  req.cartKey = `cart:${id}`;
  next();
});

async function readCart(key) {
  const raw = await redis.hgetall(key);
  const items = Object.values(raw).map((s) => JSON.parse(s));
  const count = items.reduce((n, i) => n + i.quantity, 0);
  const totalCents = items.reduce((n, i) => n + i.unitPriceCents * i.quantity, 0);
  return { items, count, totalCents };
}

async function save(key, item) {
  await redis.hset(key, item.key, JSON.stringify(item));
  await redis.expire(key, TTL);
}

app.get("/", async (req, res, next) => {
  try {
    res.json(await readCart(req.cartKey));
  } catch (err) { next(err); }
});

app.get("/count", async (req, res, next) => {
  try {
    const { count } = await readCart(req.cartKey);
    res.json({ count });
  } catch (err) { next(err); }
});

app.post("/items", async (req, res, next) => {
  try {
    const { type } = req.body || {};
    let item;

    if (type === "merch") {
      const productId = Number(req.body.productId);
      const quantity = Math.min(99, Math.max(1, Math.floor(Number(req.body.quantity)) || 1));
      const size = req.body.size || null;
      if (!Number.isInteger(productId) || productId < 1) {
        return res.status(400).json({ error: "Ungültige Produkt-ID" });
      }
      const r = await fetch(`${MERCH}/products/${productId}`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return res.status(404).json({ error: "Produkt nicht gefunden" });
      const p = await r.json();
      if (!p.in_stock) return res.status(409).json({ error: "Produkt ist ausverkauft" });
      if (Array.isArray(p.sizes) && p.sizes.length && !p.sizes.includes(size)) {
        return res.status(400).json({ error: "Bitte eine gültige Größe wählen" });
      }
      item = {
        key: `merch:${productId}:${size || "-"}`,
        type: "merch",
        productId,
        title: p.name,
        imageUrl: p.image_url,
        size,
        unitPriceCents: Math.round(p.price * 100),
        maxQuantity: Math.max(1, Math.min(99, p.stock)),
        quantity,
      };
      const existing = await redis.hget(req.cartKey, item.key);
      if (existing) item.quantity += JSON.parse(existing).quantity;
      item.quantity = Math.min(item.quantity, item.maxQuantity);
    } else {
      return res.status(400).json({ error: "Unbekannter Artikeltyp" });
    }

    await save(req.cartKey, item);
    res.status(201).json(await readCart(req.cartKey));
  } catch (err) { next(err); }
});

app.patch("/items/:key", async (req, res, next) => {
  try {
    const raw = await redis.hget(req.cartKey, req.params.key);
    if (!raw) return res.status(404).json({ error: "Artikel nicht im Warenkorb" });
    const item = JSON.parse(raw);
    item.quantity = Math.min(item.maxQuantity || 99, Math.max(1, Math.floor(Number(req.body.quantity)) || 1));
    await save(req.cartKey, item);
    res.json(await readCart(req.cartKey));
  } catch (err) { next(err); }
});

app.delete("/items/:key", async (req, res, next) => {
  try {
    await redis.hdel(req.cartKey, req.params.key);
    res.json(await readCart(req.cartKey));
  } catch (err) { next(err); }
});

app.delete("/", async (req, res, next) => {
  try {
    await redis.del(req.cartKey);
    res.json({ items: [], count: 0, totalCents: 0 });
  } catch (err) { next(err); }
});

app.use((err, req, res, next) => {
  if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: "Ungültige Anfrage" });
  console.error(`[${SERVICE_NAME}]`, err);
  res.status(502).json({ error: "Warenkorb konnte nicht aktualisiert werden" });
});

app.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] läuft auf Port ${PORT}`);
});
