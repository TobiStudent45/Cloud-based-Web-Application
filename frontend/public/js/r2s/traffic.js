// Other cars on the ring road: some drive in the player's direction (right lane), some come towards the player (left
// lane). They keep their lane and distance, brake for slow cars in front of them, flash their headlights and honk when
// the player blocks the way or drives on their lane, and they can be bumped: the impact pushes them aside a little and
// they drive back into their lane afterwards. The player cannot drive through them.

import * as THREE from "three";
import { simpleCar } from "./simplecar.js";
import { glowTexture } from "./assets.js";
import { rand, pick, clamp } from "./util.js";

const LANE = 2.1;
const COUNT = 10;
const COLORS = ["#c8202f", "#1f4fa3", "#e8e8ea", "#1a1c20", "#f2b705", "#2f8f4e", "#e66d27", "#6d3fb0", "#8a8d93"];
const CAR_RADIUS = 1.05;       // each car is two circles, 1.2 m in front of and behind its centre
const CAR_LENGTH_HALF = 1.2;

export function createTraffic({ scene, world, camera, audio }) {
  const ring = world.roads.ring;
  const L = ring.length, N = ring.n;
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  const cars = [];

  for (let i = 0; i < COUNT; i++) {
    const mesh = simpleCar(pick(COLORS), pick(["sport", "suv", "suv", "hatch", "hatch"]));
    const heads = [-0.6, 0.6].map((x) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: "#fff4d0", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.position.set(x, 0.68, -2.4);
      s.scale.setScalar(1.3);
      mesh.add(s);
      return s;
    });
    group.add(mesh);
    cars.push({ mesh, heads, dir: i % 2 === 0 ? 1 : -1, s: 0, v: 0, base: 0, lat: 0, latV: 0, yaw: 0, x: 0, z: 0, flash: 0, wait: 0, honkCooldown: 0 });
  }

  // position and direction of the ring centre line at distance s
  const pose = { x: 0, z: 0, tx: 0, tz: -1 };
  function ringAt(s) {
    const u = (((s % L) + L) % L) / L * N;
    const i = Math.floor(u) % N, j = (i + 1) % N, f = u - Math.floor(u);
    const a = ring.pts[i], b = ring.pts[j], ta = ring.tans[i], tb = ring.tans[j];
    pose.x = a.x + (b.x - a.x) * f; pose.z = a.z + (b.z - a.z) * f;
    let tx = ta.x + (tb.x - ta.x) * f, tz = ta.z + (tb.z - ta.z) * f;
    const len = Math.hypot(tx, tz) || 1;
    pose.tx = tx / len; pose.tz = tz / len;
    return pose;
  }
  function place(car) {
    const p = ringAt(car.s);
    const side = (car.dir > 0 ? LANE : -LANE) + car.lat;
    car.x = p.x - p.tz * side;       // right of the ring direction = (-tz, tx)
    car.z = p.z + p.tx * side;
    car.yaw = car.dir > 0 ? Math.atan2(-p.tx, -p.tz) : Math.atan2(p.tx, p.tz);
    car.mesh.position.set(car.x, 0.03, car.z);
    car.mesh.rotation.y = car.yaw;
  }

  function reset() {
    // cars start well away from where the player joins the ring
    const hit = world.nearest(world.R0.x, world.R0.z);
    const sJoin = (hit.local / N) * L;
    cars.forEach((car, i) => {
      car.s = sJoin + 150 + (i * (L - 300)) / COUNT + rand(-15, 15);
      car.base = car.dir > 0 ? rand(14, 17) : rand(15.5, 19);
      car.v = car.base; car.lat = car.latV = 0; car.flash = car.wait = car.honkCooldown = 0;
      place(car);
    });
  }

  function update(dt, player, active) {
    group.visible = active;
    if (!active) return;
    // where the player is on the ring (copied at once: nearest() reuses one result object)
    const hit = world.nearest(player.x, player.z, 2);
    const onRing = hit.road === "ring" && hit.dist < 14;
    const sp = onRing ? (hit.local / N) * L : 0, poff = hit.offset, ptx = hit.tx, ptz = hit.tz;
    const pAlong = player.vx * ptx + player.vz * ptz; // player speed along the ring direction

    for (const car of cars) {
      let target = car.base;
      let blocked = false;

      if (onRing) {
        const ahead = car.dir > 0 ? (((sp - car.s) % L) + L) % L : (((car.s - sp) % L) + L) % L;
        const lane = (car.dir > 0 ? LANE : -LANE) + car.lat;
        if (ahead < 48 && Math.abs(poff - lane) < 2.8) { // the player is on this car's lane, ahead of it
          const along = car.dir > 0 ? pAlong : -pAlong; // player speed in the direction of this car
          target = clamp(Math.max(0, along) + (ahead - 10) * 0.6, 0, car.base);
          if (ahead < 24) blocked = true;
        }
      }
      // keep the distance to the next car of the same direction
      for (const other of cars) {
        if (other === car || other.dir !== car.dir) continue;
        const gap = car.dir > 0 ? (((other.s - car.s) % L) + L) % L : (((car.s - other.s) % L) + L) % L;
        if (gap < 26) target = Math.min(target, Math.max(0, other.v - (26 - gap) * 0.4));
      }
      car.v += clamp(target - car.v, -10 * dt, 4 * dt);
      car.v = Math.max(0, car.v);

      // warning: flash the headlights, now and then honk
      car.wait = blocked && car.v < car.base * 0.8 ? car.wait + dt : Math.max(0, car.wait - dt * 2);
      car.honkCooldown = Math.max(0, car.honkCooldown - dt);
      if (car.wait > 1.3 && car.honkCooldown <= 0) {
        car.flash = 2.4; car.honkCooldown = 6;
        audio.beep(Math.hypot(car.x - camera.position.x, car.z - camera.position.z), false);
      }
      // the oncoming car also warns when the player drives on its lane
      if (car.dir < 0 && blocked && car.honkCooldown <= 0) { car.flash = 2.4; car.honkCooldown = 6; audio.beep(Math.hypot(car.x - camera.position.x, car.z - camera.position.z), true); }

      car.s += car.dir * car.v * dt;
      car.lat += car.latV * dt;
      car.latV += (-car.lat * 4 - car.latV * 3) * dt; // back into the lane after a bump
      place(car);

      // collision with the player: two circles each
      const hx = -Math.sin(car.yaw), hz = -Math.cos(car.yaw);
      const px = -Math.sin(player.yaw), pz = -Math.cos(player.yaw);
      if (!player.airborne) for (const k1 of [-CAR_LENGTH_HALF, CAR_LENGTH_HALF]) for (const k2 of [-CAR_LENGTH_HALF, CAR_LENGTH_HALF]) {
        const dx = player.x + px * k1 - (car.x + hx * k2), dz = player.z + pz * k1 - (car.z + hz * k2);
        const distance = Math.hypot(dx, dz);
        if (distance >= CAR_RADIUS * 2 || distance < 1e-4) continue;
        const nx = dx / distance, nz = dz / distance, overlap = CAR_RADIUS * 2 - distance;
        player.x += nx * overlap * 0.7; player.z += nz * overlap * 0.7;
        const rrx = -pose.tz, rrz = pose.tx; // right of the ring direction: the lane offset is measured along it
        car.lat = clamp(car.lat - (nx * rrx + nz * rrz) * overlap * 0.3, -2.4, 2.4);
        const vrel = (player.vx - hx * car.v) * nx + (player.vz - hz * car.v) * nz;
        if (vrel < 0) {
          const J = (-(1 + 0.35) * vrel) / (1 + 1 / 1.3); // the car is a bit heavier than the player
          player.vx += nx * J; player.vz += nz * J;
          car.v = Math.max(0, car.v - (J / 1.3) * (nx * hx + nz * hz));
          car.latV = clamp(car.latV - (J / 1.3) * (nx * rrx + nz * rrz), -4, 4);
          player.bumped = Math.max(player.bumped, Math.min(0.4, -vrel * 0.04));
          if (-vrel > 2.5) audio.bump(-vrel / 9);
          car.flash = 2.4;
          if (car.honkCooldown <= 0) { car.honkCooldown = 4; audio.beep(Math.hypot(car.x - camera.position.x, car.z - camera.position.z), true); }
        }
      }

      // visible only when it can be seen at all; headlights flash after a warning
      const far = (car.x - camera.position.x) ** 2 + (car.z - camera.position.z) ** 2 > 480 * 480;
      car.mesh.visible = !far;
      car.flash = Math.max(0, car.flash - dt);
      const on = car.flash > 0 && Math.floor(car.flash * 6) % 2 === 0;
      for (const h of car.heads) { h.material.opacity = on ? 1 : 0; h.visible = on; }
    }
  }

  return { group, cars, reset, update };
}
