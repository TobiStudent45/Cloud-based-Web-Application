// Page registry: single source for routes and navigation, consumed by server.js.
// Fields: label, path, view (views/pages/<view>.ejs), api (gateway path fetched before
// rendering and exposed as `data`), nav (false hides the entry), detail ({ view, api } for <path>/:id).


module.exports = [
  { label: "Home",          path: "/",              view: "home" },
  { label: "Konfigurator",  path: "/configurator",  view: "configurator",  api: "/configurator/cars" },
  { label: "Merchandise",   path: "/merchandise",   view: "merchandise",   api: "/merchandise/products",
    detail: { view: "merchandise", api: "/merchandise/products/:id" } },
  { label: "Impressionen",  path: "/impressions",   view: "impressions",   api: "/impressions/images" },
  { label: "Road2Supercar", path: "/road2supercar", view: "road2supercar", api: "/road2supercar" },
  { label: "AI Feature",    path: "/ai",            view: "ai",            api: "/ai" },
  { label: "Warenkorb",     path: "/shoppingcart",  view: "shoppingcart",  nav: false },
  { label: "Kasse",         path: "/checkout",      view: "checkout",      nav: false },
  { label: "Bestellung",    path: "/order",         view: "order",         nav: false },
];
