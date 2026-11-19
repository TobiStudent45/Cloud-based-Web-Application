// Free drive: arcade car physics on the road network of the world, keyboard and on-screen panels (gas, brake,
// boost, hand brake, steering, indicators, hazard lights, headlights, horn), chase camera, engine sound.
//
// Coordinates: the car faces -z at yaw 0, forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw).
// Steering to the right turns the yaw clockwise seen from above, i.e. the yaw angle decreases.

import * as THREE from "three";
import { PODIUM, ROAD_HALF, RAIL_OFFSET } from "./world.js";
import { clamp, lerp, smooth, wrapAngle } from "./util.js";
import { glowTexture } from "./assets.js";

const WHEELBASE = 2.9;
const V_MAX = 56;            // m/s, about 200 km/h
const V_NITRO = 88;          // m/s, about 316 km/h

export function createDrive({ world, camera, carRoot, lights, hud, root, audio, traffic, deer }) {
  const state = {
    active: false, x: 0, z: 0, yaw: 0, vx: 0, vz: 0, steer: 0, steerInput: 0, nitro: 1, nitroActive: false,
    y: 0, pitch: 0, roll: 0, left: false, right: false, hazard: false, lights: false, brake: false,
    launch: null, indicatorYaw: 0, shake: 0, bumped: 0, time: 0,
    vy: 0, air: false, airborne: false, jetT: 0, cooldown: 0, pendingJump: false, freeTime: 0, mirror: false, mirrorOn: false,
    prevGround: 0.03, toastText: "", toastT: 0, toldRamp: false,
  };
  const keys = new Set();
  const held = new Set(); // on-screen buttons currently pressed
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
  const f = new THREE.Vector3();
  let fovNow = camera.fov;
  const baseFov = 52;
  let lastBlink = false;

  const down = (name) => keys.has(name) || held.has(name);

  // ---------- air jets (the jump button): flames under the car, puffs of light and dust, a shock ring ----------
  const scene = traffic.group.parent;
  const jetGroup = new THREE.Group();
  const jetCones = [], jetGlows = [];
  const coneGeometry = new THREE.ConeGeometry(0.12, 1.0, 10, 1, true).rotateX(Math.PI).translate(0, -0.5, 0);
  for (const x of [-0.8, 0.8]) for (const z of [-1.3, 1.3]) {
    const cone = new THREE.Mesh(coneGeometry, new THREE.MeshBasicMaterial({ color: "#9fe6ff", transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cone.position.set(x, 0.3, z);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: "#7fd0ff", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(x, 0.25, z); glow.scale.setScalar(1.0);
    jetGroup.add(cone, glow); jetCones.push(cone); jetGlows.push(glow);
  }
  jetGroup.visible = false;
  const puffs = Array.from({ length: 80 }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false, opacity: 0 }));
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 1, s1: 2, peak: 1 };
  });
  let puffNext = 0, puffTick = 0;
  function puff(x, y, z, vx, vy, vz, s0, s1, life, color, additive) {
    const p = puffs[puffNext++ % puffs.length];
    p.life = p.max = life; p.vx = vx; p.vy = vy; p.vz = vz; p.s0 = s0; p.s1 = s1; p.peak = additive ? 0.7 : 0.3;
    p.sprite.position.set(x, y, z);
    p.sprite.material.color.set(color);
    p.sprite.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.sprite.visible = true;
  }
  const shock = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.0, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#8fdcff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  shock.visible = false;
  scene.add(shock);
  let shockT = 1;
  function burst(strength) { // dust and a ring on the ground, at take-off and landing
    shock.position.set(state.x, state.y + 0.08, state.z); shockT = 0; shock.visible = true;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random(), v = (3 + Math.random() * 4) * strength;
      puff(state.x + Math.cos(a) * 1.4, state.y + 0.25, state.z + Math.sin(a) * 1.4, Math.cos(a) * v, 0.6, Math.sin(a) * v, 0.7, 2.4, 0.8, "#cbbd9f", false);
    }
  }
  function updateEffects(dt) {
    for (const p of puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.sprite.visible = false; continue; }
      const t = 1 - p.life / p.max;
      p.sprite.position.x += p.vx * dt; p.sprite.position.y += p.vy * dt; p.sprite.position.z += p.vz * dt;
      p.sprite.scale.setScalar(lerp(p.s0, p.s1, t));
      p.sprite.material.opacity = (1 - t) * p.peak;
    }
    if (shockT < 1) {
      shockT = Math.min(1, shockT + dt / 0.65);
      shock.scale.setScalar(1 + shockT * 6);
      shock.material.opacity = (1 - shockT) * 0.4;
      if (shockT >= 1) shock.visible = false;
    }
    const on = state.jetT > 0 && state.active;
    jetGroup.visible = on;
    if (on) {
      const k = clamp(state.jetT / 0.25, 0, 1); // the flames shrink at the end of the thrust
      jetCones.forEach((cone, i) => { cone.scale.set(1, (0.95 + 0.08 * Math.sin(state.time * 40 + i)) * k, 1); jetGlows[i].scale.setScalar(0.9 * (0.4 + 0.6 * k)); });
      puffTick++;
      if (puffTick % 3 === 0) for (const z of [1.3]) for (const x of [-0.8, 0.8]) {
        const sy = Math.sin(state.yaw), cy = Math.cos(state.yaw); // car-local (x, z) to world
        puff(state.x + x * cy + z * sy, state.y + 0.2, state.z - x * sy + z * cy, (Math.random() - 0.5) * 1.5, -3 - Math.random() * 2, (Math.random() - 0.5) * 1.5, 0.5, 0.1, 0.4, "#8fdcff", true);
      }
    }
  }

  function toast(text, seconds = 5) { state.toastText = text; state.toastT = seconds; }

  function jump() {
    if (!state.active || state.launch || state.air || state.cooldown > 0) return;
    state.pendingJump = true;
  }

  function toggle(name) {
    if (name === "left") { state.left = !state.left; state.right = false; state.hazard = false; state.indicatorYaw = state.yaw; }
    else if (name === "right") { state.right = !state.right; state.left = false; state.hazard = false; state.indicatorYaw = state.yaw; }
    else if (name === "hazard") { state.hazard = !state.hazard; state.left = state.right = false; }
    else if (name === "lights") state.lights = !state.lights;
    else if (name === "mirror") state.mirrorOn = !state.mirrorOn;
    audio.tick(true);
    renderToggles();
  }
  function renderToggles() {
    for (const button of root.querySelectorAll("[data-toggle]")) {
      const name = button.dataset.toggle;
      button.setAttribute("aria-pressed", String(name === "left" ? state.left : name === "right" ? state.right : name === "hazard" ? state.hazard : name === "mirror" ? state.mirrorOn : state.lights));
    }
  }

  // ---------- input ----------
  const KEYMAP = { KeyW: "throttle", ArrowUp: "throttle", KeyS: "brake", ArrowDown: "brake", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right", Space: "handbrake", ShiftLeft: "nitro", ShiftRight: "nitro" };
  const onKeyDown = (event) => {
    if (!state.active || event.metaKey || event.ctrlKey || event.altKey) return;
    const action = KEYMAP[event.code];
    if (action) { keys.add(action); event.preventDefault(); return; }
    if (event.repeat) return;
    if (event.code === "KeyQ") toggle("left");
    else if (event.code === "KeyE") toggle("right");
    else if (event.code === "KeyF") toggle("hazard");
    else if (event.code === "KeyL") toggle("lights");
    else if (event.code === "KeyH") audio.horn(true);
    else if (event.code === "KeyR") respawn();
    else if (event.code === "KeyX") jump();
    else if (event.code === "KeyC") toggle("mirror");
  };
  const onKeyUp = (event) => { const action = KEYMAP[event.code]; if (action) keys.delete(action); if (event.code === "KeyH") audio.horn(false); };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => { keys.clear(); held.clear(); });

  for (const button of root.querySelectorAll("[data-hold]")) {
    const name = button.dataset.hold;
    const press = (event) => { event.preventDefault(); held.add(name); button.dataset.down = "true"; button.setPointerCapture?.(event.pointerId); };
    const release = () => { held.delete(name); button.dataset.down = "false"; };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  }
  for (const button of root.querySelectorAll("[data-press='jump']")) button.addEventListener("click", jump);
  for (const button of root.querySelectorAll("[data-toggle]")) button.addEventListener("click", () => toggle(button.dataset.toggle));
  for (const button of root.querySelectorAll("[data-press='horn']")) {
    button.addEventListener("pointerdown", (event) => { event.preventDefault(); button.setPointerCapture?.(event.pointerId); audio.horn(true); });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(type, () => audio.horn(false));
  }

  // ---------- start / stop ----------
  const connector = world.roads.connector;
  const ring = world.roads.ring;
  let ringJoin = 0, ringBest = Infinity; // ring sample at the junction; the left turn leads towards -z
  ring.pts.forEach((p, i) => { const d = (p.x - world.R0.x) ** 2 + (p.z - world.R0.z) ** 2; if (d < ringBest) { ringBest = d; ringJoin = i; } });
  const ringStep = ring.tans[ringJoin].z > 0 ? -1 : 1;
  const ringIndex = (k) => (((ringJoin + ringStep * k) % ring.n) + ring.n) % ring.n;
  // the path of the left turn onto the ring: straight on in the right lane of the exit road, a quarter circle, then
  // along the right lane of the ring (in the direction the player drives)
  const joinPath = (() => {
    const LANE = 2.1, R = 10;
    const t = connector.tans[connector.n], rc = { x: -t.z, z: t.x };            // exit road: direction and its right side
    const tt = { x: ring.tans[ringJoin].x * ringStep, z: ring.tans[ringJoin].z * ringStep }, rr = { x: -tt.z, z: tt.x }; // ring: direction of travel and its right side
    const R0 = world.R0;
    // the lane lines: E(s) = R0 + rc*LANE + t*s and X(u) = R0 + rr*LANE + tt*u meet in the corner C
    const det = t.x * -tt.z - t.z * -tt.x || 1e-6;
    const bx = R0.x + rr.x * LANE - (R0.x + rc.x * LANE), bz = R0.z + rr.z * LANE - (R0.z + rc.z * LANE);
    const sC = (bx * -tt.z - bz * -tt.x) / det;
    const C = { x: R0.x + rc.x * LANE + t.x * sC, z: R0.z + rc.z * LANE + t.z * sC };
    const A = { x: C.x - t.x * R, z: C.z - t.z * R };
    const centre = { x: A.x - rc.x * R, z: A.z - rc.z * R };
    const out = [];
    for (let d = 14; d > 0; d -= 1.5) out.push({ x: A.x - t.x * d, z: A.z - t.z * d });
    for (let a = 0; a <= 1.0001; a += 1 / 14) { const th = a * Math.PI / 2; out.push({ x: centre.x + R * (rc.x * Math.cos(th) + t.x * Math.sin(th)), z: centre.z + R * (rc.z * Math.cos(th) + t.z * Math.sin(th)) }); }
    const B = out[out.length - 1];
    for (let k = 0; k < 24; k++) { // on along the ring lane
      const j = (((ringJoin + ringStep * k) % ring.n) + ring.n) % ring.n, q = ring.pts[j];
      const tj = { x: ring.tans[j].x * ringStep, z: ring.tans[j].z * ringStep };
      const px = q.x - tj.z * LANE, pz = q.z + tj.x * LANE;
      if ((px - B.x) * tt.x + (pz - B.z) * tt.z > 1.2) out.push({ x: px, z: pz });
    }
    return out;
  })();

  function start(fromPosition, fromYaw) {
    audio.unlock();
    Object.assign(state, { active: true, x: fromPosition.x, z: fromPosition.z, yaw: fromYaw, vx: 0, vz: 0, steer: 0, nitro: 1, nitroActive: false, y: 0.56, pitch: 0, roll: 0, left: false, right: false, hazard: false, lights: false, brake: false, bumped: 0, time: 0, vy: 0, air: false, airborne: false, jetT: 0, cooldown: 0, pendingJump: false, freeTime: 0, mirror: false, mirrorOn: false });
    if (jetGroup.parent !== carRoot) carRoot.add(jetGroup);
    Object.assign(state, { prevGround: 0.03, toastT: 0, toldRamp: false });
    world.barrier.group.visible = true; // the barrier only exists once the drive has started
    state.launch = { time: 0, index: 0, phase: "turn", k: 0, wait: 0 };
    state.barrierPassed = false;
    world.barrier.closing = false; world.barrier.t = 0;
    traffic.reset();
    deer?.reset();
    camPos.copy(camera.position);
    camLook.set(fromPosition.x, 1, fromPosition.z);
    fovNow = camera.fov;
    renderToggles();
    keys.clear(); held.clear();
  }
  function stop() { state.active = false; world.barrier.group.visible = false; jetGroup.visible = false; puffs.forEach((p) => { p.life = 0; p.sprite.visible = false; }); shock.visible = false; keys.clear(); held.clear(); audio.horn(false); camera.fov = baseFov; camera.updateProjectionMatrix(); world.barrier.closing = false; world.barrier.t = 0; traffic.group.visible = false; deer?.update(0, state, false); }

  // put the car back on the road centre (key R)
  function respawn() {
    const hit = world.nearest(state.x, state.z, 6);
    if (hit.index < 0) return;
    let { x, z, tx, tz } = hit;
    if (hit.road === "connector" && state.barrierPassed && hit.local < world.barrier.index + 3) { // never behind the barrier
      const road = world.roads.connector, k = world.barrier.index + 4;
      x = road.pts[k].x; z = road.pts[k].z; tx = road.tans[k].x; tz = road.tans[k].z;
    }
    state.x = x - tz * 2.1; state.z = z + tx * 2.1; // right lane
    state.yaw = Math.atan2(-tx, -tz);
    state.vx = state.vz = 0;
  }

  // ---------- physics ----------
  // The exit is a short film: the car turns on the podium, rolls out of the plaza down the entry road, turns off to
  // the left, slows down at the barrier, the boom comes down slowly while the car passes and closes behind it. Only
  // then does the player get the controls (no way back).
  function autopilot(dt, vf) {
    const launch = state.launch;
    launch.time += dt;
    const b = world.barrier;
    const s = (state.x - b.x) * b.tx + (state.z - b.z) * b.tz; // distance to the barrier plane along the road
    let best = launch.index, bestD = Infinity;
    for (let i = Math.max(0, launch.index - 2); i < Math.min(connector.pts.length, launch.index + 25); i++) {
      const d = (connector.pts[i].x - state.x) ** 2 + (connector.pts[i].z - state.z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    launch.index = best;
    const ahead = Math.min(connector.pts.length - 1, best + 6);
    const lane = clamp((best - 10) / 20, 0, 1) * 2.1; // in the right lane of the exit road
    let target = { x: connector.pts[ahead].x - connector.tans[ahead].z * lane, z: connector.pts[ahead].z + connector.tans[ahead].x * lane };
    let heading = Math.atan2(-(target.x - state.x), -(target.z - state.z));
    let error = wrapAngle(heading - state.yaw);
    if (launch.phase === "turn") {
      if (launch.time < 1.1) { // turn on the spot before rolling
        state.yaw += error * (1 - Math.exp(-dt * 3.2));
        return { throttle: 0, steer: 0, brake: 0 };
      }
      launch.phase = "exit";
    }
    if (!b.closing && s > -9) b.closing = true;     // the boom starts to come down just before the car arrives
    if (s > 3) state.barrierPassed = true;
    if (launch.phase === "exit" && (state.x - joinPath[0].x) * connector.tans[connector.n].x + (state.z - joinPath[0].z) * connector.tans[connector.n].z > -2) launch.phase = "join";
    let wanted = clamp(23 - Math.abs(error) * 17, 7, 23); // quick on the straight, slower in the turn-off
    if (launch.phase === "join") { // follow the prepared path: straight on, a clean quarter circle, then along the ring
      let bestK = launch.k, bd = Infinity;
      for (let k = Math.max(0, launch.k - 2); k < Math.min(joinPath.length, launch.k + 14); k++) {
        const q = joinPath[k], d = (q.x - state.x) ** 2 + (q.z - state.z) ** 2;
        if (d < bd) { bd = d; bestK = k; }
      }
      launch.k = bestK;
      target = joinPath[Math.min(joinPath.length - 1, bestK + 4)];
      heading = Math.atan2(-(target.x - state.x), -(target.z - state.z));
      error = wrapAngle(heading - state.yaw);
      wanted = clamp(13 - Math.abs(error) * 7, 6.5, 13);
      if (bestK >= joinPath.length - 6 && Math.abs(error) < 0.2) { state.launch = null; return { throttle: 0, steer: 0, brake: 0 }; } // the player drives
    }
    const toBarrier = (b.index - launch.index) * 2; // metres along the exit road
    if (toBarrier < 22 && toBarrier > -12) wanted = Math.min(wanted, 10); // and at the barrier
    // another car on the ring near the junction (or right in front): wait until the way is free
    const dJunction = Math.hypot(state.x - world.R0.x, state.z - world.R0.z);
    if (dJunction < 70 && launch.wait < 12) {
      let blocked = false;
      for (const car of traffic.cars) {
        const dc = Math.hypot(car.x - world.R0.x, car.z - world.R0.z), dp = Math.hypot(car.x - state.x, car.z - state.z);
        if ((dc < 32 && dJunction > 6) || dp < 14) blocked = true;
      }
      if (blocked) {
        launch.wait += dt;
        wanted = dJunction > 16 ? Math.min(wanted, (dJunction - 14) * 0.5) : 0; // stop in front of the junction
        if (wanted < 0.5) return { throttle: 0, steer: -clamp(error * 2.2, -1, 1), brake: vf > 0.3 ? 1 : 0 };
      }
    }
    return { throttle: clamp((wanted - vf) * 0.35, 0, 0.7), steer: -clamp(error * 2.2, -1, 1), brake: vf > wanted + 3 ? 0.3 : 0 };
  }

  function update(dt) {
    if (!state.active) return;
    state.time += dt;
    state.toastT = Math.max(0, state.toastT - dt);
    state.cooldown = Math.max(0, state.cooldown - dt); state.jetT = Math.max(0, state.jetT - dt);
    if (!state.launch) state.freeTime += dt;
    const forward = f.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    const rx = Math.cos(state.yaw), rz = -Math.sin(state.yaw);
    let vf = state.vx * forward.x + state.vz * forward.z;
    let vl = state.vx * rx + state.vz * rz;

    let throttle = down("throttle") ? 1 : 0;
    let brake = down("brake") ? 1 : 0;
    let steerInput = (down("right") ? 1 : 0) - (down("left") ? 1 : 0);
    let handbrake = down("handbrake");
    let nitro = down("nitro");
    if (state.launch) { // the exit film: the inputs are ignored until the car is behind the barrier
      const auto = autopilot(dt, vf);
      throttle = auto.throttle; steerInput = auto.steer; brake = auto.brake; handbrake = false; nitro = false;
    }
    state.steerInput = steerInput;
    state.mirror = !state.launch && state.mirrorOn;
    if (state.pendingJump) { // air jets: up and forward
      state.pendingJump = false;
      if (!state.air) {
        burst(1); audio.jet();
        state.air = true; state.vy = 10; state.jetT = 1.1; state.cooldown = 4;
        vf = vf > 50 ? vf : Math.min(Math.max(vf + 9, 24), 50); // a jump gives some speed, but never boost speed
      }
    }

    // engine, brake, drag
    state.nitroActive = nitro && state.nitro > 0.02 && throttle > 0;
    const vmax = state.nitroActive ? V_NITRO : V_MAX;
    let accel = throttle * (state.nitroActive ? 30 : 17) * clamp(1 - vf / vmax, 0, 1.2);
    if (vf > vmax) accel -= (vf - vmax) * 1.5;
    if (brake) {
      if (vf > 0.6) accel -= 36;
      else if (!throttle) accel = vf > -9 ? -9 : 0; // reverse
    }
    accel -= 0.02 * vf + 0.0009 * vf * Math.abs(vf);
    const hit = world.nearest(state.x, state.z, 2);
    const inShow = Math.hypot(state.x - PODIUM.x, state.z - PODIUM.z) < 45;
    const offset = inShow || hit.index < 0 ? 0 : hit.offset;
    const off = Math.abs(offset);
    if (!state.air) accel -= vf * 0.12 * smooth((off - (ROAD_HALF + 0.9)) / 2.2); // the verge hardly slows the car down
    vf += accel * dt;
    if (handbrake) { // the hand brake holds the car: no jitter at standstill
      const dv = 14 * dt;
      vf = Math.abs(vf) <= dv ? 0 : vf - Math.sign(vf) * dv;
      if (vf === 0 && throttle === 0) vl = 0;
    }
    state.speed = vf;
    state.brake = brake > 0 && vf > 0.6 || handbrake;

    // steering (bicycle model): gentle, with less steering angle at speed and a limit on the lateral acceleration
    const maxSteer = lerp(0.52, 0.055, smooth(Math.abs(vf) / 50)) * (state.air ? 0.35 : 1);
    state.steer += (steerInput * maxSteer - state.steer) * (1 - Math.exp(-dt * 6.5));
    const maxYawRate = Math.min(2.0, 20 / Math.max(Math.abs(vf), 1));
    const yawRate = clamp((vf * Math.tan(state.steer)) / WHEELBASE, -maxYawRate, maxYawRate);
    state.yaw -= yawRate * dt;

    // grip: sideways speed fades quickly, the hand brake lets the car drift
    vl *= Math.exp(-(state.air ? 0.6 : handbrake ? 1.0 : off > ROAD_HALF + 4 ? 6 : 8.5) * dt);
    const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw), rx2 = Math.cos(state.yaw), rz2 = -Math.sin(state.yaw);
    state.vx = fx * vf + rx2 * vl;
    state.vz = fz * vf + rz2 * vl;
    state.x += state.vx * dt;
    state.z += state.vz * dt;

    // guard rail beside the road: the car slides along it and loses speed
    if (!inShow && !(state.launch && state.launch.phase === "join")) { // (not while the film joins the ring: the pad there is wide)
      const h = world.nearest(state.x, state.z, 2);
      let railOff = RAIL_OFFSET, railOn = h.index >= 0;
      if (h.road === "cross") { // the forest track has narrower rails, none around the ramps
        railOff = world.crossRail;
        const tc = world.trailInfo(state.x, state.z);
        const jp = world.jumpPark;
        if (tc.near && tc.d >= jp.clearFrom && tc.d <= jp.clearTo) { // in the fenced clearing around the ramps
          railOff = jp.clearHalf;
          if (Math.abs(tc.lat) > world.crossRail - 0.3) { // beside the track: the fences across both ends of the clearing
            const cF = Math.abs(-Math.sin(state.yaw) * tc.tx - Math.cos(state.yaw) * tc.tz), ext = cF * 2.3 + Math.sqrt(Math.max(0, 1 - cF * cF)) * 1.0;
            const lo = jp.clearFrom + ext, hi = jp.clearTo - ext, shift = tc.d < lo ? lo - tc.d : tc.d > hi ? hi - tc.d : 0;
            if (shift) {
              state.x += tc.tx * shift; state.z += tc.tz * shift;
              const va = state.vx * tc.tx + state.vz * tc.tz;
              if (va * shift < 0) { state.vx -= tc.tx * va; state.vz -= tc.tz * va; if (Math.abs(va) > 3) { state.bumped = Math.max(state.bumped, Math.min(0.4, Math.abs(va) * 0.04)); audio.bump(Math.abs(va) / 12); } }
            }
          }
        }
      }
      // the rail touches the corner of the car that sticks out the most: half width 1.0 m, half length 2.3 m
      const cosF = Math.abs(-Math.sin(state.yaw) * h.tx - Math.cos(state.yaw) * h.tz), sinF = Math.sqrt(Math.max(0, 1 - cosF * cosF));
      const limit = railOff - 0.1 - (cosF * 1.0 + sinF * 2.3);
      if (railOn && Math.abs(h.offset) > limit) {
        const side = Math.sign(h.offset);
        const over = Math.abs(h.offset) - limit;
        const nx = -h.tz * side, nz = h.tx * side; // points from the road centre to the rail
        state.x -= nx * over; state.z -= nz * over;
        const into = state.vx * nx + state.vz * nz;
        if (into > 0) { state.vx -= nx * into * 1.3; state.vz -= nz * into * 1.3; state.vx *= 0.97; state.vz *= 0.97; }
        if (into > 3) { state.bumped = Math.min(0.4, into * 0.04); if (state.bumped > 0.12) audio.bump(into / 12); }
        // the rail turns the car gently back along the road
        const along = wrapAngle(Math.atan2(-h.tx, -h.tz) - state.yaw);
        if (vf > 0 && Math.abs(along) < 1.2) state.yaw += along * Math.min(1, dt * 1.5);
      }
    }
    state.bumped = Math.max(0, state.bumped - dt);

    // the barrier on the exit road closes behind the car: no way back into the show
    {
      const b = world.barrier;
      const s = (state.x - b.x) * b.tx + (state.z - b.z) * b.tz;
      const lateral = Math.abs((state.x - b.x) * -b.tz + (state.z - b.z) * b.tx);
      if (!state.barrierPassed && s > 3 && lateral < 8) { state.barrierPassed = true; b.closing = true; }
      if (state.barrierPassed && s < 0.8 && s > -25 && lateral < 12) {
        state.x += b.tx * (0.8 - s); state.z += b.tz * (0.8 - s);
        const along = state.vx * b.tx + state.vz * b.tz;
        if (along < 0) { state.vx -= b.tx * along; state.vz -= b.tz * along; state.bumped = Math.min(0.4, -along * 0.04); if (-along > 3) audio.bump(-along / 12); }
      }
    }

    // indicators switch off by themselves after the turn
    if ((state.left || state.right) && Math.abs(wrapAngle(state.yaw - state.indicatorYaw)) > 0.5 && Math.abs(steerInput) < 0.1 && Math.abs(state.steer) < 0.03) {
      state.left = state.right = false; renderToggles();
    }

    traffic.update(dt, state, true); // other cars: lane, distance, lights, bumps
    deer?.update(dt, state, true);   // the deer that crosses the road now and then

    // solid obstacles (the wooden signs on the forest track)
    for (const o of world.obstacles) {
      if ((state.x - o.x) ** 2 + (state.z - o.z) ** 2 > 36) continue;
      const px = -Math.sin(state.yaw), pz = -Math.cos(state.yaw);
      for (const k of [-1.3, 1.3]) {
        const dx = state.x + px * k - o.x, dz = state.z + pz * k - o.z, d = Math.hypot(dx, dz), min = o.r + 1.0;
        if (d >= min || d < 1e-4) continue;
        const nx = dx / d, nz = dz / d;
        state.x += nx * (min - d); state.z += nz * (min - d);
        const into = -(state.vx * nx + state.vz * nz);
        if (into > 0) { state.vx += nx * into * 1.3; state.vz += nz * into * 1.3; if (into > 2.5) { state.bumped = Math.max(state.bumped, Math.min(0.4, into * 0.04)); audio.bump(into / 9); } }
      }
    }

    // forest track: hint on the way to the ramp; the faces of the ramps in the gap are walls
    const tr = world.trailInfo(state.x, state.z);
    if (tr.near && tr.gap && state.y < world.jumpPark.H - 0.6) {
      const lo = world.jumpPark.r1 + 0.9, hi = world.jumpPark.l0 - 0.9;
      const shift = tr.d < lo ? lo - tr.d : tr.d > hi ? hi - tr.d : 0;
      if (shift) {
        state.x += tr.tx * shift; state.z += tr.tz * shift;
        const va = state.vx * tr.tx + state.vz * tr.tz;
        if (va * shift < 0) { state.vx -= tr.tx * va; state.vz -= tr.tz * va; if (Math.abs(va) > 3) { state.bumped = Math.max(state.bumped, Math.min(0.4, Math.abs(va) * 0.04)); audio.bump(Math.abs(va) / 12); } }
      }
    }
    if (!tr.near) state.toldRamp = false;
    else if (!state.toldRamp && ((tr.d > world.jumpPark.r0 - 90 && tr.d < world.jumpPark.r0 - 50) || (tr.d > world.jumpPark.l1 + 50 && tr.d < world.jumpPark.l1 + 90))) {
      state.toldRamp = true;
      toast("Rampe voraus: Mit genug Tempo springst du drüber. Links und rechts ist Platz zum Vorbeifahren.", 7);
    }

    // ground height, body pitch and roll
    const onPodium = Math.hypot(state.x - PODIUM.x, state.z - PODIUM.z) < 4.3;
    const ground = onPodium ? 0.56 : Math.max(0.03, world.heightAt(state.x, state.z)); // the ground beside the road lies lower: the car stands on the asphalt
    const targetY = tr.on ? tr.h + (tr.h >= 0 ? 0.03 : 0) : ground; // the ramps rise
    if (!state.air && state.prevGround > 1 && state.prevGround - targetY > 0.6) { state.air = true; state.vy = Math.max(0, Math.abs(vf)) * world.jumpPark.slope; state.jetT = 0; } // over the edge of the ramp
    state.prevGround = targetY;
    let pitchTarget = clamp(-accel * 0.0035, -0.05, 0.05);
    if (!state.air && tr.on && tr.slope) pitchTarget = Math.atan(tr.slope) * Math.sign(-Math.sin(state.yaw) * tr.tx - Math.cos(state.yaw) * tr.tz || 1); // nose up on the ramp, in both directions
    if (state.air) { // ballistic flight: thrust while the jets burn, then falling
      state.vy -= (state.jetT > 0 ? 9 : 16) * dt;
      state.y += state.vy * dt;
      pitchTarget = clamp(state.vy * 0.035, -0.4, 0.4);
      if (state.vy < 0 && state.y <= targetY) {
        state.air = false; state.y = targetY; state.jetT = 0;
        state.bumped = Math.max(state.bumped, 0.3); audio.bump(0.8); burst(1.2);
      }
    } else state.y += (targetY - state.y) * clamp(dt * 12, 0, 1);
    state.airborne = state.air && state.y > targetY + 1.1; // other cars cannot touch the player up there
    state.pitch += (pitchTarget - state.pitch) * (1 - Math.exp(-dt * 6));
    state.roll += (clamp(-yawRate * vf * 0.003, -0.05, 0.05) - state.roll) * (1 - Math.exp(-dt * 5));
    updateEffects(dt);
    carRoot.position.set(state.x, state.y, state.z);
    carRoot.rotation.set(state.pitch, state.yaw, state.roll, "YXZ");

    lights.update({ left: state.left, right: state.right, hazard: state.hazard, brake: state.brake, lights: state.lights }, state.time);
    const blinkOn = Math.sin(state.time * Math.PI * 3) > 0; // same rhythm as the lamps: tick on, tock off
    if ((state.left || state.right || state.hazard) && blinkOn !== lastBlink) audio.tick(blinkOn);
    lastBlink = blinkOn;
    state.throttle = throttle; // the engine sound is driven from the main loop (audio.update)

    // boost drains while used and recovers when not
    state.nitro = clamp(state.nitro + (state.nitroActive ? -0.28 : 0.1) * dt);

    // chase camera, wider angle at speed
    const speed = Math.hypot(state.vx, state.vz);
    const back = 7.2 + Math.min(speed, 60) * 0.03 + (state.air ? 2.2 : 0);
    wantPos.set(state.x - fx * back, state.y + 2.9 + Math.min(speed, 60) * 0.008, state.z - fz * back);
    wantLook.set(state.x + fx * 11, state.y + 0.1, state.z + fz * 11); // looks a little below the car, so the car sits higher in the picture
    camPos.lerp(wantPos, 1 - Math.exp(-dt * (4 + Math.min(speed, 60) * 0.09))); // follows tighter at speed: no long lag behind the car
    camLook.lerp(wantLook, 1 - Math.exp(-dt * 6));
    camera.position.copy(camPos);
    if (speed > 38 || state.bumped) { // shake at full speed and on contact with the wall
      const s = (Math.max(0, speed - 38) / 50) * 0.05 + state.bumped * 0.25;
      const ph = state.time * 41; // smooth vibration instead of random jumps
      camera.position.x += Math.sin(ph) * s * 0.5; camera.position.y += Math.sin(ph * 1.37 + 1.3) * s * 0.5;
    }
    camera.lookAt(camLook);
    const targetFov = baseFov + Math.min(speed, 60) * 0.18 + (state.nitroActive ? 9 : 0) + (state.air ? 7 : 0);
    fovNow += (targetFov - fovNow) * (1 - Math.exp(-dt * 4));
    if (Math.abs(camera.fov - fovNow) > 0.05) { camera.fov = fovNow; camera.updateProjectionMatrix(); }

    hud({ kmh: Math.round(Math.abs(vf) * 3.6), reverse: vf < -0.5, nitro: state.nitro, boost: state.nitroActive, left: state.left, right: state.right, hazard: state.hazard, lights: state.lights, launching: Boolean(state.launch), mirror: state.mirror, jetReady: state.cooldown <= 0 && !state.air, free: state.freeTime, toast: state.toastT > 0 ? state.toastText : "" });
  }

  // the jets hang on the car: attached early so that their shaders are compiled during the loading screen
  const prepare = () => { if (jetGroup.parent !== carRoot) carRoot.add(jetGroup); };
  return { start, stop, update, state, respawn, prepare, get active() { return state.active; } };
}
