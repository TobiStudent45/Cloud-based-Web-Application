// Zentrale Seiten-Registry: EINZIGE Stelle fuer Routen + Navigation.
// Neuer Service = ein Eintrag hier + eine View unter views/pages/<view>.ejs.
// label    -> Text im Navigationsmenue
// path     -> URL-Pfad (Express-Route)
// view     -> Dateiname (ohne .ejs) unter views/pages/
// api      -> optional: Gateway-Pfad, den der Fetch-Helfer serverseitig abruft
//             (Ergebnis steht in der View als `data` bereit)

module.exports = [
  { label: "Home",          path: "/",              view: "home" },
  { label: "Konfigurator",  path: "/configurator",  view: "configurator",  api: "/configurator/cars" },
  { label: "Merchandise",   path: "/merchandise",   view: "merchandise",   api: "/merchandise/products" },
  { label: "Impressionen",  path: "/impressions",   view: "impressions",   api: "/impressions" },
  { label: "Road2Supercar", path: "/road2supercar", view: "road2supercar", api: "/road2supercar" },
  { label: "AI Feature",    path: "/ai",            view: "ai",            api: "/ai" },
];
