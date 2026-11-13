// Composes the AI feature image (1200 x 750 SVG): an elegant background scene, the real car
// photographed in the configurator (driver side, transparent PNG) and an illustrated portrait of
// the user (look described by Gemini) leaning out of the driver's window.
// The door is drawn a second time on top of the person so the shoulders sit "inside" the car.

const W = 1200;
const H = 750;
const GROUND = 612;   // y of the tyre contact line
const CAR_WIDTH = 960;

// Driver-window calibration per model for the "side-v1" view, as fractions of the car's bounding box:
// head = centre and height of the head, belt = two points on the window sill line.
const CALIBRATION = {
  lambo: { head: { x: 0.535, y: 0.25, h: 0.25 }, belt: [[0.30, 0.268], [0.72, 0.47]] },
  urus: { head: { x: 0.525, y: 0.185, h: 0.14 }, belt: [[0.45, 0.285], [0.65, 0.30]] },
};
const DEFAULT_CALIBRATION = { head: { x: 0.53, y: 0.24, h: 0.2 }, belt: [[0.3, 0.37], [0.7, 0.37]] };

const esc = (text) => String(text).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));

// Mixes a hex colour with black (amount < 0) or white (amount > 0).
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const target = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  const mix = (c) => Math.round(c + (target - c) * p);
  return "#" + ((1 << 24) + (mix((n >> 16) & 255) << 16) + (mix((n >> 8) & 255) << 8) + mix(n & 255)).toString(16).slice(1);
}

function blend(a, b, t) {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return "#" + ((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1);
}

function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

/* ---------- car image ---------- */

// Bounding box of the opaque car pixels in the configurator snapshot.
export function measureCar(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          if (data[(y * canvas.width + x) * 4 + 3] > 200) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return reject(new Error("Auf dem Fahrzeugbild wurde kein Auto gefunden."));
      resolve({ width: canvas.width, height: canvas.height, minX, minY, maxX, maxY });
    };
    img.onerror = () => reject(new Error("Das Fahrzeugbild konnte nicht gelesen werden."));
    img.src = dataUrl;
  });
}

/* ---------- backgrounds ---------- */

const SCENES = {
  sunset() {
    return `<linearGradient id="bg-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2b2946"/><stop offset=".45" stop-color="#9c5a6c"/><stop offset=".78" stop-color="#ee9f5c"/><stop offset="1" stop-color="#f6d49a"/></linearGradient>
      <radialGradient id="bg-sun" cx="900" cy="470" r="300" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#fff1c9"/><stop offset=".18" stop-color="#ffe0a3" stop-opacity=".9"/><stop offset="1" stop-color="#ffb070" stop-opacity="0"/></radialGradient>
      <linearGradient id="bg-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b5f86"/><stop offset="1" stop-color="#2c2f4c"/></linearGradient>
      <linearGradient id="bg-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3740"/><stop offset="1" stop-color="#141318"/></linearGradient>
      <filter id="bg-soft"><feGaussianBlur stdDeviation="3"/></filter>
    </defs>
    <rect width="${W}" height="480" fill="url(#bg-sky)"/>
    <rect width="${W}" height="480" fill="url(#bg-sun)"/>
    <path d="M0 480 L0 360 C120 330 200 380 300 400 C380 415 430 450 470 480 Z" fill="#3b2f48" opacity=".75" filter="url(#bg-soft)"/>
    <rect y="478" width="${W}" height="72" fill="url(#bg-sea)"/>
    <path d="M760 492h280M800 510h200M840 528h120" stroke="#ffd9a0" stroke-width="3" opacity=".45" filter="url(#bg-soft)"/>
    <rect y="548" width="${W}" height="${H - 548}" fill="url(#bg-ground)"/>`;
  },
  city() {
    const rnd = seeded(11);
    let skyline = "";
    for (let x = -20; x < W; ) {
      const w = 60 + Math.round(rnd() * 110);
      const h = 120 + Math.round(rnd() * 260);
      skyline += `<rect x="${x}" y="${540 - h}" width="${w}" height="${h}" fill="${rnd() > 0.5 ? "#151832" : "#1b1f3d"}"/>`;
      x += w + 4;
    }
    let bokeh = "";
    const tones = ["#ffc56b", "#ff7aa8", "#7ad7ff", "#fff2cc"];
    for (let i = 0; i < 46; i++) {
      bokeh += `<circle cx="${Math.round(rnd() * W)}" cy="${Math.round(160 + rnd() * 380)}" r="${Math.round(6 + rnd() * 22)}" fill="${tones[i % tones.length]}" opacity="${(0.25 + rnd() * 0.45).toFixed(2)}"/>`;
    }
    return `<linearGradient id="bg-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05070f"/><stop offset="1" stop-color="#1d1b3a"/></linearGradient>
      <linearGradient id="bg-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1d26"/><stop offset="1" stop-color="#08080c"/></linearGradient>
      <filter id="bg-blur"><feGaussianBlur stdDeviation="2.5"/></filter>
      <filter id="bg-bokeh"><feGaussianBlur stdDeviation="7"/></filter>
    </defs>
    <rect width="${W}" height="560" fill="url(#bg-sky)"/>
    <g filter="url(#bg-blur)">${skyline}</g>
    <g filter="url(#bg-bokeh)">${bokeh}</g>
    <rect y="545" width="${W}" height="${H - 545}" fill="url(#bg-ground)"/>
    <path d="M0 600h${W}" stroke="#ff7aa8" stroke-width="2" opacity=".18"/>`;
  },
  mountains() {
    return `<linearGradient id="bg-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fbfe2"/><stop offset="1" stop-color="#eef4f7"/></linearGradient>
      <linearGradient id="bg-haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#f3f6f8" stop-opacity=".85"/></linearGradient>
      <linearGradient id="bg-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b5f68"/><stop offset="1" stop-color="#2a2c31"/></linearGradient>
      <filter id="bg-soft"><feGaussianBlur stdDeviation="1.6"/></filter>
    </defs>
    <rect width="${W}" height="560" fill="url(#bg-sky)"/>
    <path d="M-40 520 L180 250 L320 380 L520 170 L760 420 L930 260 L1240 520 Z" fill="#9aabc0" filter="url(#bg-soft)"/>
    <path d="M180 250 L222 300 L196 296 L168 316 L150 288 Z M520 170 L572 236 L540 228 L510 248 L486 220 Z M930 260 L970 312 L948 306 L922 322 L904 300 Z" fill="#ffffff" opacity=".9" filter="url(#bg-soft)"/>
    <path d="M-20 560 C200 430 380 470 560 500 C760 450 980 470 1220 520 L1220 560 Z" fill="#6f8296"/>
    <rect width="${W}" height="560" fill="url(#bg-haze)"/>
    <rect y="550" width="${W}" height="${H - 550}" fill="url(#bg-ground)"/>`;
  },
  studio() {
    return `<radialGradient id="bg-wall" cx="600" cy="300" r="760" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fbfbfb"/><stop offset="1" stop-color="#cfd1d6"/></radialGradient>
      <linearGradient id="bg-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dbe0"/><stop offset="1" stop-color="#a9acb4"/></linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg-wall)"/>
    <rect y="540" width="${W}" height="${H - 540}" fill="url(#bg-ground)"/>
    <path d="M0 540h${W}" stroke="#ffffff" stroke-width="2" opacity=".6"/>`;
  },
};

/* ---------- portrait (local units: face from y=-52 to y=50) ---------- */

function hairShapes(style) {
  const shapes = {
    short: { front: "M-40 -10 C-44 -50 -24 -66 2 -64 C28 -64 44 -50 40 -10 C37 -30 31 -40 18 -42 C6 -38 -14 -40 -26 -36 C-34 -30 -38 -22 -40 -10 Z" },
    sidepart: { front: "M-41 -6 C-47 -54 -20 -69 6 -67 C33 -65 47 -48 41 -6 C38 -30 34 -42 26 -45 C10 -47 -6 -45 -18 -37 C-28 -31 -36 -20 -41 -6 Z", lines: "M-15 -64 Q-11 -52 -19 -39" },
    buzz: { front: "M-39 -14 C-40 -50 -20 -58 0 -58 C20 -58 40 -50 39 -14 C34 -34 20 -42 0 -42 C-20 -42 -34 -34 -39 -14 Z", opacity: 0.88 },
    curly: { front: "M-42 -6 C-50 -58 -22 -72 2 -70 C30 -70 50 -56 42 -6 C38 -30 30 -40 16 -42 C2 -38 -16 -42 -28 -36 C-36 -30 -40 -20 -42 -6 Z", curls: true },
    afro: { back: "M-62 -10 C-70 -70 -30 -94 0 -94 C30 -94 70 -70 62 -10 C66 20 52 30 40 20 L-40 20 C-52 30 -66 20 -62 -10 Z", front: "M-40 -14 C-40 -44 -20 -50 0 -50 C20 -50 40 -44 40 -14 C32 -32 18 -38 0 -38 C-18 -38 -32 -32 -40 -14 Z", curls: true },
    "long-straight": {
      back: "M-43 -20 C-48 -62 -22 -72 0 -72 C22 -72 48 -62 43 -20 L48 72 C20 80 -20 80 -48 72 Z",
      front: "M-43 14 C-49 -50 -22 -69 0 -67 C24 -67 49 -50 43 14 C40 -18 31 -38 12 -43 C-4 -37 -26 -33 -36 -14 C-39 -4 -41 4 -43 14 Z",
    },
    "long-wavy": {
      back: "M-43 -20 C-50 -62 -22 -72 0 -72 C22 -72 50 -62 43 -20 C56 10 44 30 54 50 C60 64 46 78 30 78 C10 82 -10 82 -30 78 C-46 78 -60 64 -54 50 C-44 30 -56 10 -43 -20 Z",
      front: "M-43 14 C-49 -50 -22 -69 0 -67 C24 -67 49 -50 43 14 C40 -18 31 -38 12 -43 C-4 -37 -26 -33 -36 -14 C-39 -4 -41 4 -43 14 Z",
    },
    bun: { back: "M-15 -66 a16 15 0 1 0 30 0 a16 15 0 1 0 -30 0 Z", front: "M-40 -12 C-42 -52 -22 -62 0 -62 C22 -62 42 -52 40 -12 C34 -36 20 -46 0 -46 C-20 -46 -34 -36 -40 -12 Z" },
    ponytail: { back: "M26 -48 C56 -40 60 -4 52 30 C48 50 40 62 32 66 C38 30 34 -10 20 -34 Z", front: "M-40 -12 C-42 -52 -22 -62 0 -62 C22 -62 42 -52 40 -12 C34 -36 20 -46 0 -46 C-20 -46 -34 -36 -40 -12 Z" },
    bald: {},
  };
  return shapes[style] || shapes.short;
}

function portrait(a, id) {
  const skin = a.skinTone;
  const hair = a.hairColor;
  const hairStyle = hairShapes(a.hairStyle);
  const skinShadow = shade(skin, -0.22);
  const lip = blend(skin, "#a8444f", 0.38);
  const lipLight = blend(skin, "#c06a70", 0.32);
  const line = shade(skin, -0.5);
  const browColor = a.hairStyle === "bald" ? shade(skin, -0.45) : shade(hair, -0.1);

  const defs = `
    <radialGradient id="${id}-skin" cx="38%" cy="32%" r="78%"><stop offset="0" stop-color="${shade(skin, 0.14)}"/><stop offset=".55" stop-color="${skin}"/><stop offset="1" stop-color="${shade(skin, -0.16)}"/></radialGradient>
    <linearGradient id="${id}-neck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(skin, -0.3)}"/><stop offset="1" stop-color="${shade(skin, -0.1)}"/></linearGradient>
    <linearGradient id="${id}-hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(hair, 0.18)}"/><stop offset=".5" stop-color="${hair}"/><stop offset="1" stop-color="${shade(hair, -0.25)}"/></linearGradient>
    <linearGradient id="${id}-shirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(a.shirtColor, 0.1)}"/><stop offset="1" stop-color="${shade(a.shirtColor, -0.25)}"/></linearGradient>
    <linearGradient id="${id}-hat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(a.headwearColor, 0.15)}"/><stop offset="1" stop-color="${shade(a.headwearColor, -0.25)}"/></linearGradient>
    <linearGradient id="${id}-lens" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3d44"/><stop offset=".5" stop-color="#121316"/><stop offset="1" stop-color="#2a2c31"/></linearGradient>`;

  const hairFill = `url(#${id}-hair)`;
  const hairBack = hairStyle.back ? `<path d="${hairStyle.back}" fill="${hairFill}"/>` : "";
  let hairFront = "";
  if (a.headwear === "none" && hairStyle.front) {
    hairFront = `<path d="${hairStyle.front}" fill="${hairFill}" opacity="${hairStyle.opacity || 1}"/>`;
    if (hairStyle.curls) {
      for (let angle = 200; angle <= 340; angle += 14) {
        const r = (angle * Math.PI) / 180;
        hairFront += `<circle cx="${(Math.cos(r) * 40).toFixed(1)}" cy="${(-24 + Math.sin(r) * 40).toFixed(1)}" r="9" fill="${hairFill}"/>`;
      }
    }
    hairFront += `<path d="M-20 -58 C-6 -63 10 -62 22 -56" stroke="${shade(hair, 0.4)}" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".45"/>`;
    hairFront += `<path d="M-30 -40 C-18 -52 -2 -56 12 -54 M4 -60 C16 -56 28 -48 34 -36" stroke="${shade(hair, -0.35)}" stroke-width="1.2" fill="none" opacity=".45"/>`;
    if (hairStyle.lines) hairFront += `<path d="${hairStyle.lines}" stroke="${shade(hair, -0.35)}" stroke-width="1.6" fill="none" opacity=".6"/>`;
  }
  if (a.hairStyle === "bald" && a.headwear === "none") {
    hairFront = `<ellipse cx="-10" cy="-40" rx="14" ry="6" fill="#fff" opacity=".18" transform="rotate(-15 -10 -40)"/>`;
  }

  const eye = (x) => `
    <path d="M${x - 8.5} -6 Q${x} -11.5 ${x + 8.5} -6 Q${x} -1.5 ${x - 8.5} -6 Z" fill="#f7f3ef"/>
    <circle cx="${x + 0.5}" cy="-6" r="3.7" fill="${a.eyeColor}"/>
    <circle cx="${x + 0.5}" cy="-6" r="3.7" fill="none" stroke="${shade(a.eyeColor, -0.45)}" stroke-width=".8"/>
    <circle cx="${x + 0.5}" cy="-6" r="1.7" fill="#111"/>
    <circle cx="${x + 1.7}" cy="-7.3" r=".9" fill="#fff" opacity=".9"/>
    <path d="M${x - 9} -6 Q${x} -12.2 ${x + 9} -6.2" stroke="${line}" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    <path d="M${x - 7} -10.5 Q${x} -14.5 ${x + 7} -10.5" stroke="${skinShadow}" stroke-width="1.1" fill="none" opacity=".7"/>`;
  const brow = (x, dir) => `<path d="M${x - 10 * dir} -15 Q${x - 1 * dir} -20.5 ${x + 10 * dir} -16.5 Q${x} -17.5 ${x - 10 * dir} -13.2 Z" fill="${browColor}" opacity=".92"/>`;

  const mouths = {
    smile: `<path d="M-11 26.5 Q-5 24 0 25.2 Q5 24 11 26.5 Q0 27.6 -11 26.5 Z" fill="${lip}"/><path d="M-11 26.5 Q0 34 11 26.5 Q0 29.5 -11 26.5 Z" fill="${lipLight}"/><path d="M-12 26.3 Q0 30 12 26.3" stroke="${shade(lip, -0.35)}" stroke-width="1.1" fill="none"/>`,
    grin: `<path d="M-12 25.5 Q0 23.5 12 25.5 Q8 34 0 34.5 Q-8 34 -12 25.5 Z" fill="${shade(lip, -0.45)}"/><path d="M-10 26 Q0 25 10 26 Q8 29.5 0 29.8 Q-8 29.5 -10 26 Z" fill="#faf6f1"/><path d="M-12 25.5 Q-5 23 0 24.3 Q5 23 12 25.5" stroke="${lip}" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M-11 27.5 Q0 37 11 27.5" stroke="${lipLight}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
    neutral: `<path d="M-10 27 Q-5 25 0 26 Q5 25 10 27 Q0 28 -10 27 Z" fill="${lip}"/><path d="M-9.5 27.3 Q0 32 9.5 27.3 Q0 28.6 -9.5 27.3 Z" fill="${lipLight}"/>`,
    cool: `<path d="M-10 27.5 Q-4 25.5 1 26.3 Q6 24.5 11 25.6 Q1 28.4 -10 27.5 Z" fill="${lip}"/><path d="M-9.5 27.8 Q1 32 10.5 26 Q1 29 -9.5 27.8 Z" fill="${lipLight}"/>`,
  };

  const beards = {
    stubble: `<path d="M-37 2 C-35 30 -20 48 0 51 C20 48 35 30 37 2 C30 20 20 30 0 31 C-20 30 -30 20 -37 2 Z" fill="${hair}" opacity=".2"/><path d="M-12 22 Q0 19 12 22 Q0 24 -12 22 Z" fill="${hair}" opacity=".22"/>`,
    mustache: `<path d="M-14 23.8 Q-7 18.5 0 21.2 Q7 18.5 14 23.8 Q7 22.4 0 23.6 Q-7 22.4 -14 23.8 Z" fill="${hair}"/>`,
    goatee: `<path d="M-13 23.8 Q-7 18.8 0 21.4 Q7 18.8 13 23.8 Q7 22.6 0 23.8 Q-7 22.6 -13 23.8 Z" fill="${hair}"/><path d="M-9 35 Q0 50 9 35 Q0 39 -9 35 Z" fill="${hair}"/>`,
    "full-beard": `<path d="M-38 -2 C-38 34 -20 54 0 57 C20 54 38 34 38 -2 C34 14 26 22 16 24 Q0 18 -16 24 C-26 22 -34 14 -38 -2 Z" fill="${hairFill}"/><path d="M-14 23.8 Q-7 18.5 0 21.2 Q7 18.5 14 23.8 Q7 22.4 0 23.6 Q-7 22.4 -14 23.8 Z" fill="${shade(hair, -0.15)}"/>`,
  };

  let glasses = "";
  if (a.glasses === "round") {
    glasses = `<circle cx="-14" cy="-6" r="9.6" fill="#fff" fill-opacity=".08" stroke="#2b2b2e" stroke-width="1.7"/><circle cx="14" cy="-6" r="9.6" fill="#fff" fill-opacity=".08" stroke="#2b2b2e" stroke-width="1.7"/>`;
  } else if (a.glasses === "rectangular") {
    glasses = `<rect x="-24" y="-12.5" width="19" height="13" rx="3" fill="#fff" fill-opacity=".08" stroke="#2b2b2e" stroke-width="1.8"/><rect x="5" y="-12.5" width="19" height="13" rx="3" fill="#fff" fill-opacity=".08" stroke="#2b2b2e" stroke-width="1.8"/>`;
  } else if (a.glasses === "sunglasses") {
    glasses = `<path d="M-25 -12 H-4 Q-3 2 -14 2.5 Q-25 2 -25 -12 Z M4 -12 H25 Q25 2 14 2.5 Q3 2 4 -12 Z" fill="url(#${id}-lens)" stroke="#111" stroke-width="1.3"/><path d="M-21 -9.5 L-15 -9.5 M8 -9.5 L14 -9.5" stroke="#fff" stroke-width="1.4" opacity=".35" stroke-linecap="round"/>`;
  }
  if (glasses) glasses += `<path d="M-4.5 -8 Q0 -10 4.5 -8 M-24 -8 L-37 -10 M24 -8 L37 -10" stroke="#2b2b2e" stroke-width="1.6" fill="none"/>`;

  let hat = "";
  if (a.headwear === "cap") {
    hat = `<path d="M-41 -24 C-44 -62 -22 -72 0 -72 C22 -72 44 -62 41 -24 Q0 -32 -41 -24 Z" fill="url(#${id}-hat)"/>
      <path d="M-40 -25 Q0 -34 40 -25 Q44 -16 30 -14 Q0 -22 -30 -14 Q-44 -16 -40 -25 Z" fill="${shade(a.headwearColor, -0.3)}"/>
      <path d="M0 -72 V-30" stroke="${shade(a.headwearColor, -0.3)}" stroke-width="1" opacity=".5"/><circle cx="0" cy="-71" r="2.4" fill="${shade(a.headwearColor, -0.2)}"/>`;
  } else if (a.headwear === "beanie") {
    let ribs = "";
    for (let x = -38; x <= 38; x += 6) ribs += `<path d="M${x} -36 V-22" stroke="${shade(a.headwearColor, -0.3)}" stroke-width="1" opacity=".5"/>`;
    hat = `<path d="M-42 -22 C-46 -70 -22 -80 0 -80 C22 -80 46 -70 42 -22 Z" fill="url(#${id}-hat)"/><rect x="-44" y="-38" width="88" height="17" rx="7" fill="${shade(a.headwearColor, -0.15)}"/>${ribs}`;
  }

  return {
    defs,
    body: `
    ${hairBack}
    <path d="M-60 104 C-58 76 -40 66 -16 63 L16 63 C40 66 58 76 60 104 Z" fill="url(#${id}-shirt)"/>
    <path d="M-16 63 L0 80 L16 63" stroke="${shade(a.shirtColor, -0.35)}" stroke-width="2" fill="none"/>
    <path d="M-15 30 L-16 66 Q0 74 16 66 L15 30 Z" fill="url(#${id}-neck)"/>
    <ellipse cx="-37" cy="-2" rx="6" ry="11" fill="${shade(skin, -0.06)}"/><ellipse cx="37" cy="-2" rx="6" ry="11" fill="${shade(skin, -0.06)}"/>
    <path d="M-38 -10 C-38 -45 -20 -52 0 -52 C20 -52 38 -45 38 -10 C38 18 28 40 0 50 C-28 40 -38 18 -38 -10 Z" fill="url(#${id}-skin)"/>
    <ellipse cx="-21" cy="13" rx="8" ry="5" fill="#e3787a" opacity=".13"/><ellipse cx="21" cy="13" rx="8" ry="5" fill="#e3787a" opacity=".13"/>
    ${beards[a.facialHair] || ""}
    ${a.glasses === "sunglasses" ? "" : eye(-14) + eye(14)}
    ${brow(-14, 1)}${brow(14, -1)}
    <path d="M3 -6 C5 4 7 10 6.5 14" stroke="${skinShadow}" stroke-width="2.2" fill="none" opacity=".55" stroke-linecap="round"/>
    <path d="M-6.5 15.5 Q-3 18.5 0 17.2 Q3 18.5 6.5 15.5" stroke="${shade(skin, -0.35)}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    ${mouths[a.expression] || mouths.smile}
    ${hairFront}
    ${glasses}
    ${hat}`,
  };
}

/* ---------- composition ---------- */

function wrap(text, max) {
  const lines = [];
  for (const word of String(text || "").split(/\s+/)) {
    const last = lines[lines.length - 1];
    if (last && (last + " " + word).length <= max) lines[lines.length - 1] = last + " " + word;
    else if (word) lines.push(word);
  }
  return lines.slice(0, 2);
}

export function renderScene({ carImage, bbox, carId, avatar, scene, carName, caption }) {
  const cal = CALIBRATION[carId] || DEFAULT_CALIBRATION;
  const bw = bbox.maxX - bbox.minX + 1;
  const bh = bbox.maxY - bbox.minY + 1;
  const s = CAR_WIDTH / bw;
  const carW = CAR_WIDTH;
  const carH = bh * s;
  const carX = (W - carW) / 2;
  const carY = GROUND - carH;
  const img = { x: carX - bbox.minX * s, y: carY - bbox.minY * s, w: bbox.width * s, h: bbox.height * s };
  const px = (fx) => carX + fx * carW;
  const py = (fy) => carY + fy * carH;

  // Window sill line through the two calibration points, extended over the whole picture.
  const [[ax, ay], [bx, by]] = cal.belt;
  const slope = (py(by) - py(ay)) / (px(bx) - px(ax));
  const beltAt = (x) => py(ay) + (x - px(ax)) * slope;

  const headH = cal.head.h * carH * 1.3; // larger than life: the person leans out towards the camera
  const headX = px(cal.head.x);
  const headY = py(cal.head.y);
  const k = headH / 102;
  const p = portrait(avatar, "pt");
  const doorClip = `M0 ${beltAt(0).toFixed(1)} L${W} ${beltAt(W).toFixed(1)} L${W} ${H} L0 ${H} Z`;

  // Forearm resting on the sill, pointing to the front of the car.
  const armStart = headX + 0.28 * headH;
  const armEnd = headX + 1.05 * headH;
  const armY1 = beltAt(armStart) - 0.04 * headH;
  const armY2 = beltAt(armEnd) - 0.07 * headH;
  const armW = 0.24 * headH;
  const hand = { x: armEnd + 0.1 * headH, y: armY2 + 0.03 * headH };

  const lines = wrap(caption, 64);
  const captionSvg = lines.map((l, i) => `<text x="56" y="${H - 50 - (lines.length - 1 - i) * 36}" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="28" font-weight="500" fill="#fff">${esc(l)}</text>`).join("");

  const carImageTag = (extra = "") => `<image href="${carImage}" x="${img.x.toFixed(1)}" y="${img.y.toFixed(1)}" width="${img.w.toFixed(1)}" height="${img.h.toFixed(1)}" preserveAspectRatio="none" ${extra}/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    ${p.defs}
    <clipPath id="door"><path d="${doorClip}"/></clipPath>
    <filter id="shadow-blur" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="14"/></filter>
    <filter id="soft-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".25"/></filter>
    <linearGradient id="caption-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".62"/></linearGradient>
    <linearGradient id="arm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(avatar.shirtColor, 0.12)}"/><stop offset="1" stop-color="${shade(avatar.shirtColor, -0.25)}"/></linearGradient>
    <radialGradient id="hand" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${shade(avatar.skinTone, 0.12)}"/><stop offset="1" stop-color="${shade(avatar.skinTone, -0.15)}"/></radialGradient>
    ${(SCENES[scene] || SCENES.sunset)()}
  <ellipse cx="${W / 2}" cy="${GROUND + 4}" rx="${carW * 0.48}" ry="22" fill="#000" opacity=".5" filter="url(#shadow-blur)"/>
  ${carImageTag()}
  <g transform="translate(${headX.toFixed(1)} ${headY.toFixed(1)}) rotate(-4) scale(${k.toFixed(4)})" filter="url(#soft-shadow)">${p.body}</g>
  ${carImageTag('clip-path="url(#door)"')}
  <g filter="url(#soft-shadow)">
    <path d="M${armStart.toFixed(1)} ${armY1.toFixed(1)} L${armEnd.toFixed(1)} ${armY2.toFixed(1)}" stroke="url(#arm)" stroke-width="${armW.toFixed(1)}" stroke-linecap="round"/>
    <ellipse cx="${hand.x.toFixed(1)}" cy="${hand.y.toFixed(1)}" rx="${(0.13 * headH).toFixed(1)}" ry="${(0.1 * headH).toFixed(1)}" fill="url(#hand)" transform="rotate(${(Math.atan(slope) * 180 / Math.PI).toFixed(1)} ${hand.x.toFixed(1)} ${hand.y.toFixed(1)})"/>
  </g>
  <rect y="${H - 190}" width="${W}" height="190" fill="url(#caption-fade)"/>
  <text x="56" y="${H - 58 - lines.length * 36}" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="15" font-weight="600" letter-spacing="3" fill="#fff" opacity=".8">AUREO · ${esc((carName || "").toUpperCase())}</text>
  ${captionSvg}
  <text x="${W - 40}" y="${H - 50}" text-anchor="end" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="14" fill="#fff" opacity=".7">Porträt nach Analyse durch Google Gemini</text>
</svg>`;
}

// Converts the SVG to a PNG data URL (for display and download).
export function svgToPng(svg) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      canvas.getContext("2d").drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(url);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Das Bild konnte nicht gezeichnet werden."));
    };
    img.src = url;
  });
}
