// Road to the Super Car (three.js). Three phases on one page:
//   1. film   - camera high above the forest -> down to the car on the road -> drive to the Aureo Super Car Show
//   2. show   - the car stands on the turntable, photographers flash, the details panel appears
//   3. drive  - "Losfahren": the car leaves the plaza and the visitor drives it on the road (keyboard / panels)
// The world (sky, mountains, forest, roads), the show and the car live in ./r2s/*.js.
//
// Which car drives: ?configuration=<id> (button in the configurator) -> last saved configuration (localStorage)
// -> first standard car. Car, model and configuration come from the configurator service via the gateway.
// The road2supercar service only keeps the show statistics (visitors, photos) in Redis.

const stage = document.querySelector("#r2s");
const $ = (selector) => stage?.querySelector(selector);

// ---------- timeline of the film (seconds) ----------
const T_DESCEND = 3.5;      // camera sinks from the sky to the road
const T_DRIVE = 6;          // car starts driving
const DRIVE_DURATION = 17;
const T_ARRIVE = T_DRIVE + DRIVE_DURATION;
const T_SHOW = T_ARRIVE + 2.5; // details panel appears
const T_FLASH = T_ARRIVE - 6;  // the photographers start to flash shortly before the car arrives
const DEFAULT_COLOR = "#ff5600";

async function main() {
  const loadingText = $("#r2s-loading-text");
  let THREE, worldModule, showModule, carModule, driveModule, audioModule, trafficModule, deerModule, utils, RoomEnvironment;
  try {
    THREE = await import("three");
    ({ RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js"));
    [worldModule, showModule, carModule, driveModule, audioModule, trafficModule, deerModule, utils] = await Promise.all([
      import("./r2s/world.js"), import("./r2s/show.js"), import("./r2s/car.js"), import("./r2s/drive.js"), import("./r2s/audio.js"), import("./r2s/traffic.js"), import("./r2s/deer.js"), import("./r2s/util.js"),
    ]);
  } catch (error) {
    console.error("[road2supercar] libraries", error);
    loadingText.textContent = "Die 3D-Bibliothek konnte nicht geladen werden (Internetverbindung nötig).";
    $("#r2s-loadbar").parentElement.hidden = true;
    return;
  }
  const { rand, smooth, smoother } = utils;

  // ---------- renderer, scene ----------
  const canvas = $("#r2s-canvas");
  const dpr = window.devicePixelRatio || 1;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  const maxRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1.25), 2); // sharp: at least a little supersampling
  let ratio = maxRatio;
  renderer.setPixelRatio(ratio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  const camera = new THREE.PerspectiveCamera(52, 1, 0.3, 3500);

  const world = worldModule.buildWorld(scene, renderer);
  scene.add(new THREE.HemisphereLight("#cfe4ff", "#4a5f3c", 1.5));
  const sun = new THREE.DirectionalLight("#ffe3bc", 3.4);
  sun.position.copy(world.sunDirection).multiplyScalar(100);
  scene.add(sun);
  const show = showModule.buildShow(scene, world);
  const factory = await carModule.createCarFactory();
  const PODIUM = worldModule.PODIUM;

  // ---------- sound (generated in the browser, starts with the first click or key press) ----------
  const audio = audioModule.createAudio({ podium: PODIUM });
  const soundButton = $("#r2s-sound");
  audio.onState((state, muted) => {
    soundButton.textContent = state !== "running" ? "♪ Ton aktivieren" : muted ? "♪ Ton aus" : "♪ Ton an";
    soundButton.setAttribute("aria-pressed", String(state === "running" && !muted));
  });
  soundButton.addEventListener("click", () => { if (audio.state !== "running") audio.unlock(); else audio.toggle(); });
  for (const type of ["pointerdown", "keydown", "touchstart"]) {
    window.addEventListener(type, (event) => { if (!event.target.closest?.("#r2s-sound")) audio.unlock(); }, { passive: true });
  }
  const flashRight = new THREE.Vector3(), flashDirection = new THREE.Vector3();
  show.onFlash = (position) => { // every picture of a photographer is heard, louder and on the side where it happens
    flashRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    flashDirection.copy(position).sub(camera.position);
    const distance = flashDirection.length();
    audio.shutter(distance, flashRight.dot(flashDirection.normalize()));
  };

  const carRoot = new THREE.Group();
  scene.add(carRoot);
  const carLights = carModule.createCarLights();
  carRoot.add(carLights.group);
  let car3d = null; // { object, wheels }
  const clearCar = () => { if (car3d) carRoot.remove(car3d.object); car3d = null; };

  // ---------- HUD of the drive ----------
  const hudSpeed = $("#r2s-speed");
  const hudBoost = $("#r2s-boost-bar");
  const gaugeNeedle = $("#r2s-needle");
  const gaugeActive = $("#r2s-gauge-active");
  const driveUi = $("#r2s-drive-ui");
  const toastEl = $("#r2s-toast");
  const SPEED_MAX = 320; // km/h at the end of the dial; the orange zone (above 200) is only reachable with the boost
  {
    const ns = "http://www.w3.org/2000/svg"; // ticks and numbers of the dial
    const ticks = $("#r2s-gauge-ticks");
    for (let v = 0; v <= SPEED_MAX; v += 20) {
      const angle = ((150 + (v / SPEED_MAX) * 240) * Math.PI) / 180, major = v % 40 === 0;
      const line = document.createElementNS(ns, "line");
      const r0 = major ? 90 : 96;
      line.setAttribute("x1", 130 + Math.cos(angle) * r0); line.setAttribute("y1", 130 + Math.sin(angle) * r0);
      line.setAttribute("x2", 130 + Math.cos(angle) * 102); line.setAttribute("y2", 130 + Math.sin(angle) * 102);
      line.setAttribute("class", major ? "tick" : "tick-minor");
      ticks.append(line);
      if (major) {
        const text = document.createElementNS(ns, "text");
        text.setAttribute("x", 130 + Math.cos(angle) * 76); text.setAttribute("y", 130 + Math.sin(angle) * 76);
        text.textContent = String(v);
        ticks.append(text);
      }
    }
  }
  const hudLast = {};
  const traffic = trafficModule.createTraffic({ scene, world, camera, audio });
  const deer = deerModule.createDeer({ scene, world, audio });
  const drive = driveModule.createDrive({
    world, camera, carRoot, lights: carLights, root: stage, audio, traffic, deer,
    hud(h) { // the page is only touched when a value really changed (no needless style work every frame)
      const share = Math.min(1, h.kmh / SPEED_MAX), last = hudLast;
      const speedText = (h.reverse ? "R " : "") + h.kmh;
      if (last.speed !== speedText) { last.speed = speedText; hudSpeed.textContent = speedText; gaugeNeedle.style.transform = `rotate(${(150 + share * 240).toFixed(1)}deg)`; gaugeActive.style.strokeDasharray = `${(share * 100).toFixed(1)} 100`; }
      const boostWidth = (h.nitro * 100).toFixed(0) + "%";
      if (last.boostWidth !== boostWidth) { last.boostWidth = boostWidth; hudBoost.style.width = boostWidth; }
      const flags = [String(h.boost), String(h.launching), String(h.mirror), String(h.jetReady), String(h.free < 18), h.toast].join("|");
      if (last.flags !== flags) {
        last.flags = flags;
        hudBoost.dataset.active = String(h.boost);
        driveUi.dataset.locked = String(h.launching); // during the exit film the controls stay hidden
        driveUi.dataset.mirror = String(h.mirror);    // the rear-view mirror only while the key / button is held
        driveUi.dataset.jet = String(h.jetReady);
        driveUi.dataset.hint = String(h.free < 18);   // the hint fades out after a while
        toastEl.textContent = h.toast; toastEl.dataset.show = String(Boolean(h.toast));
      }
    },
  });

  // ---------- map in the top left corner: roads, other cars and where you are ----------
  const mapCanvas = $("#r2s-map"), mapCtx = mapCanvas.getContext("2d");
  const MAP_SIZE = mapCanvas.width, MAP_PAD = 26;
  const mapBase = document.createElement("canvas");
  mapBase.width = mapBase.height = MAP_SIZE;
  const mapView = { scale: 1, ox: 0, oy: 0 };
  {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const key of ["ring", "connector", "cross"]) for (const p of world.roads[key].pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    mapView.scale = Math.min((MAP_SIZE - 2 * MAP_PAD) / (maxX - minX), (MAP_SIZE - 2 * MAP_PAD) / (maxZ - minZ));
    mapView.ox = (MAP_SIZE - (maxX - minX) * mapView.scale) / 2 - minX * mapView.scale;
    mapView.oy = (MAP_SIZE - (maxZ - minZ) * mapView.scale) / 2 - minZ * mapView.scale;
    const g = mapBase.getContext("2d");
    const X = (x) => x * mapView.scale + mapView.ox, Y = (z) => z * mapView.scale + mapView.oy;
    const line = (road, color, width, dash) => {
      g.beginPath();
      road.pts.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.z)) : g.moveTo(X(p.x), Y(p.z))));
      if (road.closed) g.closePath();
      g.strokeStyle = color; g.lineWidth = width; g.lineJoin = "round"; g.lineCap = "round"; g.setLineDash(dash || []); g.stroke();
    };
    line(world.roads.ring, "rgba(255,255,255,.28)", 11);
    line(world.roads.ring, "#d9dde3", 6);
    line(world.roads.connector, "#d9dde3", 6);
    line(world.roads.cross, "#d0a566", 4, [8, 6]);
    const mark = (x, z, color, label) => {
      g.beginPath(); g.arc(X(x), Y(z), 8, 0, Math.PI * 2); g.fillStyle = color; g.fill();
      g.fillStyle = "#fff"; g.font = "bold 13px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(label, X(x), Y(z) + 1);
    };
    mark(world.PODIUM.x, world.PODIUM.z, "#2d6cdf", "S");
    mark(world.jumpPark.x, world.jumpPark.z, "#e5342d", "!");
  }
  let mapTick = 0;
  function drawMap() {
    if (mapTick++ % 3) return; // about 20 times a second is plenty
    const X = (x) => x * mapView.scale + mapView.ox, Y = (z) => z * mapView.scale + mapView.oy;
    mapCtx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    mapCtx.drawImage(mapBase, 0, 0);
    mapCtx.fillStyle = "rgba(255,255,255,.85)";
    for (const car of traffic.cars) { mapCtx.beginPath(); mapCtx.arc(X(car.x), Y(car.z), 4, 0, Math.PI * 2); mapCtx.fill(); }
    const s = drive.state;
    mapCtx.save();
    mapCtx.translate(X(s.x), Y(s.z));
    mapCtx.rotate(Math.atan2(-Math.sin(s.yaw), Math.cos(s.yaw))); // heading: up on the map = north (-z)
    mapCtx.beginPath(); mapCtx.moveTo(0, -13); mapCtx.lineTo(9, 10); mapCtx.lineTo(0, 5); mapCtx.lineTo(-9, 10); mapCtx.closePath();
    mapCtx.fillStyle = "#ff8a1a"; mapCtx.strokeStyle = "#fff"; mapCtx.lineWidth = 2.5; mapCtx.stroke(); mapCtx.fill();
    mapCtx.restore();
  }

  // ---------- film timeline ----------
  const forward = new THREE.Vector3(0, 0, -1);
  const right = new THREE.Vector3(1, 0, 0);
  const upAxis = new THREE.Vector3(0, 1, 0);
  const carPosition = new THREE.Vector3();
  const lastPosition = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  let carYaw = 0, yawReady = false, speed = 0;
  let time = 0;
  let mode = "loading"; // loading | film | show | drive
  let snap = true;
  let userYaw = 0;
  let shownPanel = false;
  let cheered = false;

  const U0 = world.filmU0;
  function placeCar(t, dt) {
    const u = U0 + (1 - U0) * smoother((t - T_DRIVE) / DRIVE_DURATION);
    world.film.getPointAt(u, carPosition);
    world.film.getTangentAt(u, tangent);
    const targetYaw = Math.atan2(-tangent.x, -tangent.z);
    carYaw = yawReady && dt > 0 ? carYaw + utils.wrapAngle(targetYaw - carYaw) * (1 - Math.exp(-dt * 7)) : targetYaw;
    yawReady = true;
    forward.set(-Math.sin(carYaw), 0, -Math.cos(carYaw));
    right.crossVectors(forward, upAxis).normalize();
    carPosition.y = 0.03 + 0.53 * smooth((u - 0.985) / 0.015); // the wheels stand on the asphalt (0.025), on the podium disc at 0.56
    if (dt > 0) {
      const measured = Math.hypot(carPosition.x - lastPosition.x, carPosition.z - lastPosition.z) / dt;
      speed += (Math.min(measured, 40) - speed) * (1 - Math.exp(-dt * 8));
    }
    lastPosition.copy(carPosition);
    carRoot.position.copy(carPosition);
    carRoot.rotation.set(0, carYaw + (t > T_ARRIVE ? (t - T_ARRIVE) * 0.32 : 0), 0, "YXZ"); // turntable after arrival
    if (car3d && dt > 0) for (const wheel of car3d.wheels) wheel.pivot.rotation[wheel.axis] += (wheel.sign * speed * dt) / wheel.radius;
    carLights.update({ brake: speed > 0.5 && t > T_ARRIVE - 4 && t < T_ARRIVE + 0.5, lights: false }, t);
  }

  const camTarget = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const lookCurrent = new THREE.Vector3(0, 0, -30);
  const tmp = new THREE.Vector3();
  const SKY_A = new THREE.Vector3(70, 150, 60);
  const SKY_B = new THREE.Vector3(26, 60, 38);

  function shotOffset(s) {
    // [ahead, right, up, lookAhead, lookUp, damping]
    if (s < 5) return [-9, 1.5, 3.2, 4, 1.2, 2.6];
    if (s < 9) return [-1.5, 8, 1.7, 1, 0.9, 2.6];
    if (s < 12.5) return [15, -2.2, 1.2, 0, 0.9, 3];
    return [-12, -3, 6, 6, 0.6, 2];
  }

  function director(t, dt) {
    let rate = 3;
    if (t < T_DESCEND) {
      const k = smooth(t / T_DESCEND);
      camTarget.lerpVectors(SKY_A, SKY_B, k);
      lookTarget.set(0, 0, -30 + 22 * k);
      rate = 1000;
    } else if (t < T_DRIVE) {
      const k = smooth((t - T_DESCEND) / (T_DRIVE - T_DESCEND));
      const [a, r, u, la, lu] = shotOffset(0);
      tmp.copy(carPosition).addScaledVector(forward, a).addScaledVector(right, r).setY(u);
      camTarget.lerpVectors(SKY_B, tmp, k);
      lookTarget.copy(carPosition).addScaledVector(forward, la * k).setY(lu * k);
      lookTarget.lerp(tmp.set(0, 0, -8), 1 - k);
      rate = 1000;
    } else if (t < T_ARRIVE - 3.5) {
      const [a, r, u, la, lu, damping] = shotOffset(t - T_DRIVE);
      camTarget.copy(carPosition).addScaledVector(forward, a).addScaledVector(right, r).setY(u);
      lookTarget.copy(carPosition).addScaledVector(forward, la).setY(lu);
      rate = damping;
    } else {
      // arrival: orbit around the podium; the visitor can drag to look around once the show is on
      const angle = Math.atan2(-forward.x, -forward.z) + userYaw + 0.25 * (t - (T_ARRIVE - 3.5)); // starts behind the car, then circles it
      camTarget.set(PODIUM.x + Math.sin(angle) * 9.5, 2.7, PODIUM.z + Math.cos(angle) * 9.5);
      lookTarget.set(PODIUM.x, 1.1, PODIUM.z);
      rate = 1.5;
    }
    const k = snap ? 1 : 1 - Math.exp(-rate * dt);
    camera.position.lerp(camTarget, Math.min(1, k));
    lookCurrent.lerp(lookTarget, snap ? 1 : 1 - Math.exp(-Math.max(rate, 3) * dt));
    camera.lookAt(lookCurrent);
  }

  // ---------- details, statistics ----------
  let current = null; // { car, snapshot, sourceText }

  function renderDetails(entry) {
    $("#r2s-car-name").textContent = entry.car ? entry.car.name : "Super Car";
    $("#r2s-car-source").textContent = entry.sourceText;
    const rows = (entry.snapshot?.selections || []).filter((s) => s.choiceId !== "original").map((s) => [s.groupLabel, s.choiceLabel]);
    if (!rows.length) rows.push(["Ausstattung", "Serie"]);
    $("#r2s-details").replaceChildren(...rows.map(([name, value]) => {
      const row = document.createElement("div");
      const dt = document.createElement("dt"); dt.textContent = name;
      const dd = document.createElement("dd"); dd.textContent = value;
      row.append(dt, dd);
      return row;
    }));
  }

  async function api(path, body) {
    const response = await fetch("/api/road2supercar" + path, {
      method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Status " + response.status);
    return response.json();
  }
  const renderStats = () => {}; // the show statistics are still counted in the service, but no longer shown
  let reportedFlashes = 0;
  setInterval(() => {
    if (mode !== "show") return;
    const delta = Math.min(60, show.flashes - reportedFlashes);
    if (delta < 1) return;
    reportedFlashes += delta;
    api("/show/photos", { count: delta }).then(renderStats).catch(() => {});
  }, 8000);

  function showPanel() {
    if (shownPanel) return;
    shownPanel = true;
    mode = "show";
    stage.dataset.state = "show";
    $("#r2s-skip").hidden = true;
    renderDetails(current);
    $("#r2s-panel").hidden = false;
    api("/show/visit", { carName: current.car ? current.car.name : "Super Car" }).then(renderStats).catch(() => api("/show").then(renderStats).catch(() => {}));
  }

  // ---------- play / replay / drive ----------
  const loadBar = $("#r2s-loadbar");
  const loadingOverlay = $("#r2s-loading");
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const clock = new THREE.Clock();

  async function play(entry, { replayOnly = false } = {}) {
    const token = (play.token = (play.token || 0) + 1);
    current = entry;
    if (drive.active) drive.stop();
    mode = "loading";
    shownPanel = false;
    for (const id of ["#r2s-panel", "#r2s-skip", "#r2s-drive-ui"]) $(id).hidden = true;
    stage.dataset.state = "loading";
    loadingOverlay.dataset.done = "false";
    loadingText.textContent = "Dein Auto wird vorbereitet …";
    camera.fov = 52; camera.updateProjectionMatrix();
    if (!replayOnly) {
      loadBar.style.width = "0";
      loadBar.parentElement.dataset.indeterminate = "true";
      clearCar();
      if (entry.car?.available) {
        try {
          const gltf = await factory.loadModel(entry.car, (fraction) => {
            if (token !== play.token || fraction == null) return;
            loadBar.parentElement.dataset.indeterminate = "false";
            loadBar.style.width = Math.round(fraction * 100) + "%";
            loadingText.textContent = "Dein Auto wird geladen … " + Math.round(fraction * 100) + " %";
          });
          if (token !== play.token) return;
          loadingText.textContent = "Dein Auto wird aufgebaut …";
          loadBar.parentElement.dataset.indeterminate = "true";
          await nextFrame();
          car3d = factory.prepareCar(entry.car, entry.snapshot, gltf);
        } catch (error) {
          console.error("[road2supercar] model", error);
          if (token !== play.token) return;
          entry.sourceText = "Das 3D-Modell konnte nicht geladen werden, es fährt ein Platzhalter.";
        }
      }
      if (!car3d) car3d = factory.placeholderCar(entry.snapshot?.selections?.find((s) => s.groupId === "paint")?.values?.baseColor || DEFAULT_COLOR);
      carRoot.add(car3d.object);
      drive.prepare();
      carRoot.traverse((o) => o.layers.set(1)); // layer 1: the player's own car is not shown in the rear-view mirror
    }
    time = 0; snap = true; userYaw = 0; cheered = false; yawReady = false; speed = 0;
    reportedFlashes = show.flashes;
    show.resetFlashes(T_FLASH);
    placeCar(0, 0);
    camera.position.copy(SKY_A);
    lookCurrent.set(0, 0, -30);
    camera.lookAt(lookCurrent);
    // compile shaders and upload textures now, so the film does not stutter at the start
    loadingText.textContent = "Die Szene wird vorbereitet …";
    try { await renderer.compileAsync(scene, camera); } catch { /* older GPUs: compiled on first frame */ }
    warmUp();
    await nextFrame();
    renderer.render(scene, camera);
    if (token !== play.token) return;
    clock.getDelta();
    playStartedAt = performance.now();
    loadingOverlay.dataset.done = "true";
    stage.dataset.state = "film";
    $("#r2s-skip").hidden = false;
    mode = "film";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) skip();
  }
  // Draw everything once while the loading screen is up: all shaders are compiled (also the ones for the rear-view
  // mirror and for objects that appear later: barrier, other cars, deer, jets) and all buffers are uploaded, so nothing
  // stalls the picture when it shows up for the first time.
  function warmUp() {
    const hidden = [], culled = [];
    scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
    try {
      renderer.render(scene, camera);
      show.setLightsOn(false); renderer.render(scene, camera); show.setLightsOn(true); // the shader variant without the show lights
      mirrorCamera.position.set(0, 2, 0); mirrorCamera.lookAt(0, 2, 60);
      renderer.setRenderTarget(mirrorTarget); renderer.render(scene, mirrorCamera); show.setLightsOn(false); renderer.render(scene, mirrorCamera); show.setLightsOn(true); renderer.setRenderTarget(null);
      renderer.render(mirrorQuadScene, mirrorQuadCamera);
    } catch (error) { console.warn("[road2supercar] warm-up", error); }
    for (const o of hidden) o.visible = false;
    for (const o of culled) o.frustumCulled = true;
    renderer.render(scene, camera);
  }
  function skip() { time = T_SHOW; snap = true; yawReady = false; }
  $("#r2s-skip").addEventListener("click", skip);
  $("#r2s-replay").addEventListener("click", () => play(current, { replayOnly: true }));

  function startDrive() {
    if (mode !== "show") return;
    mode = "drive";
    stage.dataset.state = "drive";
    $("#r2s-panel").hidden = true;
    $("#r2s-drive-ui").hidden = false;
    carRoot.rotation.order = "YXZ";
    drive.start(carRoot.position, carRoot.rotation.y);
    snap = false;
  }
  $("#r2s-drive").addEventListener("click", startDrive);
  $("#r2s-back").addEventListener("click", () => play(current, { replayOnly: true }));
  window.addEventListener("keydown", (event) => { if (event.code === "Escape" && mode === "drive") play(current, { replayOnly: true }); });

  // visitor drags to look around the car once the show is on
  let dragging = null;
  canvas.addEventListener("pointerdown", (event) => { if (mode === "show") { dragging = event.clientX; canvas.setPointerCapture(event.pointerId); } });
  canvas.addEventListener("pointermove", (event) => { if (dragging !== null) { userYaw -= (event.clientX - dragging) * 0.008; dragging = event.clientX; } });
  canvas.addEventListener("pointerup", () => { dragging = null; });
  canvas.style.touchAction = "pan-y";

  // ---------- rear-view mirror: the scene seen from the car backwards, drawn mirrored into a frame at the top ----------
  camera.layers.enable(1); // the main camera sees both layers
  const mirrorEl = $("#r2s-mirror");
  const MIRROR_ASPECT = 3.4;
  const mirrorTarget = new THREE.WebGLRenderTarget(576, Math.round(576 / MIRROR_ASPECT), { type: THREE.HalfFloatType });
  mirrorTarget.texture.wrapS = THREE.RepeatWrapping; // flip left and right like a real mirror
  mirrorTarget.texture.repeat.x = -1;
  mirrorTarget.texture.offset.x = 1;
  const mirrorCamera = new THREE.PerspectiveCamera(60, MIRROR_ASPECT, 0.3, 900);
  const mirrorQuadScene = new THREE.Scene();
  mirrorQuadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { map: { value: mirrorTarget.texture }, aspect: { value: MIRROR_ASPECT } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: "uniform sampler2D map; uniform float aspect; varying vec2 vUv; void main() { vec2 p = (vUv - 0.5) * vec2(aspect, 1.0); vec2 q = abs(p) - vec2(aspect * 0.5 - 0.5, 0.0); if (length(max(q, 0.0)) > 0.5) discard; gl_FragColor = texture2D(map, vec2(1.0 - vUv.x, vUv.y));\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n }",
    depthTest: false, depthWrite: false,
  })));
  const mirrorQuadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let mirrorTick = 0;
  function renderMirror() {
    const yaw = drive.state.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    if (mirrorTick++ % 2 === 0) { // the picture behind is refreshed every second frame: half the cost
      mirrorCamera.position.set(drive.state.x - fx * 0.4, drive.state.y + 1.35, drive.state.z - fz * 0.4);
      mirrorCamera.lookAt(mirrorCamera.position.x - fx * 60, drive.state.y + 1.0, mirrorCamera.position.z - fz * 60);
      renderer.setRenderTarget(mirrorTarget);
      renderer.render(scene, mirrorCamera);
      renderer.setRenderTarget(null);
    }
    const rect = mirrorEl.getBoundingClientRect(), box = canvas.getBoundingClientRect();
    const x = rect.left - box.left, y = box.height - (rect.bottom - box.top);
    renderer.setViewport(x, y, rect.width, rect.height);
    renderer.setScissor(x, y, rect.width, rect.height);
    renderer.setScissorTest(true);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(mirrorQuadScene, mirrorQuadCamera);
    renderer.autoClear = autoClear;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, box.width, box.height);
  }

  // ---------- loop ----------
  function resize() {
    const { clientWidth: w, clientHeight: h } = stage;
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }
  let needResize = false; // size changes are applied at the start of the next frame (resizing clears the canvas: it must never happen after drawing)
  new ResizeObserver(() => { needResize = true; }).observe(stage);
  resize();

  let frames = 0;
  let frameSum = 0;
  var playStartedAt = 0;
  function frame() {
    if (needResize) { needResize = false; resize(); }
    const dt = Math.min(clock.getDelta(), 0.05);
    if (mode === "film" || mode === "show") {
      time += dt;
      placeCar(time, snap ? 0 : dt);
      if (mode === "film" && time >= T_SHOW) showPanel();
      director(time, dt);
    } else if (mode === "drive") {
      drive.update(dt);
      const v = Math.hypot(drive.state.vx, drive.state.vz) * Math.sign(drive.state.speed || 1);
      if (car3d) for (const wheel of car3d.wheels) wheel.pivot.rotation[wheel.axis] += (wheel.sign * v * dt) / wheel.radius;
    } else {
      const idle = performance.now() / 1000; // while the car loads: slow drift above the forest
      camera.position.set(SKY_A.x + Math.sin(idle * 0.1) * 6, SKY_A.y, SKY_A.z);
      camera.lookAt(0, 0, -30);
    }
    const showNear = (camera.position.x - world.PODIUM.x) ** 2 + (camera.position.z - world.PODIUM.z) ** 2 < 170 * 170;
    show.group.visible = mode !== "drive" || (camera.position.x - world.PODIUM.x) ** 2 + (camera.position.z - world.PODIUM.z) ** 2 < 450 * 450; // in the free drive the plaza is not drawn from far away
    show.setLightsOn(showNear); // lights that are not needed are not in the shaders (free drive: cheaper everywhere)
    show.update(time, dt, (mode === "film" || mode === "show") && time > T_FLASH, showNear);
    world.update(dt, camera);

    // sound: forest and show ambience follow the camera, the engine follows the car
    const driving = mode === "drive";
    const playing = mode === "film" || mode === "show";
    if (playing && !cheered && time >= T_ARRIVE) { cheered = true; audio.cheer(); }
    audio.update({
      camera: camera.position, car: carRoot.position, dt,
      speed: (driving ? drive.state.speed : speed) || 0,
      throttle: driving ? drive.state.throttle || 0 : speed > 0.5 && time < T_ARRIVE - 1.5 ? 0.3 + Math.min(speed / 45, 0.5) : 0,
      boost: driving && drive.state.nitroActive,
      engineOn: driving || (playing && time < T_ARRIVE + 1),
    });
    renderer.render(scene, camera);
    if (mode === "drive" && driveUi.dataset.locked === "false") drawMap();
    if (mode === "drive" && driveUi.dataset.locked === "false" && driveUi.dataset.mirror === "true" && mirrorEl) renderMirror();
    snap = false;

    // adapt the resolution to the frame rate, but only slowly and never far below native (sharp, no flicker).
    // Not while loading and not right after the start (shader compiling must not make the picture blurry).
    if (mode === "loading" || performance.now() - playStartedAt < 4000) { frames = 0; frameSum = 0; }
    frames++;
    frameSum += dt;
    if (frames === 90) {
      const average = frameSum / frames;
      if (average > 0.03 && ratio > 1) { ratio = Math.max(1, ratio * 0.92); needResize = true; } // never below the native resolution
      else if (average < 0.0135 && ratio < maxRatio) { ratio = Math.min(maxRatio, ratio * 1.08); needResize = true; }
      frames = 0; frameSum = 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- which car? ----------
  async function getJson(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Status " + response.status);
    return response.json();
  }
  const STORAGE_KEY = "r2s-configuration";
  const cars = await getJson("/api/configurator/cars").catch(() => []);
  const fromUrl = new URLSearchParams(location.search).get("configuration");
  let stored = null;
  try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* storage may be blocked */ }
  const savedId = fromUrl || stored;
  let snapshot = null;
  let note = "";
  if (savedId) {
    snapshot = await getJson("/api/configurator/configurations/" + encodeURIComponent(savedId)).catch(() => null);
    if (!snapshot) {
      try { if (savedId === stored) localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      if (fromUrl) note = "Die Konfiguration wurde nicht gefunden, es fährt ein Standardauto. ";
    }
  }
  const standard = cars.find((car) => car.available) || cars[0] || null;
  const savedCar = snapshot ? cars.find((car) => car.id === snapshot.vehicle.id) || standard : null;
  const savedEntry = snapshot ? { car: savedCar, snapshot, sourceText: "Deine gespeicherte Konfiguration" } : null;

  const select = $("#r2s-car-select");
  if (savedEntry) select.append(new Option("Mein Auto: " + snapshot.vehicle.name, "saved"));
  for (const car of cars) select.append(new Option("Standard: " + car.name, car.id));
  select.disabled = select.options.length === 0;
  select.addEventListener("change", () => {
    if (select.value === "saved") play(savedEntry);
    else play({ car: cars.find((car) => car.id === select.value) || null, snapshot: null, sourceText: "Standardausstattung" });
  });
  $("#r2s-drive").disabled = false;
  if (savedEntry) { select.value = "saved"; play(savedEntry); }
  else { if (standard) select.value = standard.id; play({ car: standard, snapshot: null, sourceText: note + "Standardausstattung" }); }
}

if (stage) main().catch((error) => {
  console.error("[road2supercar]", error);
  const text = $("#r2s-loading-text");
  if (text) text.textContent = "Die Show konnte nicht gestartet werden.";
});
