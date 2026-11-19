// A deer that now and then crosses the ring road: it runs out of the forest, jumps over the guard rail, crosses the
// road and jumps over the rail on the other side. It waits at the verge while the player is close and approaching,
// and it is an obstacle: the player cannot drive through it.

import * as THREE from "three";
import { RAIL_OFFSET, ROAD_HALF } from "./world.js";
import { rand, clamp } from "./util.js";

const START_OFFSET = 17;   // metres from the road centre where the deer starts and ends
const SPEED = 8.5;         // m/s across the road
const RADIUS = 0.75;

export function createDeer({ scene, world, audio }) {
  const ring = world.roads.ring;
  const N = ring.n, L = ring.length;
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  // low-poly doe: body, neck, head, ears, tail, four legs (pivoting at the hips)
  const fur = new THREE.MeshLambertMaterial({ color: "#9a6a3c", flatShading: true });
  const light = new THREE.MeshLambertMaterial({ color: "#e9dcc4", flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: "#3a2a1e" });
  const part = (geometry, material, x, y, z, parent = group) => { const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); parent.add(m); return m; };
  const body = new THREE.Group();
  group.add(body);
  part(new THREE.BoxGeometry(0.55, 0.6, 1.35), fur, 0, 1.0, 0, body);
  part(new THREE.BoxGeometry(0.5, 0.18, 1.1), light, 0, 0.72, 0.05, body);
  const neck = part(new THREE.BoxGeometry(0.26, 0.7, 0.3), fur, 0, 1.4, -0.7, body); neck.rotation.x = -0.5;
  part(new THREE.BoxGeometry(0.28, 0.28, 0.5), fur, 0, 1.78, -1.0, body);
  part(new THREE.BoxGeometry(0.12, 0.1, 0.12), dark, 0, 1.76, -1.27, body);
  for (const x of [-0.13, 0.13]) { const ear = part(new THREE.ConeGeometry(0.07, 0.3, 4), fur, x, 2.0, -0.9, body); ear.rotation.z = -Math.sign(x) * 0.4; }
  const tail = part(new THREE.BoxGeometry(0.14, 0.2, 0.1), light, 0, 1.2, 0.72, body);
  tail.rotation.x = 0.4;
  const legs = [];
  for (const [x, z] of [[-0.19, -0.5], [0.19, -0.5], [-0.19, 0.55], [0.19, 0.55]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.85, z);
    part(new THREE.BoxGeometry(0.11, 0.85, 0.11).translate(0, -0.42, 0), fur, 0, 0, 0, pivot);
    group.add(pivot);
    legs.push(pivot);
  }

  const deer = { active: false, o: 0, dir: 1, idx: 0, wait: 0, timer: 12, phase: 0, x: 0, z: 0, y: 0 };
  const pose = { x: 0, z: 0, nx: 0, nz: 1 };
  const at = (idx, o) => { // point at offset o (right of the ring direction) from the centre line
    const p = ring.pts[idx], t = ring.tans[idx];
    pose.nx = -t.z; pose.nz = t.x;
    pose.x = p.x + pose.nx * o; pose.z = p.z + pose.nz * o;
    return pose;
  };

  function reset() { deer.active = false; deer.timer = rand(10, 18); group.visible = false; }

  function spawn(playerIdx, travel) {
    deer.idx = (playerIdx + travel * Math.round((rand(85, 130) * N) / L) + N * 2) % N;
    deer.dir = Math.random() < 0.5 ? 1 : -1;
    deer.o = -deer.dir * START_OFFSET;
    deer.wait = 0; deer.phase = 0; deer.active = true;
  }

  function update(dt, player, active) {
    if (!active) { group.visible = false; return; }
    const hit = world.nearest(player.x, player.z, 2);
    const onRing = hit.road === "ring" && hit.dist < 14;
    if (!deer.active) {
      deer.timer -= dt;
      if (deer.timer <= 0) {
        if (onRing) {
          const along = player.vx * hit.tx + player.vz * hit.tz; // travelling with or against the ring direction
          spawn(Math.round(hit.local), along >= 0 ? 1 : -1);
        } else deer.timer = 3; // try again soon
      }
      group.visible = deer.active;
      if (!deer.active) return;
    }

    // wait at the verge while the player comes close
    const side = Math.abs(deer.o);
    const distance = Math.hypot(deer.x - player.x, deer.z - player.z);
    const atVerge = side > 9.5 && side < START_OFFSET - 1 && Math.sign(deer.o) === -deer.dir;
    if (atVerge && deer.wait < 7 && distance < 38 && Math.hypot(player.vx, player.vz) > 2) { deer.wait += dt; }
    else deer.o += deer.dir * SPEED * dt * (side < ROAD_HALF + 3 ? 1.15 : 1);

    // position, jump arcs over the rails, gallop
    const p = at(deer.idx, deer.o);
    deer.x = p.x; deer.z = p.z;
    const arc = (r) => Math.max(0, 1 - ((Math.abs(deer.o) - r) / 1.7) ** 2);
    deer.y = 1.5 * arc(RAIL_OFFSET);
    const waiting = atVerge && deer.wait > 0 && deer.wait < 7 && distance < 38;
    deer.phase += dt * (waiting ? 0 : 13);
    const airborne = deer.y > 0.3;
    group.position.set(deer.x, deer.y + Math.abs(Math.sin(deer.phase)) * (airborne || waiting ? 0 : 0.18), deer.z);
    group.rotation.y = Math.atan2(-p.nx * deer.dir, -p.nz * deer.dir);
    group.rotation.x = airborne ? -0.25 * Math.sign(1 - Math.abs(deer.o) / RAIL_OFFSET + 0.001) : 0; // nose up before the rail, down after it
    legs.forEach((leg, i) => { leg.rotation.x = airborne ? (i < 2 ? -0.9 : 0.9) : Math.sin(deer.phase + (i === 1 || i === 2 ? Math.PI : 0)) * 0.8; });

    // an obstacle on the road: the player cannot drive through it
    if (Math.abs(deer.o) < ROAD_HALF + 2.5 && !player.airborne) {
      const px = -Math.sin(player.yaw), pz = -Math.cos(player.yaw);
      for (const k of [-1.2, 1.2]) {
        const dx = player.x + px * k - deer.x, dz = player.z + pz * k - deer.z;
        const d = Math.hypot(dx, dz), min = RADIUS + 1.05;
        if (d >= min || d < 1e-4) continue;
        const nx = dx / d, nz = dz / d;
        player.x += nx * (min - d); player.z += nz * (min - d);
        const into = -(player.vx * nx + player.vz * nz);
        if (into > 0) {
          player.vx += nx * into * 1.35; player.vz += nz * into * 1.35;
          player.bumped = Math.max(player.bumped, Math.min(0.4, into * 0.04));
          if (into > 2.5) audio.bump(into / 9);
        }
      }
    }

    if (Math.abs(deer.o) > START_OFFSET + 0.5 && Math.sign(deer.o) === deer.dir) { // on the other side: gone
      deer.active = false; group.visible = false; deer.timer = rand(25, 50);
    }
  }

  return { group, reset, update, get active() { return deer.active; } };
}
