// Frontend (Presentation Tier) – Port 80.
// Routen werden datengetrieben aus config/pages.js erzeugt: eine Schleife
// fuer alle Seiten, kein wiederholter Boilerplate pro Seite. Jede Seite erbt
// automatisch Layout + Navigation. Hat eine Seite ein `api`-Feld, holt der
// Server die Daten vom Gateway und uebergibt sie als `data` an die View.

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

// Navigation steht in allen Views zur Verfuegung (res.locals)
app.use((req, res, next) => {
  res.locals.nav = pages.filter((p) => p.nav !== false);
  res.locals.currentPath = req.path;
  next();
});

// /api/... an das Gateway weiterleiten (z. B. Produktbilder)
app.get("/api/*", async (req, res) => {
  try {
    const upstream = await fetch(`${GATEWAY_URL}${req.originalUrl}`, { signal: AbortSignal.timeout(10000) });
    res.status(upstream.status);
    for (const h of ["content-type", "content-length", "cache-control"]) {
      const v = upstream.headers.get(h);
      if (v) res.set(h, v);
    }
    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    res.status(502).json({ error: "Gateway nicht erreichbar", message: err.message });
  }
});

// Eine Route pro Config-Eintrag
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
