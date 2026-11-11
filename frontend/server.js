// Frontend server (presentation tier): renders the EJS views for the routes in config/pages.js
// and proxies /api/* to the gateway. It never talks to a service directly.

const express = require("express");
const layouts = require("express-ejs-layouts");
const path = require("path");
const pages = require("./config/pages");
const { Readable } = require("stream");
const { fetchFromGateway, GATEWAY_URL } = require("./lib/gateway");

const app = express();
const PORT = process.env.PORT || 80;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(layouts);
app.set("layout", "layouts/mainLayout");
app.use(express.static(path.join(__dirname, "public")));
app.get("/vendor/model-viewer.min.js", (req, res) => {
  res.sendFile(path.join(__dirname, "node_modules/@google/model-viewer/dist/model-viewer.min.js"));
});

app.use((req, res, next) => {
  res.locals.nav = pages.filter((p) => p.nav !== false);
  res.locals.currentPath = req.path;
  next();
});

app.all("/api/*", async (req, res) => {
  try {
    const isModel = /^\/api\/configurator\/cars\/[^/]+\/model$/.test(req.path);
    const headers = {};
    for (const name of ["range", "if-range", "if-none-match", "if-modified-since", "content-type"]) {
      if (req.headers[name]) headers[name] = req.headers[name];
    }
    const upstream = await fetch(`${GATEWAY_URL}${req.originalUrl}`, {
      headers, method: req.method,
      ...(!["GET", "HEAD"].includes(req.method) ? { body: req, duplex: "half" } : {}),
      signal: AbortSignal.timeout(isModel ? 120000 : 10000),
    });
    res.status(upstream.status);
    for (const h of ["content-type", "content-length", "cache-control", "content-range", "accept-ranges", "etag", "last-modified", "location", "content-disposition"]) {
      const v = upstream.headers.get(h);
      if (v) res.set(h, v);
    }
    if (!upstream.body) return res.end();
    const body = Readable.fromWeb(upstream.body);
    body.on("error", (err) => res.destroy(err));
    res.on("close", () => body.destroy());
    body.pipe(res);
  } catch (err) {
    if (res.headersSent) return res.destroy(err);
    res.status(502).json({ error: "Gateway nicht erreichbar", message: err.message });
  }
});

for (const page of pages) {
  app.get(page.path, async (req, res) => {
    let data = null;
    let apiError = null;
    if (page.api) {
      const result = await fetchFromGateway(page.api);
      data = result.data;
      apiError = result.ok ? null : result.error;
    }
    res.render(`pages/${page.view}`, { title: page.label, data, apiError });
  });

  if (page.detail) {
    app.get(`${page.path}/:id`, async (req, res) => {
      const result = await fetchFromGateway(page.detail.api.replace(":id", encodeURIComponent(req.params.id)));
      if (!result.ok && ["Status 400", "Status 404"].includes(result.error)) {
        return res.status(404).render(`pages/${page.detail.view}`, {
          title: page.label, data: null, apiError: "Nicht gefunden", backPath: page.path,
        });
      }
      res.render(`pages/${page.detail.view}`, {
        title: result.data?.name || page.label,
        data: result.data,
        apiError: result.ok ? null : result.error,
        backPath: page.path,
      });
    });
  }
}

app.listen(PORT, () => console.log(`[frontend] Web-UI laeuft auf Port ${PORT}`));
