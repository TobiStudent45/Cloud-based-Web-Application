// Frontend (Presentation Tier) – Port 80.
// Routen werden datengetrieben aus config/pages.js erzeugt: eine Schleife
// fuer alle Seiten, kein wiederholter Boilerplate pro Seite. Jede Seite erbt
// automatisch Layout + Navigation. Hat eine Seite ein `api`-Feld, holt der
// Server die Daten vom Gateway und uebergibt sie als `data` an die View.

const express = require("express");
const layouts = require("express-ejs-layouts");
const path = require("path");
const pages = require("./config/pages");
const { fetchFromGateway } = require("./lib/gateway");

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
}

app.listen(PORT, () => console.log(`[frontend] Web-UI laeuft auf Port ${PORT}`));
