// Kleiner Helfer: ruft einen Endpunkt am API Gateway ab und gibt JSON zurueck.
// Die Web-UI spricht ausschliesslich mit dem Gateway, nie direkt mit einem Service.
// Faellt der Abruf aus, wird { ok:false, error } geliefert, damit Seiten
// trotzdem rendern (kein Crash, wenn ein Service noch nicht fertig ist).

const GATEWAY_URL = process.env.GATEWAY_URL || "http://backend:3000";

async function fetchFromGateway(apiPath) {
  const url = `${GATEWAY_URL}/api${apiPath}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, error: `Status ${res.status}`, data: null };
    return { ok: true, error: null, data: await res.json() };
  } catch (err) {
    return { ok: false, error: err.message, data: null };
  }
}

module.exports = { fetchFromGateway, GATEWAY_URL };
