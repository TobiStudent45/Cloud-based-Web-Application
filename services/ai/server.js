// ai microservice: JSON only, internal port 3000, reached through the gateway at /api/ai.
// GET  /        -> status (is a Gemini key configured)
// POST /avatar  -> { selfie (data URL), carName? }. A free Gemini model looks at the photo and describes
//                  the person's look as structured JSON; the browser (ai-portrait.js) draws the portrait
//                  from it and places it in the real car from the configurator.
// Uploaded photos are only forwarded to Gemini and never stored.

const express = require("express");

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;
const SERVICE_NAME = "ai";
const API_KEY = process.env.GEMINI_API_KEY || "";

// Free Gemini models; they are sometimes overloaded (503) or rate limited (429), then the next one is tried.
const MODELS = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-flash-lite-latest"];
const modelUrl = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Allowed values for the description; ai-portrait.js has a drawing for each of them.
const AVATAR = {
  hairStyle: ["bald", "buzz", "short", "sidepart", "curly", "afro", "long-straight", "long-wavy", "bun", "ponytail"],
  facialHair: ["none", "stubble", "mustache", "goatee", "full-beard"],
  glasses: ["none", "round", "rectangular", "sunglasses"],
  headwear: ["none", "cap", "beanie"],
  expression: ["smile", "grin", "neutral", "cool"],
};
const HEX = /^#[0-9a-f]{6}$/i;

const AVATAR_SCHEMA = {
  type: "OBJECT",
  properties: {
    personFound: { type: "BOOLEAN" },
    skinTone: { type: "STRING", description: "Hex colour of the face skin, e.g. #e0b394" },
    hairColor: { type: "STRING", description: "Hex colour of the hair (or beard if bald)" },
    hairStyle: { type: "STRING", enum: AVATAR.hairStyle },
    eyeColor: { type: "STRING", description: "Hex colour of the iris" },
    facialHair: { type: "STRING", enum: AVATAR.facialHair },
    glasses: { type: "STRING", enum: AVATAR.glasses },
    headwear: { type: "STRING", enum: AVATAR.headwear },
    headwearColor: { type: "STRING", description: "Hex colour of the headwear, or #000000" },
    shirtColor: { type: "STRING", description: "Hex colour of the top / shirt" },
    expression: { type: "STRING", enum: AVATAR.expression },
    caption: { type: "STRING", description: "Funny German one-liner, max 80 characters" },
  },
  required: ["personFound", "skinTone", "hairColor", "hairStyle", "eyeColor", "facialHair", "glasses", "headwear", "headwearColor", "shirtColor", "expression", "caption"],
};

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: SERVICE_NAME });
});

app.get("/", (req, res) => {
  res.json({ service: SERVICE_NAME, configured: Boolean(API_KEY) });
});

// "data:image/jpeg;base64,...." -> { mimeType, data } or null
function parseDataUrl(value) {
  if (typeof value !== "string") return null;
  const match = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match || !ALLOWED_TYPES.includes(match[1])) return null;
  if (Math.floor((match[2].length * 3) / 4) > MAX_IMAGE_BYTES) return null;
  return { mimeType: match[1], data: match[2] };
}

function cleanText(value, max) {
  return typeof value === "string" ? value.replace(/[\r\n\t]+/g, " ").trim().slice(0, max) : "";
}

// Keeps only values the browser can draw; anything unexpected falls back to a sane default.
function sanitizeAvatar(raw) {
  const pick = (key, fallback) => (AVATAR[key].includes(raw?.[key]) ? raw[key] : fallback);
  const color = (key, fallback) => (HEX.test(raw?.[key] || "") ? raw[key].toLowerCase() : fallback);
  return {
    skinTone: color("skinTone", "#e0b394"),
    hairColor: color("hairColor", "#3b2a20"),
    hairStyle: pick("hairStyle", "short"),
    eyeColor: color("eyeColor", "#5a4030"),
    facialHair: pick("facialHair", "none"),
    glasses: pick("glasses", "none"),
    headwear: pick("headwear", "none"),
    headwearColor: color("headwearColor", "#222222"),
    shirtColor: color("shirtColor", "#3a3f4b"),
    expression: pick("expression", "smile"),
    caption: cleanText(raw?.caption, 90) || "Bereit für die erste Ausfahrt.",
  };
}

function geminiErrorMessage(status, body) {
  if (status === 400 && /API_KEY|API key/i.test(JSON.stringify(body))) return "Der Gemini-API-Schlüssel ist ungültig.";
  if (status === 403) return "Der Gemini-API-Schlüssel hat keinen Zugriff auf das Modell.";
  if (status === 429) return "Das kostenlose Gemini-Kontingent ist gerade aufgebraucht. Bitte später erneut versuchen.";
  if (status === 503) return "Gemini ist gerade überlastet. Bitte in ein paar Sekunden erneut versuchen.";
  return "Gemini hat die Anfrage abgelehnt.";
}

app.post("/avatar", async (req, res) => {
  if (!API_KEY) {
    return res.status(503).json({ error: "Kein GEMINI_API_KEY konfiguriert. Bitte in der .env eintragen und neu starten." });
  }
  const selfie = parseDataUrl(req.body?.selfie);
  if (!selfie) return res.status(400).json({ error: "Bitte ein Foto von dir hochladen (JPG, PNG oder WebP, max. 7 MB)." });

  const carName = cleanText(req.body?.carName, 60) || "Aureo-Sportwagen";
  const prompt = [
    "You help create a friendly illustrated portrait that resembles the person in the photo.",
    "Describe the main person's visible appearance using only the allowed values of the schema.",
    "Pick hex colours that match the photo naturally (realistic skin tone, real hair colour, real clothing colour).",
    "Choose the hair style that is closest, even if it is not a perfect match. If the person is bald, use 'bald'.",
    "Do not guess or mention age, ethnicity, gender or any other sensitive traits; describe only visual features.",
    `Also write a short, light-hearted, kind German caption (max 80 characters) about this person driving their new ${carName}.`,
    "Never make fun of the person's appearance.",
    "If the photo shows no clearly visible human face, set personFound to false.",
  ].join(" ");
  const request = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: selfie }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: AVATAR_SCHEMA, temperature: 0.4 },
  });

  try {
    let response = null, body = null, usedModel = null, lastError = null;
    for (const model of MODELS) {
      usedModel = model;
      try {
        response = await fetch(modelUrl(model), {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": API_KEY },
          body: request,
          signal: AbortSignal.timeout(25000),
        });
      } catch (err) {
        lastError = err;
        response = null;
        console.warn(`[${SERVICE_NAME}] ${model}: ${err.message}, versuche nächstes Modell`);
        continue;
      }
      body = await response.json().catch(() => null);
      if (response.ok || ![429, 500, 503].includes(response.status)) break;
      console.warn(`[${SERVICE_NAME}] ${model}: HTTP ${response.status}, versuche nächstes Modell`);
    }
    if (!response) throw lastError;
    if (!response.ok) {
      console.error(`[${SERVICE_NAME}] Gemini HTTP ${response.status}: ${body?.error?.status || ""} ${body?.error?.message || ""}`);
      return res.status(502).json({ error: geminiErrorMessage(response.status, body) });
    }

    const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      console.warn(`[${SERVICE_NAME}] Antwort war kein JSON (Grund: ${body?.candidates?.[0]?.finishReason || body?.promptFeedback?.blockReason || "unbekannt"})`);
      return res.status(422).json({ error: "Gemini konnte das Foto nicht auswerten. Bitte ein anderes Foto versuchen." });
    }
    if (raw.personFound === false) {
      return res.status(422).json({ error: "Auf dem Foto wurde kein Gesicht erkannt. Bitte ein Foto verwenden, auf dem dein Gesicht gut zu sehen ist." });
    }
    console.log(`[${SERVICE_NAME}] Porträt beschrieben (${usedModel})`);
    res.json({ avatar: sanitizeAvatar(raw), model: usedModel });
  } catch (err) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    console.error(`[${SERVICE_NAME}] Gemini-Anfrage fehlgeschlagen: ${err?.message}`);
    res.status(timedOut ? 504 : 502).json({
      error: timedOut ? "Gemini hat zu lange gebraucht. Bitte erneut versuchen." : "Gemini ist nicht erreichbar.",
    });
  }
});

app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Das Foto ist zu groß." });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Ungültige Anfrage." });
  next(err);
});

app.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] läuft auf Port ${PORT} (Gemini-Schlüssel ${API_KEY ? "gesetzt" : "FEHLT"})`);
});
