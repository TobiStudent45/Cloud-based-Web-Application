// AI feature page:
//   selfie -> /api/ai/avatar -> Gemini describes the look as JSON -> ai-portrait.js draws the person
//   into the real car photographed in the configurator (sessionStorage "aureo-ai-car", see ai-configurator.js).

import { measureCar, renderScene, svgToPng } from "/js/ai-portrait.js";

const CAR_KEY = "aureo-ai-car";
const MAX_SIDE = 1024;

const LABELS = {
  hairStyle: { bald: "Glatze", buzz: "Buzzcut", short: "Kurz", sidepart: "Seitenscheitel", curly: "Locken", afro: "Afro", "long-straight": "Lang, glatt", "long-wavy": "Lang, wellig", bun: "Dutt", ponytail: "Pferdeschwanz" },
  facialHair: { none: "Keiner", stubble: "Dreitagebart", mustache: "Schnurrbart", goatee: "Kinnbart", "full-beard": "Vollbart" },
  glasses: { none: "Keine", round: "Rund", rectangular: "Eckig", sunglasses: "Sonnenbrille" },
  headwear: { none: "Keine", cap: "Cap", beanie: "Mütze" },
  expression: { smile: "Lächeln", grin: "Breites Grinsen", neutral: "Neutral", cool: "Lässig" },
};

const form = document.querySelector("#ai-form");

function readCar() {
  try {
    const car = JSON.parse(sessionStorage.getItem(CAR_KEY) || "null");
    // Only snapshots from the fixed driver-side view can be combined with the portrait.
    return car && car.view === "side-v1" && typeof car.image === "string" && car.image.startsWith("data:image/png") ? car : null;
  } catch {
    return null;
  }
}

// Scales an image file down to MAX_SIDE and returns a JPEG data URL.
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Das Bild konnte nicht gelesen werden."));
    };
    img.src = url;
  });
}

if (form) {
  const $ = (id) => form.querySelector(id);
  const fileInput = $("#ai-selfie");
  const drop = $("#ai-drop");
  const dropText = $("#ai-drop-text");
  const preview = $("#ai-selfie-preview");
  const scene = $("#ai-scene");
  const consent = $("#ai-consent");
  const submit = $("#ai-submit");
  const status = $("#ai-status");
  const result = $("#ai-result");
  const resultEmpty = $("#ai-result-empty");
  const loader = $("#ai-loader");
  const loaderText = $("#ai-loader-text");
  const resultImage = $("#ai-result-image");
  const actions = $("#ai-actions");
  const download = $("#ai-download");
  const retry = $("#ai-retry");
  const traits = $("#ai-traits");
  const traitsList = $("#ai-traits-list");

  const car = readCar();
  let carBox = null;
  let selfie = null;
  let busy = false;
  let lastAvatar = null;

  if (car) {
    $("#ai-car-image").src = car.image;
    $("#ai-car-name").textContent = car.carName || "Dein Aureo";
    for (const item of car.configuration || []) {
      const li = document.createElement("li");
      li.textContent = item;
      $("#ai-car-config").append(li);
    }
    $("#ai-car").hidden = false;
    $("#ai-car-empty").hidden = true;
    $("#ai-car-change").hidden = false;
  }

  function updateButton() {
    submit.disabled = busy || !car || !selfie || !consent.checked;
    if (busy) return;
    status.classList.remove("ai-error");
    if (!car) status.textContent = "Wähle zuerst dein Fahrzeug im Konfigurator.";
    else if (!selfie) status.textContent = "Lade ein Foto von dir hoch.";
    else if (!consent.checked) status.textContent = "Bitte bestätige die Einwilligung.";
    else status.textContent = "Bereit.";
  }

  function showError(message) {
    status.textContent = message;
    status.classList.add("ai-error");
  }

  async function useFile(file) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return showError("Bitte ein JPG-, PNG- oder WebP-Bild wählen.");
    try {
      selfie = await fileToDataUrl(file);
    } catch (error) {
      selfie = null;
      return showError(error.message);
    }
    preview.src = selfie;
    preview.hidden = false;
    dropText.hidden = true;
    drop.classList.add("has-image");
    lastAvatar = null;
    updateButton();
  }

  fileInput.addEventListener("change", () => useFile(fileInput.files[0]));
  drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    drop.classList.add("is-over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("is-over");
    useFile(event.dataTransfer.files[0]);
  });
  consent.addEventListener("change", updateButton);

  function setBusy(value, text) {
    busy = value;
    result.setAttribute("aria-busy", String(value));
    loader.hidden = !value;
    retry.disabled = value;
    if (value) {
      loaderText.textContent = text;
      resultEmpty.hidden = true;
      resultImage.hidden = true;
      actions.hidden = true;
      status.classList.remove("ai-error");
      status.textContent = text;
    }
    updateButton();
  }

  function showTraits(avatar) {
    const rows = [
      ["Haut", null, avatar.skinTone],
      ["Haare", LABELS.hairStyle[avatar.hairStyle], avatar.hairColor],
      ["Augen", null, avatar.eyeColor],
      ["Bart", LABELS.facialHair[avatar.facialHair]],
      ["Brille", LABELS.glasses[avatar.glasses]],
      ["Kopfbedeckung", LABELS.headwear[avatar.headwear], avatar.headwear !== "none" ? avatar.headwearColor : null],
      ["Oberteil", null, avatar.shirtColor],
      ["Ausdruck", LABELS.expression[avatar.expression]],
    ];
    traitsList.replaceChildren();
    for (const [label, text, color] of rows) {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      if (color) {
        const swatch = document.createElement("span");
        swatch.className = "ai-swatch";
        swatch.style.backgroundColor = color;
        dd.append(swatch);
      }
      dd.append(document.createTextNode(text || color || "–"));
      traitsList.append(dt, dd);
    }
    traits.hidden = false;
  }

  async function draw(avatar) {
    carBox = carBox || (await measureCar(car.image));
    const svg = renderScene({
      carImage: car.image,
      bbox: carBox,
      carId: car.carId,
      avatar,
      scene: scene.value,
      carName: car.carName || "Aureo",
      caption: avatar.caption,
    });
    const png = await svgToPng(svg);
    resultImage.src = png;
    resultImage.hidden = false;
    download.href = png;
    actions.hidden = false;
  }

  async function create() {
    if (busy || !car || !selfie || !consent.checked) return;
    setBusy(true, "Gemini schaut sich dein Foto an …");
    try {
      const response = await fetch("/api/ai/avatar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selfie, carName: car.carName }),
        signal: AbortSignal.timeout(120000),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.avatar) throw new Error(body.error || "Die Anfrage ist fehlgeschlagen.");
      lastAvatar = body.avatar;
      loaderText.textContent = "Wir setzen dich in deinen Aureo …";
      await draw(lastAvatar);
      showTraits(lastAvatar);
      setBusy(false);
      status.textContent = "Fertig! Andere Umgebung? Einfach wählen, das Bild passt sich sofort an.";
    } catch (error) {
      setBusy(false);
      resultEmpty.hidden = !resultImage.hidden;
      if (!resultImage.hidden) actions.hidden = false;
      showError(error.name === "TimeoutError" ? "Das hat zu lange gedauert. Bitte erneut versuchen." : error.message);
    }
  }

  // Changing the scene redraws locally, without asking Gemini again.
  scene.addEventListener("change", async () => {
    if (busy || !lastAvatar) return;
    try {
      await draw(lastAvatar);
    } catch (error) {
      showError(error.message);
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    create();
  });
  retry.addEventListener("click", create);

  updateButton();
}
