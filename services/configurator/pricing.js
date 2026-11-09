class ConfigurationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function parseRequest(body, allowRequestId = false) {
  const allowed = new Set(["carId", "selections", ...(allowRequestId ? ["requestId"] : [])]);
  if (!isObject(body) || Object.keys(body).some((key) => !allowed.has(key)) ||
      typeof body.carId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(body.carId) ||
      !isObject(body.selections) || Object.values(body.selections).some((value) => typeof value !== "string")) {
    throw new ConfigurationError("Bitte sende eine Fahrzeug-ID und gültige Options-IDs.");
  }
  if (body.requestId !== undefined && (typeof body.requestId !== "string" || !uuidPattern.test(body.requestId))) {
    throw new ConfigurationError("Ungültige Speicher-ID.");
  }
  return body;
}

function money(value) {
  if (!["number", "string"].includes(typeof value) || (typeof value === "string" && !/^\d+$/.test(value))) {
    throw new ConfigurationError("Für diese Auswahl ist noch kein Preis hinterlegt.", 503);
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new ConfigurationError("Der hinterlegte Preis ist ungültig.", 503);
  }
  return result;
}

function createQuote(car, groups, requested) {
  const known = new Set(groups.map((group) => group.id));
  if (Object.keys(requested).some((id) => !known.has(id))) {
    throw new ConfigurationError("Eine gewählte Optionsgruppe gehört nicht zu diesem Fahrzeug.");
  }
  const basePriceCents = money(car.base_price_cents);
  const selections = groups.map((group) => {
    const choiceId = Object.hasOwn(requested, group.id) ? requested[group.id] : "original";
    const choice = group.choices.find((item) => item.id === choiceId);
    if (!choice) throw new ConfigurationError("Ungültige Auswahl für " + group.label + ".");
    return {
      groupId: group.id, groupLabel: group.label, section: group.section,
      choiceId: choice.id, choiceLabel: choice.label, priceCents: money(choice.priceCents),
      materialNames: group.materialNames, values: choice.values,
    };
  });
  const extrasPriceCents = money(selections.reduce((total, choice) => total + choice.priceCents, 0));
  const totalPriceCents = money(basePriceCents + extrasPriceCents);
  return {
    schemaVersion: 1, currency: "EUR", pricingType: "demo",
    vehicle: { id: car.id, name: car.name, modelFile: car.model_file, basePriceCents },
    selections, totals: { basePriceCents, extrasPriceCents, totalPriceCents },
  };
}

function sameRequest(snapshot, request) {
  if (snapshot.vehicle.id !== request.carId) return false;
  const known = new Map(snapshot.selections.map((selection) => [selection.groupId, selection.choiceId]));
  return Object.keys(request.selections).every((id) => known.has(id)) &&
    [...known].every(([id, choice]) => (Object.hasOwn(request.selections, id) ? request.selections[id] : "original") === choice);
}

module.exports = { ConfigurationError, uuidPattern, parseRequest, createQuote, sameRequest, money };
