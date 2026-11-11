export const formatPrice = (cents) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

function stable(value) {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stable(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
const fingerprint = ({ id, createdAt, ...quote }) => stable(quote);

export function createPricing(root) {
  const base = root.querySelector("#configuration-base-price");
  const extras = root.querySelector("#configuration-extras-price");
  const total = root.querySelector("#configuration-total-price");
  const header = root.querySelector("#configuration-total-header");
  const items = root.querySelector("#configuration-price-items");
  const save = root.querySelector("#save-car-configuration");
  const retry = root.querySelector("#retry-configuration-price");
  const download = root.querySelector("#download-car-configuration");
  const open = root.querySelector("#open-car-configuration");
  const status = root.querySelector("#configuration-save-status");
  const saved = new Map();
  let state = null;
  let quote = null;
  let revision = 0;
  let timer;
  let quoteAbort;
  let saving = false;
  let attempt = null;

  function message(text, error = false) {
    status.textContent = text;
    status.dataset.error = String(error);
  }
  function clearUrl() {
    const url = new URL(location.href);
    if (!url.searchParams.has("configuration")) return;
    url.searchParams.delete("configuration");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  function showSaved(snapshot) {
    const url = new URL(location.href);
    url.searchParams.set("configuration", snapshot.id);
    open.href = url.pathname + url.search;
    download.href = "/api/configurator/configurations/" + snapshot.id + "?download=1";
    download.download = "konfiguration-" + snapshot.id + ".json";
    download.hidden = false;
    open.hidden = false;
  }
  function savedForCurrentQuote() {
    const entry = state && saved.get(state.key);
    return quote && entry && fingerprint(entry) === fingerprint(quote) ? entry : null;
  }
  function updateSaveButton() {
    const existing = savedForCurrentQuote();
    save.disabled = saving || !quote || Boolean(existing);
    save.textContent = saving ? "Wird gespeichert …" : existing ? "Konfiguration gespeichert" : "Konfiguration speichern";
  }
  function renderQuote(result) {
    base.textContent = formatPrice(result.totals.basePriceCents);
    extras.textContent = formatPrice(result.totals.extrasPriceCents);
    total.textContent = header.textContent = formatPrice(result.totals.totalPriceCents);
    items.replaceChildren();
    for (const selection of result.selections) {
      const row = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = selection.groupLabel + ": " + selection.choiceLabel;
      const cost = document.createElement("span");
      cost.textContent = selection.priceCents ? "+ " + formatPrice(selection.priceCents) : "Serie";
      row.append(label, cost);
      items.append(row);
    }
  }
  async function request(url, body, signal) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Die Anfrage konnte nicht verarbeitet werden.");
    return data;
  }
  function reset(text = "Preise werden vorbereitet …") {
    revision++;
    clearTimeout(timer);
    quoteAbort?.abort();
    state = null;
    quote = null;
    base.textContent = extras.textContent = total.textContent = header.textContent = "—";
    items.replaceChildren();
    download.hidden = open.hidden = retry.hidden = true;
    updateSaveButton();
    message(text);
    clearUrl();
  }
  async function refresh() {
    if (!state) return;
    const current = ++revision;
    const selected = state;
    quoteAbort?.abort();
    const controller = new AbortController();
    quoteAbort = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const result = await request("/api/configurator/quote", selected.body, controller.signal);
      if (current !== revision) return;
      quote = result;
      renderQuote(result);
      retry.hidden = true;
      const existing = savedForCurrentQuote();
      if (existing) {
        showSaved(existing);
        const url = new URL(open.href);
        history.replaceState(null, "", url.pathname + url.search);
        message("Diese Konfiguration ist in der Datenbank gespeichert.");
      } else {
        message(saved.has(state.key)
          ? "Der Preisstand hat sich geändert. Du kannst die Konfiguration erneut speichern."
          : "Speichere deine Auswahl mit dem aktuellen Preisstand.");
      }
      updateSaveButton();
    } catch (error) {
      if (current !== revision) return;
      quote = null;
      retry.hidden = false;
      message("Preisberechnung fehlgeschlagen: " + error.message, true);
      updateSaveButton();
    } finally { clearTimeout(timeout); }
  }
  function update(carId, selections) {
    const body = { carId, selections };
    const key = stable(body);
    if (state?.key === key && quote) return;
    reset("Preise werden berechnet …");
    state = { body, key };
    timer = setTimeout(refresh, 120);
  }
  retry.addEventListener("click", refresh);
  save.addEventListener("click", async () => {
    if (!quote || !state || saving) return;
    const selected = state;
    const quoted = fingerprint(quote);
    if (!attempt || attempt.key !== selected.key || attempt.quote !== quoted) {
      attempt = { key: selected.key, quote: quoted, id: crypto.randomUUID() };
    }
    const requestId = attempt.id;
    const current = revision;
    saving = true;
    updateSaveButton();
    message("Deine Konfiguration wird gespeichert …");
    try {
      const snapshot = await request("/api/configurator/configurations", { ...selected.body, requestId }, AbortSignal.timeout(15000));
      saved.set(selected.key, snapshot);
      if (current === revision) {
        showSaved(snapshot);
        const url = new URL(open.href);
        history.replaceState(null, "", url.pathname + url.search);
        message("Gespeichert. Du kannst die Konfiguration wieder öffnen oder als JSON herunterladen.");
        quote = snapshot;
        renderQuote(snapshot);
      }
    } catch (error) {
      if (current === revision) message("Speichern fehlgeschlagen: " + error.message + " Du kannst es erneut versuchen.", true);
    } finally {
      saving = false;
      updateSaveButton();
    }
  });

  return {
    update, reset, message,
    remember(snapshot) {
      const body = { carId: snapshot.vehicle.id, selections: Object.fromEntries(snapshot.selections.map((selection) => [selection.groupId, selection.choiceId])) };
      saved.set(stable(body), snapshot);
    },
  };
}
