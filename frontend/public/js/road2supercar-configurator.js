// Road2Supercar add-on for the configurator page (kept separate so configurator.js stays untouched).
// Once a configuration is saved, the configurator shows the link #open-car-configuration (?configuration=<id>).
// This script mirrors it: it shows the button "Mit diesem Auto auf die Strecke" and remembers the id in the
// browser (localStorage), so /road2supercar can also be opened directly later and still drives this car.

const open = document.querySelector("#open-car-configuration");
const road = document.querySelector("#road-open");

if (open && road) {
  const sync = () => {
    const id = open.hidden ? null : new URL(open.href || location.href, location.href).searchParams.get("configuration");
    if (!id) {
      road.hidden = true;
      return;
    }
    try { localStorage.setItem("r2s-configuration", id); } catch { /* storage may be blocked */ }
    road.href = "/road2supercar?configuration=" + encodeURIComponent(id);
    road.hidden = false;
  };
  new MutationObserver(sync).observe(open, { attributes: true, attributeFilter: ["hidden", "href"] });
  sync();
}
