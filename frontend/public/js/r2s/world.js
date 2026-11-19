// The world of Road to the Super Car: sky, clouds, mountains, terrain, roads, forest, leaves.
// Two connected road systems share one set of helpers:
//   film  - straight-ish forest road to the show plaza (the film follows it)
//   connector + ring - leaves the plaza and runs as a ring road (the free drive)
// Everything is built from code (no model files), vegetation is instanced and split into cells for culling.

import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { TAU, rand, pick, smooth, hash, noise, fbm } from "./util.js";

export const PODIUM = new THREE.Vector3(6, 0, -275);
export const ROAD_HALF = 4.25; // asphalt half width (two lanes of 4.25 m)
export const RAIL_OFFSET = 6.5; // guard rails stand this far from the road centre; the car cannot go further than ~5.4 m

// area of the show (plaza, hall, parking lot, tents): no forest here
export const inShowArea = (x, z, margin = 0) =>
  Math.hypot(x - PODIUM.x, z - PODIUM.z) < 72 + margin || (x > -92 - margin && x < -22 + margin && z > -282 - margin && z < -218 + margin);

export function buildWorld(scene, renderer) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---------- atmosphere ----------
  scene.fog = new THREE.Fog(new THREE.Color("#b9d0e2"), 110, 1750);
  const SUN_DIRECTION = V(40, 30, 26).normalize();
  const sky = new Sky();
  sky.scale.setScalar(2200);
  const u = sky.material.uniforms;
  u.turbidity.value = 5; u.rayleigh.value = 2.7; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(SUN_DIRECTION);
  scene.add(sky);

  // clouds: shaded cumulus puffs with flat bases, plus thin high streaks
  function cloudTexture(kind) {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 256;
    const g = c.getContext("2d");
    if (kind === "streak") {
      for (let i = 0; i < 70; i++) {
        const y = 40 + Math.random() * 176, x = 30 + Math.random() * 300, w = 80 + Math.random() * 180;
        const grad = g.createLinearGradient(x, 0, x + w, 0);
        grad.addColorStop(0, "rgba(255,255,255,0)"); grad.addColorStop(0.5, "rgba(255,255,255,.22)"); grad.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = grad; g.fillRect(x, y, w, 2 + Math.random() * 4);
      }
    } else {
      const puffs = 26 + Math.floor(Math.random() * 12);
      for (let i = 0; i < puffs; i++) {
        const t = i / puffs;
        const x = 70 + Math.random() * 372, y = 150 - Math.sin(t * Math.PI) * 55 - Math.random() * 40, r = 24 + Math.random() * 46;
        const radial = g.createRadialGradient(x, y, 0, x, y, r);
        radial.addColorStop(0, "rgba(255,255,255,.95)"); radial.addColorStop(0.6, "rgba(255,255,255,.55)"); radial.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = radial; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
      g.globalCompositeOperation = "source-atop"; // grey-blue underside
      const shade = g.createLinearGradient(0, 90, 0, 200);
      shade.addColorStop(0, "rgba(140,160,190,0)"); shade.addColorStop(1, "rgba(120,140,175,.7)");
      g.fillStyle = shade; g.fillRect(0, 0, 512, 256);
      g.globalCompositeOperation = "destination-out"; // soft flat base
      const base = g.createLinearGradient(0, 170, 0, 215);
      base.addColorStop(0, "rgba(0,0,0,0)"); base.addColorStop(1, "rgba(0,0,0,1)");
      g.fillStyle = base; g.fillRect(0, 170, 512, 90);
    }
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  const clouds = new THREE.Group();
  const cumulus = [cloudTexture("cumulus"), cloudTexture("cumulus"), cloudTexture("cumulus"), cloudTexture("cumulus")];
  const streak = cloudTexture("streak");
  for (let i = 0; i < 30; i++) { // few, big clouds: every one is a large translucent area
    const low = i < 23;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: low ? pick(cumulus) : streak, transparent: true, opacity: low ? rand(0.7, 1) : rand(0.35, 0.6), depthWrite: false, fog: false }));
    const angle = rand(0, TAU);
    const distance = rand(600, 1500);
    sprite.position.set(300 + Math.sin(angle) * distance, low ? rand(190, 330) : rand(520, 700), -200 + Math.cos(angle) * distance);
    const size = low ? rand(420, 820) : rand(1100, 1700);
    sprite.scale.set(size, size * (low ? 0.5 : 0.22), 1);
    clouds.add(sprite);
  }
  scene.add(clouds);

  // ---------- roads (centre lines) ----------
  function makeRoad(curve, closed) {
    const length = curve.getLength();
    const n = Math.ceil(length / 2);
    const pts = [], tans = [], dist = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t); tangent.y = 0; tangent.normalize();
      pts.push(p); tans.push(tangent); dist.push(length * t);
    }
    return { curve, closed, length, n, pts, tans, dist };
  }
  const filmCurve = new THREE.CatmullRomCurve3(
    [[4, 170], [-3, 130], [0, 90], [0, 45], [0, 0], [0, -35], [16, -70], [10, -105], [-14, -140], [-22, -175], [-6, -212], [8, -244], [PODIUM.x, PODIUM.z]].map(([x, z]) => V(x, 0, z)),
    false, "centripetal");
  filmCurve.arcLengthDivisions = 3000;
  const film = makeRoad(filmCurve, false);

  // ring road (driven clockwise: a decreases)
  const RING = { cx: 480, cz: -170 };
  const ringRadius = (a) => 330 + 55 * Math.sin(2 * a + 0.7) + 35 * Math.sin(3 * a + 2) + 18 * Math.sin(5 * a);
  const ringAt = (a) => V(RING.cx + ringRadius(a) * Math.cos(a), 0, RING.cz + ringRadius(a) * Math.sin(a));
  const RING_POINTS = 220;
  const ringCurve = new THREE.CatmullRomCurve3(Array.from({ length: RING_POINTS }, (_, i) => ringAt((-i * TAU) / RING_POINTS)), true, "centripetal");
  ringCurve.arcLengthDivisions = 3000;
  const R0 = ringAt(Math.PI);

  // exit road: from the podium back down the entry road (same centre line, opposite lane), then a left turn
  // onto a side road that joins the ring at a shallow angle
  const atBack = (metres) => film.pts[Math.max(0, film.n - Math.round(metres / 2))].clone();
  const BRANCH_BACK = 64;
  const branch = atBack(BRANCH_BACK);
  const reverse = film.tans[film.n - Math.round(BRANCH_BACK / 2)].clone().multiplyScalar(-1);
  const connectorCurve = new THREE.CatmullRomCurve3([
    PODIUM.clone(), atBack(6), atBack(20), atBack(34), atBack(48), branch,
    branch.clone().addScaledVector(reverse, 9),
    V(6, 0, -203), V(30, 0, -205), V(70, 0, -201), V(100, 0, -185), V(122, 0, -172), V(136, 0, -170), R0.clone(),
  ], false, "centripetal");
  connectorCurve.arcLengthDivisions = 3000;
  const roads = { film, connector: makeRoad(connectorCurve, false), ring: makeRoad(ringCurve, true) };

  // crossing track: runs straight from the junction at the start through the whole map to the far side of the ring, as a
  // narrow forest track. In the middle a short ramp, a gap and a second ramp (one for each direction).
  const T0 = ringAt(0);
  const crossCurve = new THREE.CatmullRomCurve3([0, 0.25, 0.5, 0.75, 1].map((f) => V(R0.x + (T0.x - R0.x) * f, 0, -170)), false, "centripetal");
  crossCurve.arcLengthDivisions = 3000;
  roads.cross = makeRoad(crossCurve, false);
  const cross = roads.cross;
  const JP = { H: 2.4, rampLen: 12, pitLen: 22, landLen: 12, W: 7 };
  const CROSS_RAIL = 4.8;                 // the guard rails along the track stand this far from its centre
  const cellMeshes = [];                   // objects that are only drawn near the camera: { mesh, x, z, range } (see update())
  const keepClear = [];                    // [x, z, radius]: no trees or bushes here (signs, the park)
  const obstacles = [];                    // solid round obstacles for the car: { x, z, r }
  const iR0 = cross.dist.findIndex((d) => d >= (cross.length - (JP.rampLen + JP.pitLen + JP.landLen)) / 2);
  JP.r0 = cross.dist[iR0]; JP.r1 = JP.r0 + JP.rampLen; JP.l0 = JP.r1 + JP.pitLen; JP.l1 = JP.l0 + JP.landLen; JP.mid = (JP.r0 + JP.l1) / 2;
  const iL1 = cross.dist.findIndex((d) => d >= JP.l1);
  // the clearing around the ramps is a fenced rectangle: the track runs through it, the fence goes all around
  let iC0 = cross.dist.findIndex((d) => d >= JP.r0 - 26); iC0 -= iC0 % 2;
  let iC1 = cross.dist.findIndex((d) => d >= JP.l1 + 26); iC1 += iC1 % 2;
  const CLEAR_HALF = 12;
  JP.clearFrom = cross.dist[iC0]; JP.clearTo = cross.dist[iC1]; JP.clearHalf = CLEAR_HALF;
  // where the exit road leaves the entry road (the part before it shares the centre line and is not drawn twice)
  const FILM_SHARED = 36; // the last 72 m of the film road are the entry road, covered by the connector
  let branchIndex = 0;
  for (let i = 0; i < roads.connector.pts.length; i++) {
    let near = Infinity;
    for (const q of film.pts.slice(-44)) near = Math.min(near, Math.hypot(q.x - roads.connector.pts[i].x, q.z - roads.connector.pts[i].z));
    if (near > 3) { branchIndex = Math.max(0, i - 3); break; }
  }
  // the film starts on the road where it passes z = 0
  const filmStartIndex = film.pts.reduce((best, p, i) => (Math.abs(p.z) < Math.abs(film.pts[best].z) ? i : best), 0);
  const filmU0 = film.dist[filmStartIndex] / film.length;

  // nearest road: grid of all samples
  const CELL = 30;
  const SX = [], SZ = [], TX = [], TZ = [], SR = [], SI = [];
  const grid = new Map();
  const gridKey = (cx, cz) => (cx + 2000) * 8192 + (cz + 2000);
  for (const [name, road] of Object.entries(roads)) {
    const count = (road.closed ? road.n : road.n + 1) - (name === "film" ? FILM_SHARED : 0); // the entry road is the connector's in the other direction
    for (let i = 0; i < count; i++) {
      const id = SX.length;
      SX.push(road.pts[i].x); SZ.push(road.pts[i].z); TX.push(road.tans[i].x); TZ.push(road.tans[i].z); SR.push(name); SI.push(i);
      const key = gridKey(Math.floor(SX[id] / CELL), Math.floor(SZ[id] / CELL));
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(id);
    }
  }
  const hit = { dist: 999, offset: 0, road: "", index: -1, x: 0, z: 0, tx: 0, tz: -1 };
  function nearest(x, z, reach = 3) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = -1, bestD = Infinity;
    for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) {
      const list = grid.get(gridKey(cx + dx, cz + dz));
      if (!list) continue;
      for (const id of list) {
        const d = (SX[id] - x) ** 2 + (SZ[id] - z) ** 2;
        if (d < bestD) { bestD = d; best = id; }
      }
    }
    if (best < 0) { hit.dist = 999; hit.index = -1; return hit; }
    hit.dist = Math.sqrt(bestD); hit.index = best; hit.road = SR[best]; hit.local = SI[best]; hit.x = SX[best]; hit.z = SZ[best]; hit.tx = TX[best]; hit.tz = TZ[best];
    hit.offset = (x - SX[best]) * -TZ[best] + (z - SZ[best]) * TX[best]; // + = right of the driving direction
    return hit;
  }
  const roadDistance = (x, z) => nearest(x, z).dist;

  // flat along roads and on the plaza, rolling hills further away
  // The mesh is coarse (about 19 m): within 30 m of a road it lies flat and 0.25 m below the road surface, so a
  // slanted triangle can never cut through the asphalt.
  function heightAt(x, z, d = roadDistance(x, z)) {
    const flat = smooth((d - 30) / 40) * smooth((Math.hypot(x - PODIUM.x, z - PODIUM.z) - 80) / 40);
    const hills = (noise(x * 0.011, z * 0.011) * 16 + noise(x * 0.045, z * 0.045) * 2.2 - 7) * flat;
    return d < 30 ? Math.min(hills, -0.25) : hills;
  }

  // ---------- terrain ----------
  const grassTexture = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const image = g.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const v = 175 + Math.random() * 80;
      image.data.set([v, v, v * 0.92, 255], i * 4);
    }
    g.putImageData(image, 0, 0);
    for (let i = 0; i < 220; i++) { // blades
      g.strokeStyle = `rgba(${Math.random() < 0.5 ? "40,90,35" : "130,150,70"},.22)`;
      const x = Math.random() * 256, y = Math.random() * 256;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 6, y - 4 - Math.random() * 8); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(520, 520);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  })();
  const groundGeometry = new THREE.PlaneGeometry(3000, 3000, 160, 160).rotateX(-Math.PI / 2).translate(300, 0, -200);
  {
    const position = groundGeometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const palette = ["#2f6a34", "#3f7d3c", "#4d8a45", "#5a9448", "#6f9a4a", "#86994d"].map((c) => new THREE.Color(c));
    const dry = new THREE.Color("#8a8a4e"), c = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), z = position.getZ(i);
      position.setY(i, heightAt(x, z));
      const n = fbm(x * 0.012, z * 0.012, 3) * (palette.length - 1);
      const k = Math.floor(n);
      c.copy(palette[Math.min(k, palette.length - 1)]).lerp(palette[Math.min(k + 1, palette.length - 1)], n - k);
      c.lerp(dry, Math.max(0, noise(x * 0.03 + 7, z * 0.03) - 0.62) * 1.5);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    groundGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    groundGeometry.computeVertexNormals();
  }
  const ground = new THREE.Mesh(groundGeometry, new THREE.MeshLambertMaterial({ vertexColors: true, map: grassTexture }));
  scene.add(ground);

  // far mountains: ridged noise, forest -> rock -> snow
  {
    const M = { x: 300, z: -200, r0: 1080, r1: 2150 };
    const J = 320, K = 40;
    const positions = new Float32Array((J + 1) * (K + 1) * 3);
    const colors = new Float32Array((J + 1) * (K + 1) * 3);
    const forest = new THREE.Color("#2e4d3a"), rockA = new THREE.Color("#6d6a64"), rockB = new THREE.Color("#8d9096"), snow = new THREE.Color("#f0f4f8"), c = new THREE.Color();
    let id = 0;
    for (let j = 0; j <= J; j++) {
      const angle = (j / J) * TAU;
      for (let k = 0; k <= K; k++) {
        const t = k / K;
        const r = M.r0 + (M.r1 - M.r0) * t;
        const x = M.x + Math.cos(angle) * r, z = M.z + Math.sin(angle) * r;
        const wrap = Math.min(angle, TAU - angle) < 0.12 ? 0 : 1; // keep the seam quiet
        const ridge = 1 - Math.abs(2 * fbm(x * 0.0022, z * 0.0022, 5) - 1);
        const h = smooth(t / 0.55) * (90 + 560 * Math.pow(ridge, 1.6)) * (0.65 + 0.35 * smooth(t)) * (wrap ? 1 : 1);
        positions.set([x, h - 4, z], id * 3);
        const n = noise(x * 0.01, z * 0.01);
        c.copy(forest).lerp(rockA, smooth((h - 90) / 140)).lerp(rockB, smooth((h - 230 + n * 60) / 120)).lerp(snow, smooth((h - 340 + n * 90) / 70));
        colors.set([c.r, c.g, c.b], id * 3);
        id++;
      }
    }
    const indices = [];
    for (let j = 0; j < J; j++) for (let k = 0; k < K; k++) {
      const a = j * (K + 1) + k, b = a + K + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    scene.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  }

  // ---------- road surface ----------
  const asphalt = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#3d4046"; g.fillRect(0, 0, 256, 256);
    const image = g.getImageData(0, 0, 256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const v = (Math.random() - 0.5) * 34;
      image.data[i * 4] += v; image.data[i * 4 + 1] += v; image.data[i * 4 + 2] += v;
    }
    g.putImageData(image, 0, 0);
    for (let i = 0; i < 6; i++) { // hairline cracks
      g.strokeStyle = "rgba(20,20,22,.45)"; g.lineWidth = 1; g.beginPath();
      let x = Math.random() * 256, y = Math.random() * 256; g.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.3) * 30; g.lineTo(x, y); }
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  })();

  function ribbon(road, { offset = 0, half, y = 0, color = "#ffffff", map = null, dash = 0, layer = 1, opacity = 1, from = 0, to = road.n, skip = null }) {
    const positions = [], normals = [], uvs = [], indices = [];
    let count = 0;
    for (let i = from; i <= to; i++) {
      const p = road.pts[i], t = road.tans[i];
      const right = V(-t.z, 0, t.x);
      const w = typeof half === "function" ? half(road.dist[i]) : half;
      positions.push(p.x + right.x * (offset - w), y, p.z + right.z * (offset - w), p.x + right.x * (offset + w), y, p.z + right.z * (offset + w));
      normals.push(0, 1, 0, 0, 1, 0);
      uvs.push(0, road.dist[i] / 8.5, 1, road.dist[i] / 8.5);
      if (i > from && !(dash && Math.floor(road.dist[i] / dash) % 2 === 1) && !(skip && (skip(i) || skip(i - 1)))) {
        const k = count * 2;
        indices.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
      count++;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    const material = new THREE.MeshLambertMaterial({ color, map, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, polygonOffset: true, polygonOffsetFactor: -layer, polygonOffsetUnits: -layer * 2 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  }
  // gravel and stones in several browns and greys (the verge beside the roads and the clearing around the ramps)
  function makeRockyTexture(repeatX) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d"), w = 256, h = 256;
    g.fillStyle = "#6b5a3e"; g.fillRect(0, 0, w, h);
    const image = g.getImageData(0, 0, w, h);
    for (let i = 0; i < w * h; i++) { const v = (Math.random() - 0.5) * 34; image.data[i * 4] += v; image.data[i * 4 + 1] += v * 0.9; image.data[i * 4 + 2] += v * 0.75; }
    g.putImageData(image, 0, 0);
    for (let i = 0; i < 46; i++) { g.fillStyle = `rgba(${["122,102,70", "90,74,50", "138,119,82", "79,65,48", "154,138,104"][i % 5]},.45)`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 14 + Math.random() * 34, 8 + Math.random() * 20, Math.random() * Math.PI, 0, TAU); g.fill(); }
    for (let i = 0; i < 70; i++) { // stones with a light edge on top and a shadow below
      const x = Math.random() * w, y = Math.random() * h, rw = 3 + Math.random() * 8, rh = rw * (0.6 + Math.random() * 0.3), tone = 95 + Math.random() * 70;
      g.fillStyle = "rgba(25,18,10,.5)"; g.beginPath(); g.ellipse(x + 1.5, y + 2, rw, rh, 0, 0, TAU); g.fill();
      g.fillStyle = `rgb(${tone | 0},${(tone * 0.93) | 0},${(tone * 0.8) | 0})`; g.beginPath(); g.ellipse(x, y, rw, rh, 0, 0, TAU); g.fill();
      g.fillStyle = "rgba(255,245,225,.28)"; g.beginPath(); g.ellipse(x - rw * 0.25, y - rh * 0.3, rw * 0.5, rh * 0.4, 0, 0, TAU); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, 1); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  const shoulderTexture = makeRockyTexture(1.45);

  // lane markings end before every junction (the junction pads stay plain asphalt): no lines run across other roads
  const junctions = [[R0.x, R0.z, 12.8], [T0.x, T0.z, 12.5], [branch.x + reverse.x * 5, branch.z + reverse.z * 5, 12.5]];
  const nearJunction = (q) => junctions.some(([jx, jz, r]) => (q.x - jx) ** 2 + (q.z - jz) ** 2 < r * r);
  for (const road of Object.values(roads)) {
    if (road === roads.cross) continue;
    const skip = (i) => nearJunction(road.pts[i]); // the forest track has its own (dirt) surface below
    const spans = road === roads.cross ? [[0, iR0], [iL1, road.n]] : [[road === roads.connector ? branchIndex : 0, road.n]]; // no asphalt in the jump park
    for (const [from, to] of spans) {
    ribbon(road, { from, to, half: 6.1, y: 0.02, color: "#ffffff", map: shoulderTexture, layer: 1 });          // gravel shoulder with stones
    ribbon(road, { from, to, half: ROAD_HALF, y: 0.025, color: "#ffffff", map: asphalt, layer: 2 });          // asphalt
    ribbon(road, { from, to, skip, offset: -1.95, half: 0.55, y: 0.03, color: "#26282c", layer: 3, opacity: 0.32 }); // tyre wear
    ribbon(road, { from, to, skip, offset: 1.95, half: 0.55, y: 0.03, color: "#26282c", layer: 3, opacity: 0.32 });
    ribbon(road, { from, to, skip, offset: -3.85, half: 0.1, y: 0.035, color: "#ecebe2", layer: 4 });               // edge lines
    ribbon(road, { from, to, skip, offset: 3.85, half: 0.1, y: 0.035, color: "#ecebe2", layer: 4 });
    ribbon(road, { from, to, skip, half: 0.11, y: 0.035, color: "#ecebe2", layer: 4, dash: 3 });                    // centre dashes
    }
  }


  // loose stones on the verge beside the roads
  {
    const geometry = new THREE.OctahedronGeometry(0.5, 0);
    const material = new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true });
    const CELL = 160, groups = new Map();
    for (const road of Object.values(roads)) {
      if (road === roads.cross) continue;
      for (let i = road === roads.connector ? branchIndex : 0; i < road.n; i += 3) {
        const q = road.pts[i], t = road.tans[i];
        if (nearJunction(q) || Math.hypot(q.x - PODIUM.x, q.z - PODIUM.z) < 70) continue;
        for (const side of [-1, 1]) {
          if (Math.random() < 0.3) continue;
          const lat = side * rand(4.5, 6.0);
          const x = q.x - t.z * lat + rand(-1.5, 1.5), z = q.z + t.x * lat + rand(-1.5, 1.5);
          const key = Math.floor(x / CELL) + "," + Math.floor(z / CELL);
          if (!groups.has(key)) groups.set(key, { x: (Math.floor(x / CELL) + 0.5) * CELL, z: (Math.floor(z / CELL) + 0.5) * CELL, list: [] });
          groups.get(key).list.push({ x, z, sc: Math.random() < 0.12 ? rand(0.3, 0.5) : rand(0.08, 0.26), yaw: rand(0, TAU) });
        }
      }
    }
    const m = new THREE.Matrix4(), col = new THREE.Color();
    for (const g of groups.values()) {
      const mesh = new THREE.InstancedMesh(geometry, material, g.list.length);
      g.list.forEach((st, i) => {
        m.compose(V(st.x, 0.02 + st.sc * 0.2, st.z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), st.yaw), V(st.sc * rand(1, 1.5), st.sc * 0.55, st.sc * rand(0.8, 1.2)));
        mesh.setMatrixAt(i, m); mesh.setColorAt(i, col.setHSL(0.09, rand(0.04, 0.2), rand(0.28, 0.5)));
      });
      mesh.computeBoundingSphere();
      scene.add(mesh);
      cellMeshes.push({ mesh, x: g.x, z: g.z, range: 140 + CELL * 0.75 });
    }
  }

  // junction pads where the exit road leaves the entry road and where it meets the ring
  for (const [point, radius] of [[branch.clone().addScaledVector(reverse, 5), 8], [R0, 8.5]]) {
    const gravel = new THREE.Mesh(new THREE.CircleGeometry(radius + 2.2, 28).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#7e7562", polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    gravel.position.set(point.x, 0.021, point.z);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(radius, 28).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#ffffff", map: asphalt, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    pad.position.set(point.x, 0.0262, point.z);
    scene.add(gravel, pad);
  }

  // distance to the nearest sample of any road except `exclude` (used to leave gaps in the guard rails at junctions)
  function distanceToOther(x, z, exclude) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const list = grid.get(gridKey(cx + dx, cz + dz));
      if (!list) continue;
      for (const id of list) if (SR[id] !== exclude) best = Math.min(best, (SX[id] - x) ** 2 + (SZ[id] - z) ** 2);
    }
    return Math.sqrt(best);
  }

  const BARRIER_INDEX = Math.min(112, roads.connector.pts.length - 12); // on the exit road, a good 20 m before it meets the ring
  const barrierPoint = roads.connector.pts[BARRIER_INDEX];

  // guard rails on both sides (cars cannot cross them: see RAIL_OFFSET in drive.js), none at junctions and the show area
  {
    const OFFSET = RAIL_OFFSET;
    const posts = [], beams = [];
    for (const [name, road] of Object.entries(roads)) {
      const stepSamples = 2; // a post every 4 m
      const count = road.closed ? road.n : road.n - stepSamples;
      for (let i = 0; i < count; i += stepSamples) {
        const j = road.closed ? (i + stepSamples) % road.n : i + stepSamples;
        for (const side of [-1, 1]) {
          const off = name === "cross" ? (i >= iC0 && j <= iC1 ? CLEAR_HALF : CROSS_RAIL) : OFFSET;
          const a = road.pts[i], ta = road.tans[i], b = road.pts[j], tb = road.tans[j];
          const ax = a.x - ta.z * off * side, az = a.z + ta.x * off * side;
          const bx = b.x - tb.z * off * side, bz = b.z + tb.x * off * side;
          if (Math.hypot(ax - PODIUM.x, az - PODIUM.z) < 62 || (name === "connector" && Math.hypot(ax - barrierPoint.x, az - barrierPoint.z) < 13) || distanceToOther(ax, az, name) < 9.5 || distanceToOther(bx, bz, name) < 9.5) continue;
          posts.push([ax, az]);
          const length = Math.hypot(bx - ax, bz - az);
          beams.push([(ax + bx) / 2, (az + bz) / 2, Math.atan2(-(bx - ax), -(bz - az)), length]);
        }
      }
    }
    for (const iEnd of [iC0, iC1]) for (const side of [-1, 1]) { // the fence across the clearing at both ends (the track passes between the two halves)
      const base0 = cross.pts[iEnd], tb = cross.tans[iEnd];
      const lats = [CROSS_RAIL, 7.2, 9.6, CLEAR_HALF];
      lats.forEach((lat, k) => {
        const x = base0.x - tb.z * lat * side, z = base0.z + tb.x * lat * side;
        posts.push([x, z]);
        if (k) { const px = base0.x - tb.z * lats[k - 1] * side, pz = base0.z + tb.x * lats[k - 1] * side; beams.push([(x + px) / 2, (z + pz) / 2, Math.atan2(-(x - px), -(z - pz)), Math.hypot(x - px, z - pz)]); }
      });
    }
    const metal = new THREE.MeshStandardMaterial({ color: "#b9bec6", roughness: 0.45, metalness: 0.7 });
    const postMaterial = new THREE.MeshStandardMaterial({ color: "#7d838c", roughness: 0.6, metalness: 0.5 });
    const postGeometry = new THREE.BoxGeometry(0.1, 1.15, 0.1).translate(0, 0.27, 0);
    // the beam is a unit-long box along -z, scaled to the length of the segment (profile: upper and lower rib)
    const beamGeometry = mergeGeometries([new THREE.BoxGeometry(0.07, 0.3, 1).translate(0, 0.66, 0), new THREE.BoxGeometry(0.1, 0.07, 1).translate(0, 0.84, 0), new THREE.BoxGeometry(0.1, 0.07, 1).translate(0, 0.5, 0)]);
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), up = V(0, 1, 0);
    const RAIL_CELL = 320, chunks = new Map();
    const chunkOf = (x, z) => { const key = Math.floor(x / RAIL_CELL) + "," + Math.floor(z / RAIL_CELL); if (!chunks.has(key)) chunks.set(key, { x: (Math.floor(x / RAIL_CELL) + 0.5) * RAIL_CELL, z: (Math.floor(z / RAIL_CELL) + 0.5) * RAIL_CELL, posts: [], beams: [] }); return chunks.get(key); };
    posts.forEach((p) => chunkOf(p[0], p[1]).posts.push(p));
    beams.forEach((bm) => chunkOf(bm[0], bm[1]).beams.push(bm));
    for (const c of chunks.values()) { // far away the rails are hidden: fewer triangles
      const postMesh = new THREE.InstancedMesh(postGeometry, postMaterial, c.posts.length);
      c.posts.forEach(([x, z], i) => { matrix.compose(V(x, 0, z), q.identity(), V(1, 1, 1)); postMesh.setMatrixAt(i, matrix); });
      const beamMesh = new THREE.InstancedMesh(beamGeometry, metal, c.beams.length);
      c.beams.forEach(([x, z, yaw, length], i) => { matrix.compose(V(x, 0, z), q.setFromAxisAngle(up, yaw), V(1, 1, length)); beamMesh.setMatrixAt(i, matrix); });
      for (const mesh of [postMesh, beamMesh]) { mesh.computeBoundingSphere(); scene.add(mesh); cellMeshes.push({ mesh, x: c.x, z: c.z, range: 430 + RAIL_CELL * 0.75 }); }
    }
  }

  // one-way barrier on the exit road: it closes behind the car so nobody drives back into the show (people!)
  const barrier = (() => {
    const road = roads.connector;
    const p = road.pts[BARRIER_INDEX], t = road.tans[BARRIER_INDEX];
    const group = new THREE.Group();
    group.position.set(p.x, 0, p.z);
    group.rotation.y = Math.atan2(-t.x, -t.z); // local -z = driving direction of the exit road
    const stripes = (() => {
      const c = document.createElement("canvas");
      c.width = 256; c.height = 32;
      const g = c.getContext("2d");
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#f4f4f0" : "#d12a2a"; g.fillRect(i * 32, 0, 32, 32); }
      const texture = new THREE.CanvasTexture(c);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    })();
    const yieldSign = (() => { // blue arrow sign: "turn left here" (the exit road meets the ring)
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const g = c.getContext("2d");
      g.fillStyle = "#ffffff"; g.beginPath(); g.arc(128, 128, 124, 0, TAU); g.fill();
      g.fillStyle = "#1d5fc4"; g.beginPath(); g.arc(128, 128, 112, 0, TAU); g.fill();
      g.strokeStyle = "#ffffff"; g.lineWidth = 26; g.lineJoin = "miter";
      g.beginPath(); g.moveTo(156, 206); g.lineTo(156, 128); g.lineTo(104, 128); g.stroke();
      g.fillStyle = "#ffffff"; g.beginPath(); g.moveTo(40, 128); g.lineTo(108, 80); g.lineTo(108, 176); g.closePath(); g.fill();
      const texture = new THREE.CanvasTexture(c);
      texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
      return texture;
    })();
    const sign = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const g = c.getContext("2d");
      g.fillStyle = "#d12a2a"; g.beginPath(); g.arc(128, 128, 120, 0, TAU); g.fill();
      g.fillStyle = "#fff"; g.fillRect(52, 108, 152, 40);
      const texture = new THREE.CanvasTexture(c);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    })();
    const lampMaterial = new THREE.MeshBasicMaterial({ color: "#4a0f0f" });
    const lamps = [];
    const pivot = new THREE.Group(); // the boom swings up and down around the left post
    pivot.position.set(-5.9, 1.15, 0);
    pivot.rotation.z = 1.45;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.36, 0.16), new THREE.MeshLambertMaterial({ map: stripes }));
    arm.position.set(5.8, 0, 0);
    pivot.add(arm);
    for (const x of [2.2, 5.8, 9.4]) { const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), lampMaterial.clone()); lamp.position.set(x, 0.27, 0); pivot.add(lamp); lamps.push(lamp); }
    group.add(pivot);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.5, 8), new THREE.MeshLambertMaterial({ color: "#e8e8e4" }));
      post.position.set(side * 5.9, 0.75, 0);
      group.add(post);
      // front (towards the car that leaves the show): yield sign. back (towards the ring): red no-entry sign
      const yieldBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: yieldSign, transparent: true, alphaTest: 0.2 }));
      yieldBoard.position.set(side * 6.4, 2.15, 9); // a few metres before the barrier, beside the road
      const yieldPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 6), new THREE.MeshLambertMaterial({ color: "#777" }));
      yieldPole.position.set(side * 6.4, 1.15, 8.93); group.add(yieldPole); // the pole stands behind the board
      { const th = group.rotation.y, lx = side * 6.4, lz = 9; keepClear.push([p.x + lx * Math.cos(th) + lz * Math.sin(th), p.z - lx * Math.sin(th) + lz * Math.cos(th), 7]); }
      const noEntry = new THREE.Mesh(new THREE.CircleGeometry(0.55, 28), new THREE.MeshBasicMaterial({ map: sign }));
      noEntry.position.set(side * 5.9, 2.15, -0.07); noEntry.rotation.y = Math.PI;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 6), new THREE.MeshLambertMaterial({ color: "#777" }));
      pole.position.set(side * 5.9, 1.15, 0);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), lampMaterial.clone());
      lamp.position.set(side * 5.9, 1.68, 0.0);
      lamps.push(lamp);
      group.add(yieldBoard, noEntry, pole, lamp);
    }
    group.visible = false; // the barrier is built when the drive starts
    scene.add(group);
    return { group, pivot, lamps, settle: 0, x: p.x, z: p.z, tx: t.x, tz: t.z, index: BARRIER_INDEX, closing: false, t: 0 };
  })();


  // ---------- forest track in the middle with a short ramp, deer signs ----------
  const jumpAnchor = cross.pts[iR0], jumpTan = cross.tans[iR0];
  const MAX_ANISOTROPY = renderer.capabilities.getMaxAnisotropy();
  const canvasTexture = (w, h, draw, repeat) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAX_ANISOTROPY;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  };
  const dirtTexture = canvasTexture(256, 256, (g) => {
    g.fillStyle = "#8b7048"; g.fillRect(0, 0, 256, 256);
    const image = g.getImageData(0, 0, 256, 256);
    for (let i = 0; i < 256 * 256; i++) { const v = (Math.random() - 0.5) * 40; image.data[i * 4] += v; image.data[i * 4 + 1] += v * 0.9; image.data[i * 4 + 2] += v * 0.7; }
    g.putImageData(image, 0, 0);
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? "70,55,38" : "190,165,120"},.5)`; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2.5, 0, TAU); g.fill(); }
  }, [1, 1]);
  { // the track: one continuous dirt road with two ruts (it also runs under the ramps), a wide clearing around the ramps
    const rockyTexture = makeRockyTexture(3);
    ribbon(cross, { from: iC0, to: iC1, half: CLEAR_HALF - 0.2, y: 0.016, color: "#ffffff", map: rockyTexture, layer: 1 });
    { // loose stones on the ground of the clearing (small ones everywhere, bigger ones beside the track)
      const stoneGeometry = new THREE.DodecahedronGeometry(0.5, 0);
      const list = [];
      for (let k = 0; k < 150; k++) {
        const i = iC0 + Math.floor(Math.random() * (iC1 - iC0)), pt = cross.pts[i], tt = cross.tans[i];
        const big = Math.random() < 0.3, lat = (Math.random() < 0.5 ? -1 : 1) * (big ? rand(5.4, CLEAR_HALF - 0.8) : rand(0, CLEAR_HALF - 0.6));
        list.push({ x: pt.x - tt.z * lat, z: pt.z + tt.x * lat, sc: big ? rand(0.5, 1.1) : rand(0.12, 0.34), yaw: rand(0, TAU) });
      }
      const stones = new THREE.InstancedMesh(stoneGeometry, new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true }), list.length);
      const m = new THREE.Matrix4(), col = new THREE.Color();
      list.forEach((st, i) => {
        m.compose(V(st.x, st.sc * 0.25, st.z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), st.yaw), V(st.sc * rand(1, 1.5), st.sc * 0.6, st.sc * rand(0.8, 1.2)));
        stones.setMatrixAt(i, m); stones.setColorAt(i, col.setHSL(0.09, rand(0.04, 0.2), rand(0.3, 0.5)));
      });
      stones.computeBoundingSphere();
      scene.add(stones);
      const mid = cross.pts[Math.round((iC0 + iC1) / 2)];
      cellMeshes.push({ mesh: stones, x: mid.x, z: mid.z, range: 260 + 60 });
    }
    ribbon(cross, { from: 6, to: cross.n - 6, half: 4.4, y: 0.02, color: "#4f4a30", layer: 2 });
    ribbon(cross, { from: 6, to: cross.n - 6, half: 3.1, y: 0.025, color: "#ffffff", map: dirtTexture, layer: 3 });
    ribbon(cross, { from: 6, to: cross.n - 6, offset: -1.15, half: 0.42, y: 0.03, color: "#43362a", layer: 4, opacity: 0.5 });
    ribbon(cross, { from: 6, to: cross.n - 6, offset: 1.15, half: 0.42, y: 0.03, color: "#43362a", layer: 4, opacity: 0.5 });
    for (let d = JP.clearFrom - 8; d < JP.clearTo + 8; d += 8) { const q = cross.pts[Math.round(d / (cross.length / cross.n))]; keepClear.push([q.x, q.z, 17]); }
  }
  { // where the track meets the ring on the far side: the same pad as at the other junctions
    const gravel = new THREE.Mesh(new THREE.CircleGeometry(10.2, 28).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#7e7562", polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    const pad = new THREE.Mesh(new THREE.CircleGeometry(8, 28).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#ffffff", map: asphalt, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    gravel.position.set(T0.x, 0.021, T0.z); pad.position.set(T0.x, 0.0262, T0.z);
    scene.add(gravel, pad);
  }

  // a wooden warning sign stands on the track at each end: "Achtung, nicht durchfahren"
  {
    const woodTexture = canvasTexture(512, 256, (g, w, h) => {
      g.fillStyle = "#8a6034"; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 64) { g.fillStyle = y % 128 ? "#7d5629" : "#936a3b"; g.fillRect(0, y, w, 62); g.fillStyle = "#4b3118"; g.fillRect(0, y + 62, w, 3); }
      for (let i = 0; i < 90; i++) { g.strokeStyle = "rgba(60,36,16,.25)"; g.beginPath(); const y = Math.random() * h, x = Math.random() * w; g.moveTo(x, y); g.lineTo(x + 30 + Math.random() * 90, y + (Math.random() - 0.5) * 3); g.stroke(); }
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#c01818";
      g.font = "bold 70px system-ui, Arial, sans-serif"; g.fillText("ACHTUNG", w / 2, 78);
      g.fillStyle = "#1e1208"; g.font = "bold 44px system-ui, Arial, sans-serif"; g.fillText("NICHT DURCHFAHREN", w / 2, 160);
      g.font = "30px system-ui, Arial, sans-serif"; g.fillText("Sprungstrecke", w / 2, 213);
    });
    const boardMaterial = new THREE.MeshBasicMaterial({ map: woodTexture, color: "#d8d8d8" }), woodMaterial = new THREE.MeshLambertMaterial({ color: "#6a4a28" });
    const makeSign = (x, z, nx, nz) => {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.rotation.y = Math.atan2(nx, nz); // the board faces (nx, nz)
      for (const px of [-0.95, 0.95]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.1, 0.16), woodMaterial); post.position.set(px, 1.05, -0.1); group.add(post); }
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.15, 0.1), woodMaterial); back.position.set(0, 1.55, -0.02); group.add(back);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), boardMaterial); board.position.set(0, 1.55, 0.04); group.add(board);
      scene.add(group);
      obstacles.push({ x, z, r: 1.3 });
      keepClear.push([x, z, 7]);
    };
    const nearStart = cross.pts[12], nearEnd = cross.pts[cross.n - 12];
    makeSign(nearStart.x, nearStart.z, -1, 0); // for drivers coming from the start
    makeSign(nearEnd.x, nearEnd.z, 1, 0);      // for drivers coming from the far side
  }

  // deer warning signs beside the ring road (a pair every now and then: for both directions)
  {
    const triangle = canvasTexture(256, 256, (g) => {
      g.fillStyle = "#d12a2a"; g.beginPath(); g.moveTo(128, 8); g.lineTo(250, 232); g.lineTo(6, 232); g.closePath(); g.fill();
      g.fillStyle = "#ffffff"; g.beginPath(); g.moveTo(128, 46); g.lineTo(212, 206); g.lineTo(44, 206); g.closePath(); g.fill();
      g.save(); g.translate(128, 158); g.scale(0.56, 0.56); g.translate(-145, -131); // smaller: it stays inside the white triangle
      g.fillStyle = "#16181c"; // the deer: body, legs, neck, head, antlers
      g.beginPath(); g.ellipse(124, 150, 34, 17, 0, 0, TAU); g.fill();
      for (const x of [98, 108, 140, 150]) g.fillRect(x - 2.5, 154, 5, 40);
      g.beginPath(); g.moveTo(148, 142); g.lineTo(162, 100); g.lineTo(174, 106); g.lineTo(160, 150); g.fill();
      g.beginPath(); g.ellipse(170, 100, 12, 8, -0.3, 0, TAU); g.fill();
      g.strokeStyle = "#16181c"; g.lineWidth = 6; g.beginPath(); g.moveTo(166, 94); g.lineTo(160, 70); g.moveTo(160, 82); g.lineTo(148, 76); g.moveTo(172, 92); g.lineTo(182, 68); g.moveTo(180, 80); g.lineTo(192, 76); g.stroke();
      g.restore();
    });
    const ring = roads.ring, step = ring.length / ring.n;
    const placed = [];
    for (let sDist = 120; sDist < ring.length - 60; sDist += 190) {
      const i = Math.round(sDist / step);
      const t = ring.tans[i], p = ring.pts[i];
      for (const side of [1, -1]) { // right of the ring direction first, then the left
        const x = p.x - t.z * 7.6 * side, z = p.z + t.x * 7.6 * side;
        if (distanceToOther(x, z, "ring") < 30 || Math.hypot(x - PODIUM.x, z - PODIUM.z) < 120) continue;
        placed.push({ x, z, yaw: Math.atan2(-t.x * side, -t.z * side) }); // faces the oncoming traffic of its side
        keepClear.push([x, z, 7]); // no trees around the sign
      }
    }
    // the board faces +z of the instance; the pole stands 7 cm behind it
    const boards = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.2, 1.2).translate(0, 2.25, 0), new THREE.MeshBasicMaterial({ map: triangle, transparent: true, alphaTest: 0.3 }), placed.length);
    // the back of the sign is plain grey metal (drivers coming from the other direction do not see a mirrored picture)
    const backTexture = canvasTexture(64, 64, (g) => { g.fillStyle = "#8a8d93"; g.beginPath(); g.moveTo(32, 2); g.lineTo(62, 58); g.lineTo(2, 58); g.closePath(); g.fill(); });
    const backs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.2, 1.2).rotateY(Math.PI).translate(0, 2.25, -0.012), new THREE.MeshBasicMaterial({ map: backTexture, transparent: true, alphaTest: 0.3 }), placed.length);
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 2.45, 6).translate(0, 1.225, -0.07), new THREE.MeshLambertMaterial({ color: "#8a8d93" }), placed.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = V(0, 1, 0);
    placed.forEach((sg, i) => { m.compose(V(sg.x, 0, sg.z), q.setFromAxisAngle(up, sg.yaw), V(1, 1, 1)); boards.setMatrixAt(i, m); backs.setMatrixAt(i, m); poles.setMatrixAt(i, m); });
    boards.frustumCulled = false; backs.frustumCulled = false; poles.frustumCulled = false;
    if (placed.length) scene.add(boards, backs, poles);
  }

  // ---------- the ramps: two steel ramps close together, a dirt gap between them ----------
  const park = new THREE.Group();
  park.position.set(jumpAnchor.x, 0, jumpAnchor.z);
  park.rotation.y = Math.atan2(-jumpTan.x, -jumpTan.z); // local -z = direction of increasing distance
  scene.add(park);
  const hw = JP.W / 2;
  function wedge(len, rising) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(len, 0);
    if (rising) shape.lineTo(len, JP.H); else shape.lineTo(0, JP.H);
    const g = new THREE.ExtrudeGeometry(shape, { depth: JP.W, bevelEnabled: false });
    g.rotateY(Math.PI / 2); g.translate(-hw, 0, 0); // profile along -z
    return g;
  }
  function surface(len, yFrom, yTo, repeat) {
    const w = hw - 0.12;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-w, yFrom, 0, w, yFrom, 0, -w, yTo, -len, w, yTo, -len], 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, repeat, 1, repeat], 2));
    g.setIndex([0, 1, 2, 1, 3, 2]);
    g.computeVertexNormals();
    return g;
  }
  const plateTexture = canvasTexture(512, 512, (g, w, h) => { // diamond plate with painted white chevron
    g.fillStyle = "#666c74"; g.fillRect(0, 0, w, h);
    for (let row = 0; row < 16; row++) for (let col = 0; col < 16; col++) {
      g.save(); g.translate(col * 32 + 16 + (row % 2 ? 16 : 0), row * 32 + 16); g.rotate(row % 2 ? 0.8 : -0.8);
      g.fillStyle = "#9aa1a9"; g.beginPath(); g.ellipse(0, 0, 11, 3.2, 0, 0, TAU); g.fill(); g.restore();
    }
    g.strokeStyle = "#f4f4ee"; g.lineJoin = "miter"; g.lineWidth = 34;
    g.beginPath(); g.moveTo(70, 400); g.lineTo(256, 250); g.lineTo(442, 400); g.stroke();
    g.lineWidth = 16; g.globalAlpha = 0.7; g.beginPath(); g.moveTo(70, 250); g.lineTo(256, 100); g.lineTo(442, 250); g.stroke();
  }, [1, 1]);
  const steel = new THREE.MeshStandardMaterial({ map: plateTexture, roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide });
  const bodyMat = new THREE.MeshStandardMaterial({ color: "#5d636b", roughness: 0.7, metalness: 0.25, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: "#2a2d33", roughness: 0.6, metalness: 0.4 });
  const yellow = new THREE.MeshStandardMaterial({ color: "#f2c21a", roughness: 0.5 });
  const hazard = canvasTexture(128, 32, (g, w, h) => {
    g.fillStyle = "#16171a"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#ffcc1a";
    for (let i = -2; i < 10; i++) { g.beginPath(); g.moveTo(i * 24, h); g.lineTo(i * 24 + 12, h); g.lineTo(i * 24 + 12 + h, 0); g.lineTo(i * 24 + h, 0); g.fill(); }
  }, [3, 1]);
  const amber = new THREE.MeshBasicMaterial({ color: "#ffb020" });
  const slope = Math.atan2(JP.H, JP.rampLen), slopeLength = Math.hypot(JP.rampLen, JP.H);
  const addRamp = (z0, rising) => {
    const g = new THREE.Group();
    g.position.set(0, 0, z0);
    g.add(new THREE.Mesh(wedge(JP.rampLen, rising), bodyMat));
    const top = new THREE.Mesh(rising ? surface(JP.rampLen, 0.03, JP.H + 0.03, 2) : surface(JP.rampLen, JP.H + 0.03, 0.03, -2), steel);
    g.add(top);
    const angle = rising ? slope : -slope;
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, slopeLength), yellow); // painted edge board along the slope
      edge.position.set(side * (hw - 0.1), JP.H / 2 + 0.06, -JP.rampLen / 2); edge.rotation.x = angle; g.add(edge);
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, JP.rampLen + 0.4), dark); // steel base rail on the ground
      skirt.position.set(side * (hw + 0.08), 0.08, -JP.rampLen / 2); g.add(skirt);
      for (let k = 0; k < 5; k++) { // ribs on the side wall
        const u = 0.9 + k * ((JP.rampLen - 1.8) / 4), h = rising ? (JP.H * u) / JP.rampLen : JP.H * (1 - u / JP.rampLen);
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.16, Math.max(0.2, h - 0.05), 0.34), dark);
        rib.position.set(side * (hw + 0.04), Math.max(0.2, h - 0.05) / 2, -u); g.add(rib);
      }
    }
    const lipZ = rising ? -JP.rampLen + 0.2 : -0.2;
    const lip = new THREE.Mesh(new THREE.BoxGeometry(JP.W - 0.1, 0.12, 0.42), new THREE.MeshBasicMaterial({ map: hazard }));
    lip.position.set(0, JP.H + 0.05, lipZ); g.add(lip);
    for (const side of [-1, 1]) { const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), amber); lamp.position.set(side * (hw - 0.3), JP.H + 0.22, lipZ); g.add(lamp); }
    park.add(g);
  };
  addRamp(0, true);
  addRamp(-(JP.rampLen + JP.pitLen), false);
  const zEnd = -(JP.rampLen * 2 + JP.pitLen);

  // state of the track under a point: where along it, the ground height on the ramps, the gap between them
  const ti = { near: false, d: 0, lat: 0, tx: 1, tz: 0, on: false, gap: false, h: 0, slope: 0, zone: false };
  const crossStep = cross.length / cross.n;
  function trailInfo(x, z) {
    ti.near = ti.on = ti.gap = ti.zone = false; ti.h = 0; ti.slope = 0;
    if (Math.abs(z + 170) > 16 || x < R0.x - 12 || x > T0.x + 12) return ti;
    const centre = Math.round((x - R0.x) / crossStep);
    let best = -1, bd = Infinity;
    for (let i = Math.max(0, centre - 4); i <= Math.min(cross.n, centre + 4); i++) { const dx = cross.pts[i].x - x, dz = cross.pts[i].z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    if (best < 0 || bd > 256) return ti;
    const p = cross.pts[best], t = cross.tans[best];
    ti.near = true; ti.tx = t.x; ti.tz = t.z;
    ti.lat = (x - p.x) * -t.z + (z - p.z) * t.x;
    ti.d = cross.dist[best] + (x - p.x) * t.x + (z - p.z) * t.z;
    const d = ti.d, a = Math.abs(ti.lat);
    ti.zone = d > JP.clearFrom && d < JP.clearTo;
    if (d >= JP.r0 && d < JP.r1 && a < hw) { ti.on = true; ti.h = (JP.H * (d - JP.r0)) / JP.rampLen; ti.slope = JP.H / JP.rampLen; }
    else if (d >= JP.l0 && d < JP.l1 && a < hw) { ti.on = true; ti.h = JP.H * (1 - (d - JP.l0) / JP.landLen); ti.slope = -JP.H / JP.landLen; }
    else if (d >= JP.r1 && d < JP.l0 && a < hw + 0.3) ti.gap = true;
    return ti;
  }
  const trailAt = (d) => {
    const i = Math.min(cross.n, Math.max(0, cross.dist.findIndex((q) => q >= d)));
    return { x: cross.pts[i].x, z: cross.pts[i].z, tx: cross.tans[i].x, tz: cross.tans[i].z };
  };


  // autumn leaves on the road and its edges
  {
    const geometry = new THREE.CircleGeometry(0.075, 5).rotateX(-Math.PI / 2).scale(1.5, 1, 1);
    const spots = [];
    for (const road of Object.values(roads)) {
      if (road === roads.cross) continue;
      for (let i = road === roads.connector ? branchIndex : 0; i < road.n; i++) {
        if (road === roads.cross && i >= iR0 && i <= iL1) continue;
        const p = road.pts[i], t = road.tans[i];
        for (let k = 0; k < 5; k++) {
          const edge = Math.random() < 0.72;
          const lateral = edge ? (Math.random() < 0.5 ? -1 : 1) * rand(3.0, 6.4) : rand(-4.1, 4.1);
          spots.push([p.x - t.z * lateral + t.x * rand(-1, 1), p.z + t.x * lateral + t.z * rand(-1, 1)]);
        }
      }
    }
    const leafMaterial = new THREE.MeshLambertMaterial({ color: "#ffffff", polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 });
    const matrix = new THREE.Matrix4(), colour = new THREE.Color();
    const LEAF_CELL = 160, groups = new Map();
    for (const sp of spots) { const key = Math.floor(sp[0] / LEAF_CELL) + "," + Math.floor(sp[1] / LEAF_CELL); if (!groups.has(key)) groups.set(key, { x: (Math.floor(sp[0] / LEAF_CELL) + 0.5) * LEAF_CELL, z: (Math.floor(sp[1] / LEAF_CELL) + 0.5) * LEAF_CELL, list: [] }); groups.get(key).list.push(sp); }
    const palette = ["#8a4b1f", "#b5651d", "#c98a2b", "#a33a1a", "#6e4a22", "#d4b13a", "#7a8a35", "#5e3a1a"];
    for (const g of groups.values()) { // leaves are tiny: only drawn close to the camera
      const leaves = new THREE.InstancedMesh(geometry, leafMaterial, g.list.length);
      g.list.forEach(([x, z], i) => {
        const sc = rand(0.7, 1.6);
        matrix.compose(V(x, 0.06, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rand(0, TAU)), V(sc, 1, sc));
        leaves.setMatrixAt(i, matrix);
        leaves.setColorAt(i, colour.set(pick(palette)));
      });
      leaves.computeBoundingSphere();
      scene.add(leaves);
      cellMeshes.push({ mesh: leaves, x: g.x, z: g.z, range: 170 + LEAF_CELL * 0.75 });
    }
  }

  // ---------- vegetation ----------
  function jitter(geometry, amount) {
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i, x + (hash(x * 7.1, z * 5.3 + y) - 0.5) * amount, y + (hash(y * 3.7, x * 2.1 + z) - 0.5) * amount * 0.6, z + (hash(z * 6.3, y * 4.1 + x) - 0.5) * amount);
    }
    geometry.computeVertexNormals();
    return geometry;
  }
  const foliageMaterial = new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true });
  const tiers = [[2.7, 3.2, 2.4], [2.2, 3.0, 3.7], [1.6, 2.6, 4.9], [1.0, 2.3, 6.0]].map(([r, h, y]) => jitter(new THREE.ConeGeometry(r, h, 7, 1, true).translate(0, y, 0), 0.5));
  const pineGeometry = mergeGeometries(tiers);
  const pineTrunk = new THREE.CylinderGeometry(0.22, 0.38, 2.2, 5).translate(0, 1.1, 0);
  const canopyGeometry = mergeGeometries([
    jitter(new THREE.IcosahedronGeometry(1.9, 0).scale(1, 0.85, 1).translate(0, 4.6, 0), 0.5),
    jitter(new THREE.IcosahedronGeometry(1.3, 0).translate(1.2, 3.7, 0.5), 0.4),
    jitter(new THREE.IcosahedronGeometry(1.2, 0).translate(-1.1, 3.9, -0.6), 0.4),
  ]);
  const broadTrunk = new THREE.CylinderGeometry(0.2, 0.32, 3.4, 5).translate(0, 1.7, 0);
  const pineFar = new THREE.ConeGeometry(2.7, 7.6, 6, 1, true).translate(0, 4.6, 0);
  const canopyFar = mergeGeometries([new THREE.IcosahedronGeometry(2.2, 0).scale(1, 0.9, 1).translate(0, 4.6, 0), new THREE.CylinderGeometry(0.25, 0.3, 3, 4).toNonIndexed().translate(0, 1.5, 0)]);
  const bushGeometry = jitter(new THREE.IcosahedronGeometry(0.7, 0).translate(0, 0.35, 0), 0.3);
  const rockGeometry = jitter(new THREE.DodecahedronGeometry(0.7, 0), 0.25);
  const tuftGeometry = new THREE.ConeGeometry(0.06, 0.38, 3, 1, true).translate(0, 0.19, 0);
  const flowerGeometry = new THREE.SphereGeometry(0.055, 4, 3).translate(0, 0.42, 0);
  const plain = new THREE.MeshLambertMaterial({ color: "#ffffff" });
  const trunkMaterial = new THREE.MeshLambertMaterial({ color: "#5a4030" });
  const barkMaterial = new THREE.MeshLambertMaterial({ color: "#6a5340" });
  const stoneMaterial = new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true });

  const cells = new Map();
  const CELL_SIZE = 200;
  let cullTick = 0, clock = 0;
  const cellOf = (x, z) => {
    const key = Math.floor(x / CELL_SIZE) * 1000 + Math.floor(z / CELL_SIZE);
    if (!cells.has(key)) cells.set(key, { pines: [], broad: [], bushes: [], rocks: [], tufts: [], flowers: [] });
    return cells.get(key);
  };
  const free = (x, z, minRoad) => !inShowArea(x, z) && roadDistance(x, z) >= minRoad && !keepClear.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < r * r);

  // trees around every road sample, biased towards the road, plus fill in the open areas
  const samples = [];
  for (const road of Object.values(roads)) for (let i = 0; i < road.n; i += 5) samples.push([road.pts[i], road.tans[i]]);
  const around = (p, t, side, dMin, dMax, bias) => {
    const d = dMin + Math.pow(Math.random(), bias) * (dMax - dMin);
    return [p.x - t.z * d * side + t.x * rand(-9, 9), p.z + t.x * d * side + t.z * rand(-9, 9), d];
  };
  const pineColor = (x, z) => ({ h: 0.3 + hash(x, z) * 0.1, s: 0.32 + hash(z, x) * 0.2, l: 0.13 + hash(x + 3, z) * 0.14 });
  for (const [p, t] of samples) for (const side of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      const [x, z, d] = around(p, t, side, 10.5, 110, 1.5);
      if (noise(x * 0.03 + 4, z * 0.03) < 0.3 || !free(x, z, 10)) continue;
      const y = heightAt(x, z);
      cellOf(x, z).pines.push({ x, y, z, sx: rand(0.85, 1.7), sy: rand(0.95, 1.8), ...pineColor(x, z) });
    }
    for (let k = 0; k < 2; k++) {
      const [x, z] = around(p, t, side, 9, 90, 1.3);
      if (noise(x * 0.03 + 4, z * 0.03) < 0.34 || !free(x, z, 9)) continue;
      const autumn = hash(x * 2, z * 3) > 0.8;
      cellOf(x, z).broad.push({ x, y: heightAt(x, z), z, sx: rand(0.9, 1.6), sy: rand(0.9, 1.4), h: autumn ? rand(0.06, 0.12) : rand(0.2, 0.31), s: autumn ? 0.65 : rand(0.4, 0.6), l: autumn ? 0.4 : rand(0.26, 0.4) });
    }
    for (let k = 0; k < 5; k++) {
      const [x, z] = around(p, t, side, 7.4, 60, 1.6);
      if (!free(x, z, 7.2)) continue;
      cellOf(x, z).bushes.push({ x, y: heightAt(x, z), z, sx: rand(0.6, 1.6), sy: rand(0.5, 1.1), h: rand(0.18, 0.34), s: rand(0.4, 0.6), l: rand(0.18, 0.36) });
    }
    if (Math.random() < 0.5) {
      const [x, z] = around(p, t, side, 7.8, 70, 1.4);
      if (free(x, z, 7.6)) cellOf(x, z).rocks.push({ x, y: heightAt(x, z) - 0.1, z, sx: rand(0.4, 1.4), sy: rand(0.3, 0.9), sz: rand(0.4, 1.2), l: rand(0.35, 0.55) });
    }
    for (let k = 0; k < 36; k++) {
      const [x, z] = around(p, t, side, 6.9, 46, 1.5);
      if (!free(x, z, 6.7)) continue;
      const y = heightAt(x, z);
      cellOf(x, z).tufts.push({ x, y, z, sx: rand(0.8, 1.8), sy: rand(0.6, 1.8), h: rand(0.23, 0.31), s: rand(0.5, 0.75), l: rand(0.2, 0.36) });
      if (k % 4 === 0 && Math.random() < 0.55) cellOf(x, z).flowers.push({ x: x + rand(-0.4, 0.4), y, z: z + rand(-0.4, 0.4), color: pick(["#f4f0e4", "#f2d43a", "#d96ab0", "#8a6ad9", "#f08a3a"]) });
    }
  }
  // open areas (inside the ring, around the film road): trees and meadow
  for (let i = 0; i < 2600; i++) {
    const x = rand(-420, 900), z = rand(-640, 380);
    if (noise(x * 0.03 + 4, z * 0.03) < 0.36 || !free(x, z, 14)) continue;
    const cell = cellOf(x, z);
    if (Math.random() < 0.72) cell.pines.push({ x, y: heightAt(x, z), z, sx: rand(0.9, 1.8), sy: rand(1, 1.9), ...pineColor(x, z) });
    else cell.broad.push({ x, y: heightAt(x, z), z, sx: rand(0.9, 1.7), sy: rand(0.9, 1.4), h: rand(0.2, 0.31), s: rand(0.4, 0.6), l: rand(0.26, 0.4) });
  }

  // Vegetation is split into cells; small plants are only drawn near the camera (see update()).
  function instanced(geometry, material, items, matrixOf, colorOf, range = 900, minRange = 0, margin = CELL_SIZE * 0.75) {
    if (!items.length) return;
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    cellMeshes.push({ mesh, x: (Math.floor(items[0].x / CELL_SIZE) + 0.5) * CELL_SIZE, z: (Math.floor(items[0].z / CELL_SIZE) + 0.5) * CELL_SIZE, range: range + margin, minRange });
    const matrix = new THREE.Matrix4(), colour = new THREE.Color(), q = new THREE.Quaternion(), e = new THREE.Euler();
    items.forEach((item, i) => {
      const m = matrixOf(item);
      e.set(m.tilt || 0, m.yaw ?? rand(0, TAU), m.tilt2 || 0);
      matrix.compose(V(item.x, item.y, item.z), q.setFromEuler(e), V(m.sx, m.sy, m.sz));
      mesh.setMatrixAt(i, matrix);
      if (colorOf) mesh.setColorAt(i, colorOf(colour, item));
    });
    scene.add(mesh);
  }
  const scaleOf = (i) => ({ sx: i.sx, sy: i.sy ?? i.sx, sz: i.sz ?? i.sx });
  for (const cell of cells.values()) {
    const hsl = (c, i) => c.setHSL(i.h, i.s, i.l);
    instanced(pineGeometry, foliageMaterial, cell.pines, (i) => ({ ...scaleOf(i), tilt: rand(-0.04, 0.04), tilt2: rand(-0.04, 0.04) }), hsl, 520, 0, 0);
    instanced(pineTrunk, trunkMaterial, cell.pines, scaleOf, null, 520, 0, 0);
    instanced(canopyGeometry, foliageMaterial, cell.broad, scaleOf, hsl, 520, 0, 0);
    instanced(broadTrunk, barkMaterial, cell.broad, scaleOf, null, 520, 0, 0);
    // far away the trees are simple shapes (a handful of triangles, one draw call per kind and cell)
    instanced(pineFar, foliageMaterial, cell.pines, (i) => ({ ...scaleOf(i), tilt: 0, tilt2: 0 }), hsl, 1100, 520, 0);
    instanced(canopyFar, foliageMaterial, cell.broad, scaleOf, hsl, 1100, 520, 0);
    instanced(bushGeometry, foliageMaterial, cell.bushes, scaleOf, hsl, 280);
    instanced(rockGeometry, stoneMaterial, cell.rocks, (i) => ({ ...scaleOf(i), tilt: rand(-0.4, 0.4) }), (c, i) => c.setHSL(0.1, 0.05, i.l), 300);
    instanced(tuftGeometry, plain, cell.tufts, (i) => ({ ...scaleOf(i), tilt: rand(-0.25, 0.25), tilt2: rand(-0.25, 0.25) }), hsl, 110);
    instanced(flowerGeometry, plain, cell.flowers, () => ({ sx: 1, sy: 1, sz: 1 }), (c, i) => c.set(i.color), 90);
  }

  return {
    PODIUM, ROAD_HALF, roads, barrier, sunDirection: SUN_DIRECTION, filmU0, ringAt,
    nearest, roadDistance, heightAt, R0, trailInfo, trailAt, jumpPark: { x: R0.x + JP.mid, z: -170, slope: JP.H / JP.rampLen, ...JP }, obstacles, crossRail: CROSS_RAIL,
    film: filmCurve, connector: connectorCurve, ring: ringCurve,
    update(dt, camera) {
      clouds.rotation.y += dt * 0.0035;
      clock += dt;
      if (barrier.closing) barrier.t = Math.min(1, barrier.t + dt / 4.5); else { barrier.t = 0; barrier.settle = 0; } // the boom comes down slowly while the car passes
      let angle = (1 - smooth(barrier.t)) * 1.45; // open: boom points up, closed: it lies across the road
      if (barrier.t >= 1) { barrier.settle += dt; angle = 0.08 * Math.exp(-barrier.settle * 3.5) * Math.abs(Math.cos(barrier.settle * 13)); } // a small bounce when it hits the bottom
      barrier.pivot.rotation.z = angle;
      const warn = barrier.closing ? (barrier.t < 1 ? Math.sin(clock * 15) > 0 : Math.sin(clock * 3) > 0.2) : false; // warning lamps blink while it moves
      for (const lamp of barrier.lamps) lamp.material.color.set(warn ? "#ff2a2a" : "#4a0f0f");
      if (camera && ++cullTick % 8 === 0) { // hide vegetation cells that are too far away to matter
        const cx = camera.position.x, cz = camera.position.z;
        for (const c of cellMeshes) { const d2 = (c.x - cx) ** 2 + (c.z - cz) ** 2; const lo = c.minRange || 0; c.mesh.visible = d2 < c.range * c.range && d2 >= lo * lo; }
      }
    },
  };
}
