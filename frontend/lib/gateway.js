// Server-side client for the API gateway. Always resolves to { ok, error, data },
// so pages still render when a service is unavailable.


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
