// configurator microservice. The schema is re-applied on every startup because DB init scripts
// only run for a fresh volume. Catalog file names are validated so they cannot leave the model directory.

const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const mysql = require("mysql2/promise");
const optionGroups = require("./options");
const priceCatalog = require("./pricing-catalog");
const { randomUUID } = require("crypto");
const { ConfigurationError, uuidPattern, parseRequest, createQuote, sameRequest } = require("./pricing");

const app = express();
app.use(express.json({ limit: "64kb" }));
const PORT = process.env.PORT || 3000;
const MODEL_DIRECTORY = path.resolve(process.env.MODEL_DIRECTORY || path.join(__dirname, "models"));
const db = mysql.createPool({
  host: process.env.MYSQL_HOST || "mysql",
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || "carmanufacturer",
  connectionLimit: 5,
});

async function findCars(id) {
  const [rows] = await db.execute(
    "SELECT id, name, description, model_file, base_price_cents FROM configurator_cars" +
      (id ? " WHERE id = ?" : " ORDER BY sort_order, id"),
    id ? [id] : []
  );
  return rows;
}

async function findGroups(carId) {
  const [rows] = await db.execute(
    "SELECT id, label, section, material_names, choices FROM configurator_option_groups WHERE car_id = ? ORDER BY sort_order, id", [carId]
  );
  const [prices] = await db.execute(
    "SELECT group_id, choice_id, price_cents FROM configurator_choice_prices WHERE car_id = ?", [carId]
  );
  const byChoice = new Map(prices.map((price) => [price.group_id + "\0" + price.choice_id, price.price_cents == null ? null : Number(price.price_cents)]));
  return rows.map((row) => ({
    id: row.id, label: row.label, section: row.section,
    materialNames: typeof row.material_names === "string" ? JSON.parse(row.material_names) : row.material_names,
    choices: (typeof row.choices === "string" ? JSON.parse(row.choices) : row.choices).map((choice) => ({
      ...choice, priceCents: byChoice.get(row.id + "\0" + choice.id) ?? null,
    })),
  }));
}

async function findConfiguration(id) {
  const [rows] = await db.execute("SELECT configuration FROM configurator_configurations WHERE id = ?", [id]);
  if (!rows.length) return null;
  return typeof rows[0].configuration === "string" ? JSON.parse(rows[0].configuration) : rows[0].configuration;
}

function modelPath(car) {
  if (!/^[a-zA-Z0-9_-]+\.glb$/.test(car.model_file)) {
    throw new Error("Invalid catalog model filename");
  }
  return path.join(MODEL_DIRECTORY, car.model_file);
}

async function toCar(car) {
  let available = false;
  try {
    available = (await fs.stat(modelPath(car))).isFile();
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  return {
    id: car.id,
    name: car.name,
    description: car.description,
    modelUrl: "/api/configurator/cars/" + encodeURIComponent(car.id) + "/model",
    available,
    basePriceCents: car.base_price_cents == null ? null : Number(car.base_price_cents),
    currency: "EUR", pricingType: "demo",
  };
}

app.get("/health", async (req, res, next) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok", service: "configurator" });
  } catch (err) { next(err); }
});

app.get("/cars", async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await Promise.all((await findCars()).map(toCar)));
  } catch (err) { next(err); }
});

app.get("/cars/:id/model", async (req, res, next) => {
  try {
    const [car] = await findCars(req.params.id);
    if (!car) return res.status(404).json({ error: "Fahrzeug nicht gefunden." });
    res.type("model/gltf-binary");
    res.sendFile(modelPath(car), { maxAge: 0 }, (err) => {
      if (!err) return;
      if (res.headersSent) return next(err);
      if (err.code === "ENOENT" || err.status === 404) {
        return res.status(404).json({ error: "Die 3D-Datei wurde noch nicht hinterlegt." });
      }
      next(err);
    });
  } catch (err) { next(err); }
});

app.get("/cars/:id", async (req, res, next) => {
  try {
    const [car] = await findCars(req.params.id);
    if (!car) return res.status(404).json({ error: "Fahrzeug nicht gefunden." });
    res.set("Cache-Control", "no-store").json(await toCar(car));
  } catch (err) { next(err); }
});

app.get("/cars/:id/options", async (req, res, next) => {
  try {
    const [car] = await findCars(req.params.id);
    if (!car) return res.status(404).json({ error: "Fahrzeug nicht gefunden." });
    res.set("Cache-Control", "no-store").json({
      carId: car.id, currency: "EUR", pricingType: "demo",
      basePriceCents: car.base_price_cents == null ? null : Number(car.base_price_cents),
      groups: await findGroups(car.id),
    });
  } catch (err) { next(err); }
});

async function quoteRequest(request) {
  const [car] = await findCars(request.carId);
  if (!car) throw new ConfigurationError("Fahrzeug nicht gefunden.", 404);
  return createQuote(car, await findGroups(car.id), request.selections);
}

app.post("/quote", async (req, res, next) => {
  try {
    const quote = await quoteRequest(parseRequest(req.body));
    res.set("Cache-Control", "no-store").json(quote);
  } catch (err) { next(err); }
});

app.post("/configurations", async (req, res, next) => {
  try {
    const request = parseRequest(req.body, true);
    const id = request.requestId || randomUUID();
    const respondExisting = (snapshot) => {
      if (!sameRequest(snapshot, request)) throw new ConfigurationError("Diese Speicher-ID wurde bereits für eine andere Auswahl verwendet.", 409);
      return res.set("Cache-Control", "no-store").location("/api/configurator/configurations/" + id).json(snapshot);
    };
    if (request.requestId) {
      const existing = await findConfiguration(id);
      if (existing) return respondExisting(existing);
    }
    const snapshot = { ...await quoteRequest(request), id, createdAt: new Date().toISOString() };
    try {
      await db.execute(
        "INSERT INTO configurator_configurations (id, car_id, configuration, total_price_cents) VALUES (?, ?, ?, ?)",
        [id, request.carId, JSON.stringify(snapshot), snapshot.totals.totalPriceCents]
      );
    } catch (err) {
      if (err.code !== "ER_DUP_ENTRY") throw err;
      const existing = await findConfiguration(id);
      if (!existing) throw err;
      return respondExisting(existing);
    }
    res.status(201).set("Cache-Control", "no-store").location("/api/configurator/configurations/" + id).json(snapshot);
  } catch (err) { next(err); }
});

app.get("/configurations/:id", async (req, res, next) => {
  try {
    if (!uuidPattern.test(req.params.id)) throw new ConfigurationError("Konfiguration nicht gefunden.", 404);
    const snapshot = await findConfiguration(req.params.id);
    if (!snapshot) throw new ConfigurationError("Konfiguration nicht gefunden.", 404);
    if (req.query.download === "1") res.attachment("konfiguration-" + snapshot.id + ".json");
    res.set("Cache-Control", "no-store").type("application/json").send(JSON.stringify(snapshot, null, 2));
  } catch (err) { next(err); }
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof ConfigurationError) return res.status(err.status).json({ error: err.message });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Ungültiges JSON." });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Die Konfiguration ist zu groß." });
  console.error("[configurator]", err.message);
  res.status(503).json({ error: "Konfigurator derzeit nicht verfügbar." });
});

async function start() {
  const schemaPath = process.env.CATALOG_SCHEMA_PATH || path.join(__dirname, "../../db/mysql/configurator.sql");
  for (const file of [schemaPath, ...["configurator-options.sql", "configurator-pricing.sql", "configurator-configurations.sql"].map((name) => path.join(path.dirname(schemaPath), name))]) {
    await db.query(await fs.readFile(file, "utf8"));
  }
  const [sectionColumn] = await db.query("SHOW COLUMNS FROM configurator_option_groups LIKE 'section'");
  if (!sectionColumn.length) {
    await db.query("ALTER TABLE configurator_option_groups ADD COLUMN section VARCHAR(16) NOT NULL DEFAULT 'exterior'");
  }
  const [priceColumn] = await db.query("SHOW COLUMNS FROM configurator_cars LIKE 'base_price_cents'");
  if (!priceColumn.length) await db.query("ALTER TABLE configurator_cars ADD COLUMN base_price_cents INT UNSIGNED NULL");
  await db.execute(
    "INSERT IGNORE INTO configurator_cars (id, name, description, model_file, sort_order) VALUES " +
      "(?, ?, ?, ?, ?), (?, ?, ?, ?, ?)",
    [
      "lambo", "Lambo", "Entdecke das Fahrzeug aus jeder Perspektive.", "Lambo.glb", 1,
      "beetle", "Beetle", "Ein Klassiker, ganz nach deinem Stil.", "Beetle-web.glb", 2,
    ]
  );
  await db.execute("DELETE FROM configurator_cars WHERE id = ? AND name = ? AND model_file = ?",
    ["model-2", "Fahrzeug 2", "model-2.glb"]);
  await db.execute("DELETE FROM configurator_option_groups WHERE id = ?", ["interior-stitching"]);
  for (const [carId, groups] of Object.entries(optionGroups)) {
    await db.execute("UPDATE configurator_cars SET base_price_cents = ? WHERE id = ? AND base_price_cents IS NULL", [priceCatalog[carId].basePriceCents, carId]);
    for (const [index, group] of groups.entries()) {
      await db.execute(
        "INSERT IGNORE INTO configurator_option_groups (car_id, id, label, section, material_names, choices, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [carId, group.id, group.label, group.section || "exterior", JSON.stringify(group.materialNames), JSON.stringify(group.choices), index]
      );
      for (const choice of group.choices) {
        const price = choice.id === "original" ? 0 : priceCatalog[carId].extras[group.id]?.[choice.id];
        if (!Number.isSafeInteger(price) || price < 0) throw new Error("Missing demo price: " + carId + "/" + group.id + "/" + choice.id);
        await db.execute(
          "INSERT IGNORE INTO configurator_choice_prices (car_id, group_id, choice_id, price_cents) VALUES (?, ?, ?, ?)",
          [carId, group.id, choice.id, price]
        );
      }
    }
  }
  return app.listen(PORT, () => console.log("[configurator] läuft auf Port " + PORT));
}

if (require.main === module) {
  start().catch(async (err) => {
    console.error("[configurator] Start fehlgeschlagen:", err.message);
    await db.end();
    process.exitCode = 1;
  });
}

module.exports = { app, start, db };
