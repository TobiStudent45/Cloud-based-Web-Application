// Detailed low-poly cars for traffic, parking lot and show: sports car, SUV and hatchback. Each car is one merged mesh
// with vertex colours (one draw call): body, glass, rims, tyres, head and tail lights, grille, number plates, door
// seams and handles, mirrors, exhaust tips, roof rails or rear wing. The car faces -z, origin on the ground in the middle.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

let shapes = null;
function buildShapes() {
  const body = new THREE.Shape();
  body.moveTo(-2.2, 0.28); body.lineTo(-2.26, 0.6); body.quadraticCurveTo(-2.22, 0.86, -1.8, 0.9);
  body.lineTo(-0.9, 0.95); body.quadraticCurveTo(0.2, 1.0, 1.0, 0.9); body.lineTo(1.95, 0.68);
  body.quadraticCurveTo(2.32, 0.58, 2.28, 0.42); body.lineTo(2.2, 0.28); body.lineTo(-2.2, 0.28);
  const cabin = new THREE.Shape();
  cabin.moveTo(-1.05, 0.93); cabin.quadraticCurveTo(-0.6, 1.28, 0.3, 1.27); cabin.quadraticCurveTo(0.8, 1.2, 1.05, 0.93); cabin.lineTo(-1.05, 0.93);
  return {
    body: new THREE.ExtrudeGeometry(body, { depth: 1.74, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.09, bevelSegments: 2, curveSegments: 8 }).translate(0, 0, -0.87).rotateY(Math.PI / 2),
    cabin: new THREE.ExtrudeGeometry(cabin, { depth: 1.46, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1, curveSegments: 8 }).translate(0, 0, -0.73).rotateY(Math.PI / 2),
    tyre: new THREE.CylinderGeometry(0.39, 0.39, 0.3, 14).rotateZ(Math.PI / 2),
    rim: new THREE.CylinderGeometry(0.27, 0.27, 0.32, 10).rotateZ(Math.PI / 2),
    hub: new THREE.CylinderGeometry(0.08, 0.08, 0.34, 6).rotateZ(Math.PI / 2),
    box: new THREE.BoxGeometry(1, 1, 1),
    pipe: new THREE.CylinderGeometry(0.06, 0.06, 0.16, 8).rotateX(Math.PI / 2),
  };
}

function colored(geometry, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  g.deleteAttribute("uv");
  const c = new THREE.Color(color), colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}
const M = (x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
const place = (geometry, color, matrix) => colored(geometry.clone().applyMatrix4(matrix), color);

const TYPES = {
  sport: { length: 1, height: 1, cabin: [1, 1, 1], wing: true, rails: false },
  suv: { length: 1.03, height: 1.2, cabin: [1.12, 1.3, 1.5], wing: false, rails: true },
  hatch: { length: 0.88, height: 1.06, cabin: [1, 1.12, 1.2], wing: false, rails: false },
};

const cache = new Map();
function carGeometry(color, type) {
  const key = color + type;
  if (cache.has(key)) return cache.get(key);
  shapes ||= buildShapes();
  const t = TYPES[type], L = t.length, H = t.height, half = 2.3 * L;
  const parts = [];
  const box = (x, y, z, w, h, d, col) => parts.push(place(shapes.box, col, M(x, y, z, w, h, d)));

  parts.push(place(shapes.body, color, M(0, 0, 0, 1, H, L)));
  const cabinH = t.cabin[1] * H;                                                   // the cabin is scaled around its base, so it always sits on the body
  parts.push(place(shapes.cabin, "#161c26", M(0, 0.93 * H - 0.93 * cabinH, (t.cabin[2] - 1) * 0.35, t.cabin[0], cabinH, t.cabin[2] * L)));
  box(0, 0.3, 0, 1.9, 0.12, 3.9 * L, "#0d0e11");                                    // sills and underbody

  // wheels: tyre, rim, hub
  for (const x of [-0.88, 0.88]) for (const z of [-1.45 * L, 1.45 * L]) {
    parts.push(place(shapes.tyre, "#15171b", M(x, 0.39, z)));
    parts.push(place(shapes.rim, "#c4c9d0", M(x + Math.sign(x) * 0.03, 0.39, z)));
    parts.push(place(shapes.hub, "#40444c", M(x + Math.sign(x) * 0.04, 0.39, z)));
  }
  // front: headlights with daytime strip, grille, lower intake, number plate, fog lights
  for (const x of [-0.62, 0.62]) {
    box(x, 0.66 * H, -half - 0.005, 0.36, 0.1, 0.06, "#fff6d6");
    box(x, 0.58 * H, -half - 0.005, 0.36, 0.03, 0.06, "#bfe6ff");
    box(x * 1.18, 0.38, -half + 0.02, 0.12, 0.08, 0.05, "#ffe9a8");
  }
  box(0, 0.55 * H, -half - 0.005, 0.9, 0.16, 0.06, "#0b0c0e");
  box(0, 0.4, -half - 0.005, 1.3, 0.12, 0.06, "#0b0c0e");
  box(0, 0.46, -half - 0.03, 0.5, 0.12, 0.02, "#f2f2ee");
  // rear: tail lights, light bar, number plate, exhaust tips
  for (const x of [-0.7, 0.7]) box(x, 0.74 * H, half, 0.5, 0.14, 0.06, "#d01828");
  box(0, 0.76 * H, half, 0.9, 0.04, 0.05, "#a31220");
  box(0, 0.52, half + 0.02, 0.5, 0.12, 0.02, "#e8e2b0");
  for (const x of [-0.5, 0.5]) parts.push(place(shapes.pipe, "#9aa0a8", M(x, 0.33, half + 0.05)));
  // sides: door seams, handles, mirrors
  for (const side of [-1, 1]) {
    const x = side * 0.97;
    box(x, 0.62 * H, -0.55 * L, 0.02, 0.5 * H, 0.025, "#0b0c0e");
    box(x, 0.62 * H, 0.45 * L, 0.02, 0.5 * H, 0.025, "#0b0c0e");
    box(x, 0.7 * H, -0.3 * L, 0.03, 0.04, 0.2, "#9aa0a8");
    box(x, 0.7 * H, 0.7 * L, 0.03, 0.04, 0.2, "#9aa0a8");
    box(side * 1.02, 1.0 * H, -0.62 * L, 0.14, 0.1, 0.18, color);
  }
  if (t.wing) {                                                                      // sports car: rear wing
    box(0, 1.02, 2.0 * L, 1.5, 0.05, 0.36, color);
    for (const x of [-0.55, 0.55]) box(x, 0.94, 2.0 * L, 0.05, 0.16, 0.2, "#0d0e11");
  }
  if (t.rails) for (const x of [-0.62, 0.62]) box(x, 0.93 * H + 0.35 * cabinH + 0.03, 0.2, 0.05, 0.05, 2.0 * L, "#1b1d22"); // SUV: roof rails
  const merged = mergeGeometries(parts);
  cache.set(key, merged);
  return merged;
}

const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
const glossy = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.3 });
export const CAR_TYPES = Object.keys(TYPES);
// color: body colour; type: "sport" | "suv" | "hatch"; shiny: reflecting paint (needs the scene environment)
export function simpleCar(color, type = "sport", shiny = false) {
  return new THREE.Mesh(carGeometry(color, type), shiny ? glossy : lambert);
}
