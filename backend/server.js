// API gateway: the only entry point to the services. Proxies /api/<service>/<rest> to
// <service>:3000/<rest> inside the Docker network. Routing only, no business logic.

const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();

const PORT = process.env.PORT || 3000;

const SERVICES = {
  configurator:    process.env.CONFIGURATOR_URL    || "http://configurator:3000",
  productinfo:     process.env.PRODUCT_INFO_URL    || "http://productinfo:3000",
  merchandise:     process.env.MERCHANDISE_URL     || "http://merchandise:3000",
  cart:            process.env.CART_URL            || "http://cart:3000",
  orders:          process.env.ORDERS_URL          || "http://orders:3000",
  impressions:     process.env.IMPRESSIONS_URL     || "http://impressions:3000",
  road2supercar:   process.env.ROAD2SUPERCAR_URL   || "http://road2supercar:3000",
  ai:              process.env.AI_URL              || "http://ai:3000",
};

for (const [name, target] of Object.entries(SERVICES)) {
  app.use(
    `/api/${name}`,
    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: { [`^/api/${name}`]: "" },
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

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "gateway", routes: Object.keys(SERVICES) });
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
});

app.listen(PORT, () => {
  console.log(`[gateway] API Gateway läuft auf Port ${PORT}`);
});
