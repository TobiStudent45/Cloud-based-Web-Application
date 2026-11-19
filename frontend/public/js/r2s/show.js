// The "Aureo Super Car Show": entrance gate with flags and balloons, paved plaza with the turntable podium,
// show hall with LED wall and display cars, tents, parking lot, light poles, crowd and photographers.
// Everything is generated from code (low-poly), people and trees are instanced or merged to keep draw calls low.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { TAU, rand, pick } from "./util.js";
import { PODIUM } from "./world.js";
import { simpleCar } from "./simplecar.js";
import { blobMaterial, flashTexture, lambert, standard, basic } from "./assets.js";

export const GAP = 1.1; // radians left open in front of the road (direction +z from the podium)
export const polar = (radius, angle) => new THREE.Vector3(PODIUM.x + Math.sin(angle) * radius, 0, PODIUM.z + Math.cos(angle) * radius);

function textTexture(width, height, draw, srgb = true) {
  const c = document.createElement("canvas");
  c.width = width; c.height = height;
  draw(c.getContext("2d"), width, height);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16; // sharp at a slant (limited by the graphics card)
  return t;
}

export function buildShow(scene, world) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const group = new THREE.Group();
  scene.add(group);
  const animated = []; // functions (t, dt) called every frame
  const add = (geometry, material, x, y, z, parent = group) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  // ---------- plaza ----------
  const paving = textTexture(512, 512, (g, w, h) => {
    g.fillStyle = "#b4b8be"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = 165 + Math.random() * 34;
      g.fillStyle = `rgb(${v},${v + 2},${v + 6})`; g.fillRect(x * 64 + 1, y * 64 + 1, 62, 62);
    }
    g.strokeStyle = "rgba(60,64,70,.5)"; g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
  });
  paving.wrapS = paving.wrapT = THREE.RepeatWrapping;
  paving.repeat.set(7, 7);
  paving.anisotropy = 8;
  const plaza = add(new THREE.CircleGeometry(31, 64).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: paving, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), PODIUM.x, 0.014, PODIUM.z);
  add(new THREE.RingGeometry(30.4, 31.2, 64).rotateX(-Math.PI / 2), basic("#fff0c8"), PODIUM.x, 0.07, PODIUM.z);

  // ---------- podium with turntable and spotlights ----------
  const podium = new THREE.Group();
  podium.position.copy(PODIUM);
  group.add(podium);
  add(new THREE.CylinderGeometry(4.7, 4.9, 0.5, 56), standard("#1c1f26", 0.5, 0.2), 0, 0.25, 0, podium);
  add(new THREE.CylinderGeometry(4.1, 4.1, 0.06, 56), standard("#e7eaee", 0.25, 0.4), 0, 0.53, 0, podium);
  add(new THREE.TorusGeometry(4.45, 0.05, 8, 72).rotateX(Math.PI / 2), basic("#fff3dc"), 0, 0.52, 0, podium);

  const beamMaterial = new THREE.MeshBasicMaterial({ color: "#fff0d8", transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const truss = add(new THREE.TorusGeometry(8.5, 0.12, 8, 64).rotateX(Math.PI / 2), standard("#2a2e36", 0.4, 0.6), PODIUM.x, 12, PODIUM.z);
  const down = V(0, -1, 0);
  const stageSpots = []; // the stage lights only count in the shaders while the show is near (every light costs on every lit surface)
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * TAU;
    const position = V(PODIUM.x + Math.sin(angle) * 8.5, 12, PODIUM.z + Math.cos(angle) * 8.5);
    const aim = V(PODIUM.x, 0.8, PODIUM.z);
    if (i % 2 === 0) {
      const light = new THREE.SpotLight("#fff1dd", 760, 45, 0.42, 0.65, 2);
      light.position.copy(position);
      light.target.position.copy(aim);
      group.add(light, light.target);
      stageSpots.push(light);
    }
    const length = position.distanceTo(aim);
    const beam = add(new THREE.ConeGeometry(Math.tan(0.42) * length, length, 28, 1, true).translate(0, -length / 2, 0), beamMaterial, position.x, position.y, position.z);
    beam.quaternion.setFromUnitVectors(down, aim.clone().sub(position).normalize());
    add(new THREE.CylinderGeometry(0.28, 0.2, 0.5, 10), standard("#16181d", 0.5, 0.5), position.x, 11.8, position.z);
    if (i === 2 || i === 3 || i === 4) add(new THREE.CylinderGeometry(0.14, 0.14, 12, 8), truss.material, position.x, 6, position.z); // none towards the road: the car drives in and out there
  }

  // rope barrier around the podium (open towards the road)
  const postMaterial = standard("#b8bcc4", 0.3, 0.8);
  const ropeMaterial = standard("#a31f2c", 0.6, 0);
  const POSTS = 26;
  let previous = null;
  for (let i = 0; i <= POSTS; i++) {
    const position = polar(7.4, GAP / 2 + ((TAU - GAP) * i) / POSTS);
    add(new THREE.CylinderGeometry(0.05, 0.07, 1.05, 8), postMaterial, position.x, 0.52, position.z);
    if (previous) {
      const a = previous.clone().setY(0.95), b = position.clone().setY(0.95);
      const rope = add(new THREE.CylinderGeometry(0.025, 0.025, a.distanceTo(b), 6), ropeMaterial, (a.x + b.x) / 2, 0.95, (a.z + b.z) / 2);
      rope.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    }
    previous = position;
  }

  // ---------- show cars: the detailed low-poly cars from simplecar.js (shiny paint) ----------
  const showCar = (color) => simpleCar(color, pick(["sport", "sport", "suv", "hatch"]), true);
  const COLORS = ["#c8202f", "#1f4fa3", "#e8e8ea", "#1a1c20", "#f2b705", "#2f8f4e", "#e66d27", "#6d3fb0"];
  const platformMaterial = standard("#d9dde3", 0.3, 0.3);
  const obstacles = []; // [x, z, radius]: nobody stands here (display cars, tents)
  function display(x, z, yaw, color, radius = 3.4, lift = 0) {
    obstacles.push([x, z, radius + 1.6]);
    add(new THREE.CylinderGeometry(radius, radius + 0.1, 0.22, 36), platformMaterial, x, lift + 0.11, z);
    add(new THREE.TorusGeometry(radius - 0.1, 0.03, 6, 48).rotateX(Math.PI / 2), basic("#fff3dc"), x, lift + 0.23, z);
    const car = showCar(color);
    car.position.set(x, lift + 0.22, z);
    car.rotation.y = yaw;
    group.add(car);
  }

  // ---------- show hall ----------
  const hall = new THREE.Group();
  hall.position.set(PODIUM.x, 0, PODIUM.z - 22);
  group.add(hall);
  const dark = standard("#22262e", 0.7, 0.2), roofMaterial = standard("#2e333c", 0.6, 0.3);
  add(new THREE.BoxGeometry(54, 13, 1.2), dark, 0, 6.5, 0, hall);
  add(new THREE.BoxGeometry(1.2, 13, 19), dark, -26.5, 6.5, 9.5, hall);
  add(new THREE.BoxGeometry(1.2, 13, 19), dark, 26.5, 6.5, 9.5, hall);
  add(new THREE.BoxGeometry(56, 0.8, 22), roofMaterial, 0, 13.4, 9, hall);
  add(new THREE.BoxGeometry(56, 0.25, 0.25), basic("#fff6e6"), 0, 12.8, 20, hall);
  for (const x of [-26.5, -9, 9, 26.5]) add(new THREE.CylinderGeometry(0.45, 0.45, 13, 12), roofMaterial, x, 6.5, 19.5, hall);
  add(new THREE.PlaneGeometry(52, 18).rotateX(-Math.PI / 2), standard("#c9ccd2", 0.25, 0.3), 0, 0.05, 9.5, hall);
  for (const x of [-20, -10, 10, 20]) add(new THREE.BoxGeometry(0.25, 11, 0.12), basic("#bfe3ff"), x, 6, -0.62 + 1.4, hall); // vertical light strips on the back wall
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.12, 0.25, 17), basic("#fff6e6"), side * 25.8, 11.5, 9.5, hall);

  // stage with LED wall
  add(new THREE.BoxGeometry(34, 0.9, 6), standard("#17191f", 0.4, 0.3), 0, 0.45, 3.9, hall);
  const led = textTexture(1024, 256, () => {});
  const ledContext = led.image.getContext("2d");
  const ledScreen = add(new THREE.PlaneGeometry(30, 7.5), new THREE.MeshBasicMaterial({ map: led, toneMapped: false }), 0, 5.2, 0.68, hall);
  let ledClock = 0;
  const drawLed = (t) => {
    const g = ledContext;
    const grad = g.createLinearGradient(0, 0, 1024, 0);
    const shift = (t * 20) % 360;
    grad.addColorStop(0, `hsl(${shift + 210},80%,42%)`); grad.addColorStop(0.5, `hsl(${shift + 280},75%,38%)`); grad.addColorStop(1, `hsl(${shift + 340},80%,45%)`);
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = "rgba(255,255,255,.08)";
    for (let i = 0; i < 16; i++) { const h = 20 + 100 * Math.abs(Math.sin(t * 1.4 + i)); g.fillRect(i * 64 + 8, 256 - h, 48, h); }
    g.fillStyle = "#fff"; g.font = "700 96px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("AUREO", 512, 100);
    g.font = "600 34px system-ui, sans-serif"; g.fillText("SUPER CAR SHOW", 512, 176);
    led.needsUpdate = true;
  };
  drawLed(0);
  animated.push((t, dt) => { ledClock += dt; if (ledClock > 0.12) { ledClock = 0; drawLed(t); } });
  // stage truss with lamps
  add(new THREE.BoxGeometry(34, 0.3, 0.3), standard("#2a2e36", 0.4, 0.6), 0, 9.4, 4, hall);
  for (let i = 0; i < 9; i++) add(new THREE.CylinderGeometry(0.22, 0.16, 0.4, 10), basic(i % 2 ? "#ffe9b0" : "#ffffff"), -16 + i * 4, 9.1, 4, hall);
  // speaker stacks
  for (const side of [-1, 1]) for (let level = 0; level < 3; level++) {
    add(new THREE.BoxGeometry(2.2, 1.6, 1.8), lambert("#0f1013"), side * 18.5, 1.7 + level * 1.65, 4.2, hall);
    add(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 18).rotateX(Math.PI / 2), lambert("#2a2c31"), side * 18.5, 1.7 + level * 1.65, 5.15, hall);
  }
  // banners hanging from the roof
  const bannerTexture = textTexture(128, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, "#5b5bf0"); grad.addColorStop(1, "#2a2a90");
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = "#fff"; g.font = "700 46px system-ui, sans-serif"; g.textAlign = "center";
    g.save(); g.translate(64, 256); g.rotate(-Math.PI / 2); g.fillText("AUREO", 0, 16); g.restore();
  });
  const bannerMaterial = new THREE.MeshBasicMaterial({ map: bannerTexture, side: THREE.DoubleSide });
  for (const x of [-22, -14, 14, 22]) add(new THREE.PlaneGeometry(1.6, 6), bannerMaterial, x, 9.5, 12, hall);
  // front fascia sign
  const fascia = textTexture(1024, 160, (g) => {
    g.fillStyle = "#101216"; g.fillRect(0, 0, 1024, 160);
    g.fillStyle = "#fff"; g.font = "700 70px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("AUREO · SUPER CAR SHOW", 512, 84);
  });
  add(new THREE.PlaneGeometry(32, 5), new THREE.MeshBasicMaterial({ map: fascia }), 0, 15.9, 20.2, hall);
  // display cars inside the hall
  display(PODIUM.x - 15, PODIUM.z - 12, 0.5, "#c8202f", 3.3);
  display(PODIUM.x + 15, PODIUM.z - 12, -0.5, "#1f4fa3", 3.3);
  display(PODIUM.x, PODIUM.z - 22 + 3.9, Math.PI - 0.5, "#f2b705", 2.6, 0.9); // on the stage, well away from the podium

  // ---------- entrance gate and flags along the approach ----------
  const film = world.roads.film;
  const at = (back) => { const i = Math.max(0, film.n - Math.round(back / 2)); return [film.pts[i], film.tans[i]]; };
  {
    const [p, t] = at(40);
    const yaw = Math.atan2(-t.x, -t.z);
    const gate = new THREE.Group();
    gate.position.set(p.x, 0, p.z);
    gate.rotation.y = yaw;
    group.add(gate);
    const gateTexture = textTexture(2048, 512, (g) => { // big, high contrast, two lines
      const grad = g.createLinearGradient(0, 0, 2048, 0); grad.addColorStop(0, "#14172a"); grad.addColorStop(1, "#262b52");
      g.fillStyle = grad; g.fillRect(0, 0, 2048, 512);
      g.strokeStyle = "#ffd76a"; g.lineWidth = 16; g.strokeRect(20, 20, 2008, 472);
      g.textAlign = "center"; g.textBaseline = "middle";
      const fit = (text, weight, size, maxWidth) => { // the biggest font size at which the whole text fits between the pylons
        for (; size > 20; size -= 2) { g.font = `${weight} ${size}px system-ui, Arial, sans-serif`; if (g.measureText(text).width <= maxWidth) break; }
      };
      g.fillStyle = "#ffffff"; fit("WILLKOMMEN", 800, 256, 1500);
      g.fillText("WILLKOMMEN", 1024, 196);
      g.fillStyle = "#ffd76a"; fit("AUREO SUPER CAR SHOW", 700, 104, 1500);
      g.fillText("AUREO SUPER CAR SHOW", 1024, 384);
    });
    for (const side of [-1, 1]) add(new THREE.BoxGeometry(1.3, 12, 1.3), standard("#262a33", 0.5, 0.4), side * 7.4, 6, 0, gate);
    add(new THREE.BoxGeometry(17, 4.4, 0.9), standard("#262a33", 0.5, 0.4), 0, 9.8, 0, gate);
    add(new THREE.PlaneGeometry(16.4, 4.1), new THREE.MeshBasicMaterial({ map: gateTexture }), 0, 9.8, 0.47, gate);
    add(new THREE.PlaneGeometry(16.4, 4.1), new THREE.MeshBasicMaterial({ map: gateTexture }), 0, 9.8, -0.47, gate).rotation.y = Math.PI;
    // balloon arch above the sign: evenly spaced along the arc (not by angle), so no two balloons touch each other or the text
    const ARC_A = 7.7, ARC_B = 1.7, SPACING = 1.08;
    const arc = [[-ARC_A, 0]]; let arcLength = 0;
    for (let k = 1; k <= 400; k++) { const t = (k / 400) * Math.PI, q = [-Math.cos(t) * ARC_A, Math.sin(t) * ARC_B]; arcLength += Math.hypot(q[0] - arc[arc.length - 1][0], q[1] - arc[arc.length - 1][1]); arc.push([q[0], q[1], arcLength]); }
    arc[0].push(0);
    const BALLOONS = Math.floor(arcLength / SPACING) + 1, step = arcLength / (BALLOONS - 1);
    const balloons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 12, 10), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.25, metalness: 0.1 }), BALLOONS);
    const matrix = new THREE.Matrix4(), colour = new THREE.Color();
    for (let i = 0, k = 0; i < BALLOONS; i++) {
      while (k < arc.length - 2 && arc[k + 1][2] < i * step) k++;
      matrix.compose(V(arc[k][0], 12.6 + arc[k][1], 0), new THREE.Quaternion(), V(1, 1, 1));
      balloons.setMatrixAt(i, matrix);
      balloons.setColorAt(i, colour.set(["#e63946", "#f1c40f", "#4f8cff", "#ffffff", "#2ecc71"][i % 5]));
    }
    gate.add(balloons);
  }
  // flag poles with swaying pennants
  const flagTextures = ["#e63946", "#4f8cff", "#f1c40f", "#2ecc71", "#ffffff"].map((c) => textTexture(64, 40, (g, w, h) => {
    g.fillStyle = c; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(0, h * 0.45, w, h * 0.1);
  }));
  const flags = [];
  for (let back = 74; back >= 16; back -= 12) for (const side of [-1, 1]) {
    const [p, t] = at(back);
    const x = p.x - t.z * 8.2 * side, z = p.z + t.x * 8.2 * side;
    if (world.roadDistance(x, z) < 7) continue; // no flag on the exit road that branches off here
    add(new THREE.CylinderGeometry(0.06, 0.09, 8, 6), standard("#c9cdd3", 0.3, 0.8), x, 4, z);
    const flag = add(new THREE.PlaneGeometry(2.4, 1.5).translate(1.2, 0, 0), new THREE.MeshBasicMaterial({ map: pick(flagTextures), side: THREE.DoubleSide }), x, 7.2, z);
    flag.userData.phase = rand(0, 6);
    flag.userData.base = Math.atan2(-t.x, -t.z) + Math.PI / 2 * side;
    flags.push(flag);
  }
  animated.push((t) => { for (const f of flags) f.rotation.y = f.userData.base + Math.sin(t * 1.8 + f.userData.phase) * 0.25; });
  // the way in (carpet) and the way out (exit road) stay free of people and objects
  const exitPoints = [...world.roads.connector.pts.slice(0, 56), ...world.roads.film.pts.slice(-32)];
  const nearWay = (x, z, margin) => exitPoints.some((p) => Math.hypot(p.x - x, p.z - z) < margin);

  // ---------- tents, parking lot, light poles ----------
  function tent(x, z, color, yaw) {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = yaw;
    obstacles.push([x, z, 5.6]);
    group.add(g);
    for (const px of [-2.6, 2.6]) for (const pz of [-2.6, 2.6]) add(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), standard("#c9cdd3", 0.3, 0.8), px, 1.3, pz, g);
    add(new THREE.ConeGeometry(4.6, 1.5, 4).rotateY(Math.PI / 4), new THREE.MeshLambertMaterial({ color, flatShading: true }), 0, 3.3, 0, g);
    add(new THREE.BoxGeometry(5.4, 0.35, 5.4), new THREE.MeshLambertMaterial({ color }), 0, 2.45, 0, g);
    add(new THREE.BoxGeometry(4.2, 0.08, 1.2), standard("#f4f1ea", 0.6, 0), 0, 0.9, 1.4, g); // table
    for (const bx of [-1.4, -0.4, 0.8, 1.6]) add(new THREE.BoxGeometry(0.6, 0.4, 0.5), lambert(pick(COLORS)), bx, 1.14, 1.4, g);
    add(new THREE.BoxGeometry(2, 0.5, 0.05), new THREE.MeshBasicMaterial({ color: "#fff" }), 0, 2.1, 2.62, g);
  }
  tent(PODIUM.x + 40, PODIUM.z - 12, "#f4f1ea", -0.3);
  tent(PODIUM.x + 52, PODIUM.z + 2, "#e63946", -0.6);
  tent(PODIUM.x - 34, PODIUM.z - 16, "#4f8cff", 0.3);
  tent(PODIUM.x - 45, PODIUM.z - 2, "#f4f1ea", 0.6);

  // parking lot with parked cars
  {
    const lot = new THREE.Group();
    lot.position.set(-52, 0.03, -250);
    group.add(lot);
    add(new THREE.PlaneGeometry(36, 30).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#44474d", polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), 0, 0, 0, lot);
    for (let row = 0; row < 2; row++) for (let i = 0; i < 8; i++) {
      add(new THREE.PlaneGeometry(0.1, 5).rotateX(-Math.PI / 2), basic("#e8e8e0"), -14 + i * 4, 0.02, -7 + row * 14, lot);
      if (Math.random() < 0.5) {
        const car = showCar(pick(COLORS));
        car.scale.setScalar(0.92);
        car.position.set(-12 + i * 4, 0.02, -7 + row * 14);
        car.rotation.y = (row ? 0 : Math.PI) + rand(-0.04, 0.04); // nose towards the aisle: each car stands in its own bay (lengthwise they overlapped before)
        lot.add(car);
      }
    }
    add(new THREE.BoxGeometry(0.2, 2.6, 0.2), lambert("#444"), 17, 1.3, 14, lot);
    add(new THREE.BoxGeometry(2.2, 0.7, 0.1), basic("#2a5ea8"), 17, 2.7, 14, lot);
  }
  // light poles around the plaza
  const poleMaterial = standard("#3a3d44", 0.5, 0.6), lampHead = basic("#ffe6b0");
  for (let i = 0; i < 9; i++) {
    const angle = GAP / 2 + 0.2 + ((TAU - GAP - 0.4) * i) / 8;
    const p = polar(33, angle);
    if (nearWay(p.x, p.z, 6)) continue;
    add(new THREE.CylinderGeometry(0.1, 0.14, 7, 8), poleMaterial, p.x, 3.5, p.z);
    add(new THREE.SphereGeometry(0.4, 10, 8), lampHead, p.x, 7.2, p.z);
  }
  // display cars outside on the plaza
  [[-2.3, "#e66d27"], [2.3, "#1f4fa3"]].forEach(([angle, color]) => {
    const p = polar(21, angle);
    display(p.x, p.z, Math.atan2(PODIUM.x - p.x, PODIUM.z - p.z) + Math.PI + 0.9, color, 3.2);
  });

  // ---------- spectators: one merged mesh per jacket colour ----------
  function spectatorGeometry(jacket, trousers, skin, hair) {
    const part = (g, color) => {
      const position = g.attributes.position, colors = new Float32Array(position.count * 3), c = new THREE.Color(color);
      for (let i = 0; i < position.count; i++) colors.set([c.r, c.g, c.b], i * 3);
      g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      return g.index ? g.toNonIndexed() : g;
    };
    const keep = (g) => { g.deleteAttribute("uv"); return g; };
    return mergeGeometries([
      part(keep(new THREE.CylinderGeometry(0.075, 0.06, 0.82, 6).translate(-0.1, 0.43, 0)), trousers),
      part(keep(new THREE.CylinderGeometry(0.075, 0.06, 0.82, 6).translate(0.1, 0.43, 0)), trousers),
      part(keep(new THREE.CylinderGeometry(0.2, 0.17, 0.64, 8).scale(1, 1, 0.7).translate(0, 1.15, 0)), jacket),
      part(keep(new THREE.CylinderGeometry(0.045, 0.04, 0.6, 6).translate(-0.25, 1.15, 0)), jacket),
      part(keep(new THREE.CylinderGeometry(0.045, 0.04, 0.6, 6).translate(0.25, 1.15, 0)), jacket),
      part(keep(new THREE.SphereGeometry(0.115, 10, 8).scale(0.93, 1.12, 1).translate(0, 1.64, 0)), skin),
      part(keep(new THREE.SphereGeometry(0.122, 10, 8, 0, TAU, 0, Math.PI * 0.55).scale(0.95, 1.1, 1.02).translate(0, 1.655, 0.008)), hair),
    ]);
  }
  const crowdMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const jackets = ["#2c4a6b", "#7a3b3b", "#3b6b4a", "#5a5a5a", "#8a6a2a", "#e8e4dc"];
  const spots = [];
  for (let tries = 0; spots.length < 84 && tries < 2000; tries++) {
    const angle = rand(0, TAU), radius = rand(14.5, 27);
    const p = polar(radius, angle);
    if (Math.abs(Math.atan2(p.x - PODIUM.x, p.z - PODIUM.z)) < 0.5 || nearWay(p.x, p.z, 7.5)) continue; // keep the way in and out free
    if (p.z < PODIUM.z - 6 && Math.abs(p.x - PODIUM.x) < 26) continue; // stage and hall front
    if (obstacles.some(([ox, oz, r]) => Math.hypot(p.x - ox, p.z - oz) < r)) continue; // not inside a car or a tent
    if (spots.some((q) => q.distanceToSquared(p) < 1.1)) continue;
    spots.push(p);
  }
  jackets.forEach((jacket, index) => {
    const mine = spots.filter((_, i) => i % jackets.length === index);
    const mesh = new THREE.InstancedMesh(spectatorGeometry(jacket, pick(["#20242b", "#33383f", "#3b3128", "#1b2330"]), pick(["#e8c2a0", "#c98f6a", "#8d5a3b"]), pick(["#1a1411", "#6b4a2a", "#b9a27a"])), crowdMaterial, mine.length);
    const matrix = new THREE.Matrix4(), colour = new THREE.Color();
    mine.forEach((p, i) => {
      const s = rand(0.9, 1.08);
      const face = Math.atan2(PODIUM.x - p.x, PODIUM.z - p.z) + Math.PI + rand(-0.5, 0.5);
      matrix.compose(V(p.x, 0.03, p.z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), face), V(s, s, s));
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, colour.setHSL(rand(0, 1), 0.12, rand(0.78, 1)));
    });
    group.add(mesh);
  });

  // ---------- photographers: simple people with arms raised, holding cameras ----------
  const jacketsP = ["#1d232c", "#3a2f2a", "#26323f", "#4a4a40", "#5b2c2c", "#2c4a3a", "#6b6f78", "#2c1f33"];
  const pants = ["#20242b", "#33383f", "#3b3128", "#1b2330"];
  const skins = ["#e8c2a0", "#c98f6a", "#8d5a3b", "#f0d2b6", "#6e4630", "#d9a77c"];
  const hairs = ["#1a1411", "#3b2a1c", "#6b4a2a", "#b9a27a", "#7a7a7a", "#0d0d0d"];
  const G = {
    leg: new THREE.CylinderGeometry(0.075, 0.06, 0.82, 8).translate(0, 0.43, 0),
    shoe: new THREE.BoxGeometry(0.11, 0.07, 0.27).translate(0, 0.035, -0.04),
    torso: new THREE.CylinderGeometry(0.2, 0.17, 0.64, 10).scale(1, 1, 0.7),
    neck: new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8),
    head: new THREE.SphereGeometry(0.115, 14, 12).scale(0.93, 1.12, 1),
    hair: new THREE.SphereGeometry(0.122, 14, 10, 0, TAU, 0, Math.PI * 0.55).scale(0.95, 1.1, 1.02),
    eye: new THREE.SphereGeometry(0.012, 6, 6),
    upper: new THREE.CylinderGeometry(0.05, 0.042, 0.28, 8).translate(0, -0.14, 0),
    fore: new THREE.CylinderGeometry(0.042, 0.036, 0.27, 8).translate(0, -0.135, 0),
    hand: new THREE.SphereGeometry(0.04, 8, 8),
    body: new THREE.BoxGeometry(0.17, 0.11, 0.1),
    lens: new THREE.CylinderGeometry(0.045, 0.05, 1, 12).rotateX(Math.PI / 2),
    cap: new THREE.CylinderGeometry(0.125, 0.128, 0.06, 14),
    brim: new THREE.BoxGeometry(0.2, 0.015, 0.11),
  };
  // Each person is built from a few merged meshes with vertex colours (body, head, two forearms, camera):
  // 7 draw calls instead of about 20, so a dozen photographers cost little.
  const vertexMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const baked = (geometry, color, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) => {
    const g = geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(V(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), V(...scale)));
    g.deleteAttribute("uv");
    const c = new THREE.Color(color), colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < g.attributes.position.count; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g.index ? g.toNonIndexed() : g;
  };
  const mesh = (geometry) => new THREE.Mesh(geometry, vertexMaterial);
  const photographers = [];
  const PHOTOGRAPHERS = 16;
  for (let i = 0; i < PHOTOGRAPHERS; i++) {
    const angle = GAP / 2 + 0.12 + ((TAU - GAP - 0.24) * (i + rand(0.1, 0.9))) / PHOTOGRAPHERS;
    const position = polar(rand(9.2, 12.6), angle);
    const person = new THREE.Group();
    person.position.copy(position);
    person.rotation.y = angle; // front (-z) faces the podium
    person.scale.setScalar(rand(0.93, 1.07));
    const jacket = pick(jacketsP), trousers = pick(pants), skin = pick(skins), hair = pick(hairs);

    // body: legs, shoes, torso, neck and the upper arms (the forearms move)
    const shoulders = [-1, 1].map((side) => ({ side, position: [side * 0.235, 1.42, 0], rotation: [1.0, side * -0.12, 0] }));
    const bodyParts = [
      baked(G.leg, trousers, [-0.1, 0, 0]), baked(G.leg, trousers, [0.1, 0, 0]),
      baked(G.shoe, "#15171b", [-0.1, 0, 0]), baked(G.shoe, "#15171b", [0.1, 0, 0]),
      baked(G.torso, jacket, [0, 1.15, 0]), baked(G.neck, skin, [0, 1.5, 0]),
      ...shoulders.map((sh) => baked(G.upper, jacket, sh.position, sh.rotation)),
    ];
    const body = mesh(mergeGeometries(bodyParts));
    person.add(body);

    // head with hair, eyes and sometimes a cap
    const headParts = [baked(G.head, skin), baked(G.hair, hair, [0, 0.015, 0.008]), baked(G.eye, "#101010", [-0.04, 0.02, -0.105]), baked(G.eye, "#101010", [0.04, 0.02, -0.105])];
    if (Math.random() < 0.28) {
      const cap = pick(["#a31f2c", "#1f3a5c", "#222222", "#d9d9d9"]);
      headParts.push(baked(G.cap, cap, [0, 0.085, 0.004]), baked(G.brim, cap, [0, 0.07, -0.1]));
    }
    const head = new THREE.Group();
    head.position.set(0, 1.64, 0);
    head.add(mesh(mergeGeometries(headParts)));
    person.add(head);

    // forearms with hands bend at the elbow when the camera is lowered after a picture
    const arms = shoulders.map((sh) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(...sh.position);
      shoulder.rotation.set(...sh.rotation);
      const elbow = new THREE.Group();
      elbow.position.set(0, -0.28, 0);
      elbow.rotation.x = 1.6;
      elbow.add(mesh(mergeGeometries([baked(G.fore, jacket), baked(G.hand, skin, [0, -0.27, 0])])));
      shoulder.add(elbow);
      person.add(shoulder);
      return { shoulder, elbow };
    });

    // camera with a lens of random length, and the flash
    const lensLength = rand(0.1, 0.34);
    person.add(mesh(mergeGeometries([baked(G.body, "#111111", [0, 1.57, -0.41]), baked(G.lens, "#1d1d1d", [0, 1.57, -0.46 - lensLength / 2], [0, 0, 0], [1, 1, lensLength])])));
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    flash.position.set(0, 1.64, -0.5 - lensLength);
    person.add(flash);
    add(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), blobMaterial, position.x, 0.08, position.z);
    group.add(person);
    photographers.push({ person, head, torso: body, arms, flash, next: 1e9, phase: rand(0, 6), look: 0 });
  }
  const flashLight = new THREE.PointLight("#fff6e6", 0, 14, 2);
  group.add(flashLight);

  // The plaza consists of hundreds of small meshes (hall, poles, tents, signs ...): the static ones are merged into one
  // mesh per material, so the whole show costs a few dozen draw calls instead of several hundred.
  {
    const keep = new Set([podium, ...photographers.map((p) => p.person), ...flags]); // these move
    const isKept = (o) => { for (let q = o; q && q !== group; q = q.parent) if (keep.has(q)) return true; return false; };
    group.updateMatrixWorld(true);
    const buckets = new Map(), merged = [];
    group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.visible || isKept(o) || Array.isArray(o.material)) return;
      const material = o.material;
      if (material.transparent || material.blending !== THREE.NormalBlending) return;
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
      const key = material.uuid + "|" + Object.keys(g.attributes).sort().join(",");
      if (!buckets.has(key)) buckets.set(key, { material, list: [] });
      buckets.get(key).list.push(g);
      merged.push(o);
    });
    for (const o of merged) { o.parent.remove(o); o.geometry.dispose?.(); }
    for (const { material, list } of buckets.values()) {
      const geometry = list.length > 1 ? mergeGeometries(list) : list[0];
      if (geometry) group.add(new THREE.Mesh(geometry, material));
    }
  }

  const api = {
    photographers, flashes: 0, podiumGroup: podium, onFlash: null, // onFlash(position): called for every picture
    // `from`: time from which people start taking pictures; `t` is the film time
    resetFlashes(startAt) { for (const p of photographers) { p.next = startAt + rand(0, 3); p.flash.material.opacity = 0; p.look = 0; } },
    group, flashLight,
    setLightsOn(on) { for (const l of stageSpots) l.visible = on; flashLight.visible = on; },
    update(t, dt, flashing, near = true) {
      if (!near) { flashLight.intensity = 0; return; } // far away (free drive): no animation, no texture uploads
      for (const fn of animated) fn(t, dt);
      let strongest = 0, where = null;
      for (const p of photographers) {
        p.torso.scale.y = 1 + Math.sin(t * 1.7 + p.phase) * 0.012; // breathing
        p.head.rotation.y = Math.sin(t * 0.5 + p.phase) * 0.18;
        p.look = Math.max(0, p.look - dt * 3);
        const lower = Math.sin(Math.min(1, p.look) * Math.PI) * 0.12;
        for (const arm of p.arms) arm.elbow.rotation.x = 1.6 - lower;
        if (flashing && t >= p.next) { p.flash.material.opacity = 1; p.look = 1; p.next = t + rand(0.7, 3.4); api.flashes++; api.onFlash?.(p.person.position); }
        const o = p.flash.material.opacity;
        p.flash.visible = o > 0; // no flash, no draw call
        if (o > 0) {
          p.flash.material.opacity = Math.max(0, o - dt * 6);
          p.flash.scale.setScalar(0.4 + o * 1.8);
          if (o > strongest) { strongest = o; where = p.flash; }
        }
      }
      if (where) { where.getWorldPosition(flashLight.position); flashLight.intensity = 240 * strongest; } else flashLight.intensity = 0;
    },
  };
  return api;
}
