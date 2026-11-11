// orders microservice: JSON only, internal port 3000, reached through the gateway at /api/orders.
// An order is only persisted (MySQL) at checkout; the cart is read from, then cleared in, the cart service (Redis).

const express = require("express");
const mysql = require("mysql2/promise");
const { randomUUID } = require("crypto");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SERVICE_NAME = "orders";
const CART = process.env.CART_URL || "http://cart:3000";
const UUID = /^[0-9a-f-]{36}$/i;

const db = mysql.createPool({
  host: process.env.MYSQL_HOST || "mysql",
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || "carmanufacturer",
});

async function init() {
  await db.query(`CREATE TABLE IF NOT EXISTS orders (
    id CHAR(36) PRIMARY KEY,
    customer_name VARCHAR(120) NOT NULL,
    email VARCHAR(160) NOT NULL,
    phone VARCHAR(40) NULL,
    street VARCHAR(160) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    city VARCHAR(100) NOT NULL,
    country VARCHAR(80) NOT NULL,
    total_cents BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id CHAR(36) NOT NULL,
    item_type VARCHAR(20) NOT NULL,
    title VARCHAR(200) NOT NULL,
    details JSON NULL,
    unit_price_cents BIGINT UNSIGNED NOT NULL,
    quantity INT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  )`);
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: SERVICE_NAME });
});

app.post("/", async (req, res, next) => {
  try {
    const cartId = req.get("x-cart-id");
    if (!cartId || !UUID.test(cartId)) return res.status(400).json({ error: "Ungültige Warenkorb-ID" });

    const b = req.body || {};
    const labels = { name: "Name", email: "E-Mail", street: "Straße", postalCode: "PLZ", city: "Stadt", country: "Land" };
    for (const [field, label] of Object.entries(labels)) {
      if (!String(b[field] || "").trim()) return res.status(400).json({ error: `Bitte ausfüllen: ${label}` });
    }
    if (!/^\S+@\S+\.\S+$/.test(b.email.trim())) return res.status(400).json({ error: "Ungültige E-Mail-Adresse" });

    const cartRes = await fetch(`${CART}/`, { headers: { "x-cart-id": cartId }, signal: AbortSignal.timeout(5000) });
    if (!cartRes.ok) return res.status(502).json({ error: "Warenkorb nicht erreichbar" });
    const cart = await cartRes.json();
    if (!cart.items.length) return res.status(400).json({ error: "Der Warenkorb ist leer" });

    const orderId = randomUUID();
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `INSERT INTO orders (id, customer_name, email, phone, street, postal_code, city, country, total_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, b.name.trim(), b.email.trim(), String(b.phone || "").trim() || null,
          b.street.trim(), b.postalCode.trim(), b.city.trim(), b.country.trim(), cart.totalCents]
      );
      for (const i of cart.items) {
        const details = { productId: i.productId, size: i.size };
        await conn.execute(
          `INSERT INTO order_items (order_id, item_type, title, details, unit_price_cents, quantity)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [orderId, i.type, i.title, JSON.stringify(details), i.unitPriceCents, i.quantity]
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    // Only after the commit is the cart removed from the cache.
    await fetch(`${CART}/`, { method: "DELETE", headers: { "x-cart-id": cartId } }).catch(() => {});
    res.status(201).json({ orderId });
  } catch (err) { next(err); }
});

app.get("/:id", async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: "Bestellung nicht gefunden" });
    const [orders] = await db.execute("SELECT * FROM orders WHERE id = ?", [req.params.id]);
    if (!orders.length) return res.status(404).json({ error: "Bestellung nicht gefunden" });
    const [items] = await db.execute("SELECT * FROM order_items WHERE order_id = ?", [req.params.id]);
    res.json({ ...orders[0], items });
  } catch (err) { next(err); }
});

app.use((err, req, res, next) => {
  console.error(`[${SERVICE_NAME}]`, err);
  res.status(500).json({ error: "Bestellung konnte nicht verarbeitet werden" });
});

init()
  .then(() => app.listen(PORT, () => console.log(`[${SERVICE_NAME}] läuft auf Port ${PORT}`)))
  .catch((err) => { console.error(err); process.exit(1); });
