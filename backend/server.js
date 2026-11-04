/**
 * API Gateway
 * -----------
 * Einziger Eingang für die API. Das Frontend kennt nur diese Adresse und
 * spricht nie direkt mit einem Microservice. Jeder Request auf
 *
 *     /api/<service>/<rest>
 *
 * wird an den passenden Microservice im internen Docker-Netzwerk
 * weitergeleitet. Der Prefix /api/<service> wird dabei entfernt, d.h.
 *
 *     GET  /api/configurator/cars   ->   configurator:3000/cars
 *     POST /api/orders              ->   orders:3000/
 *
 * Fachlogik liegt NICHT hier, nur Routing (API-Gateway-Pattern, Ch.13).
 */

const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();

const PORT = process.env.PORT || 3000;

// ──────────────────────────────────────────────────────────────
// Service-Registry
// Servicename (= Pfad-Segment & Docker-Servicename) -> interne Ziel-URL.
// Container erreichen sich im gemeinsamen Netzwerk über den Servicenamen,
// alle lauschen intern auf Port 3000. Per Env-Variable überschreibbar.
// ──────────────────────────────────────────────────────────────
const SERVICES = {
  configurator:    process.env.CONFIGURATOR_URL    || "http://configurator:3000",
  "product-info":  process.env.PRODUCT_INFO_URL    || "http://product-info:3000",
  merchandise:     process.env.MERCHANDISE_URL     || "http://merchandise:3000",
  cart:            process.env.CART_URL            || "http://cart:3000",
  orders:          process.env.ORDERS_URL          || "http://orders:3000",
  impressions:     process.env.IMPRESSIONS_URL     || "http://impressions:3000",
  road2supercar:   process.env.ROAD2SUPERCAR_URL   || "http://road2supercar:3000",
  ai:              process.env.AI_URL              || "http://ai:3000",
};

// ──────────────────────────────────────────────────────────────
// Für jeden Service einen Proxy unter /api/<service> einhängen.
// pathRewrite entfernt den /api/<service>-Prefix, bevor weitergeleitet wird.
// ──────────────────────────────────────────────────────────────
for (const [name, target] of Object.entries(SERVICES)) {
  app.use(
    `/api/${name}`,
    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: { [`^/api/${name}`]: "" },
      // Fällt ein Service aus, liefern wir 502 statt eines Gateway-Crashs.
      onError(err, req, res) {
        console.error(`[gateway] ${name} nicht erreichbar: ${err.message}`);
        res.status(502).json({
          error: "Bad Gateway",
          service: name,
          message: `Service '${name}' ist derzeit nicht erreichbar.`,
        });
      },
    })
  );
  console.log(`[gateway] /api/${name}  ->  ${target}`);
}

// ──────────────────────────────────────────────────────────────
// Health-Check des Gateways selbst
// ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "gateway", routes: Object.keys(SERVICES) });
});

// Unbekannte /api-Pfade sauber abweisen
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
});

app.listen(PORT, () => {
  console.log(`[gateway] API Gateway läuft auf Port ${PORT}`);
});
