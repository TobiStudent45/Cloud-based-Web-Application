// All sound of Road to the Super Car, generated with the Web Audio API (no sound files):
//   forest bed (wind, rustling leaves, birds)  - everywhere, quieter near the show
//   show bed (crowd murmur, applause, house music with kick / hat / clap / bass / arpeggio) - louder near the plaza
//   camera shutters of the photographers, engine with gears, tyre / wind noise, horn (held), indicator tick-tock, bumps
// Browsers only start audio after a click or key press: the context is created suspended and unlocked on the
// first interaction. The sound can be switched off with the button in the corner.

export function createAudio({ podium }) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const silent = {
    supported: false, state: "unsupported", muted: false, unlock() {}, toggle() {}, update() {}, shutter() {}, horn() {}, tick() {}, bump() {}, beep() {}, jet() {}, cheer() {}, onState() {},
  };
  if (!AC || new URLSearchParams(location.search).has("nosound")) return silent;
  let ctx;
  try { ctx = new AC(); } catch { return silent; }

  const master = ctx.createGain();
  master.gain.value = 0;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -14; compressor.ratio.value = 6;
  master.connect(compressor);
  compressor.connect(ctx.destination);

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const to = (param, value, tau = 0.25) => param.setTargetAtTime(value, ctx.currentTime, tau);

  // ---------- noise sources ----------
  const noiseBuffer = (seconds, brown) => {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * white) / 1.02; data[i] = last * 3.5; } else data[i] = white;
    }
    return buffer;
  };
  const white = noiseBuffer(3, false);
  const brown = noiseBuffer(3, true);
  const looping = (buffer, ...nodes) => {
    const source = ctx.createBufferSource();
    source.buffer = buffer; source.loop = true;
    source.start(0, Math.random() * 2);
    let tail = source;
    for (const node of nodes) { tail.connect(node); tail = node; }
    return tail;
  };
  const filter = (type, frequency, q = 0.7) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = frequency; f.Q.value = q; return f; };
  const gain = (value = 0) => { const g = ctx.createGain(); g.gain.value = value; return g; };
  const lfo = (target, rate, depth) => { // slow wobble of a parameter
    const o = ctx.createOscillator(), d = ctx.createGain();
    o.frequency.value = rate; d.gain.value = depth;
    o.connect(d); d.connect(target); o.start();
  };
  const pan = (value) => { if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = value; return p; } return gain(1); };

  // ---------- forest bed ----------
  const forest = gain(0); forest.connect(master);
  const wind = gain(0.22); looping(brown, filter("lowpass", 520, 0.5), wind); wind.connect(forest);
  lfo(wind.gain, 0.11, 0.18);
  const leaves = gain(0.05); looping(white, filter("bandpass", 3400, 0.8), leaves); leaves.connect(forest);
  lfo(leaves.gain, 0.17, 0.035);
  const rush = gain(0); looping(white, filter("bandpass", 650, 0.5), rush); rush.connect(master); // air rushing past the car
  const birds = gain(0); birds.connect(master);
  function chirp() {
    const out = pan(rand(-0.9, 0.9));
    out.connect(birds);
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = rand(2300, 4200);
    for (let i = 0; i < notes; i++) {
      const t = ctx.currentTime + i * rand(0.07, 0.11);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(base * rand(0.9, 1.15), t);
      o.frequency.exponentialRampToValueAtTime(base * rand(1.2, 1.7), t + 0.07);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.1);
    }
  }
  let birdTimer = 0;

  // ---------- show bed: crowd, applause, music ----------
  const crowd = gain(0); crowd.connect(master);
  const murmurA = gain(0.5); looping(brown, filter("bandpass", 420, 0.6), murmurA); murmurA.connect(crowd);
  const murmurB = gain(0.25); looping(white, filter("bandpass", 1500, 0.5), murmurB); murmurB.connect(crowd);
  lfo(murmurA.gain, 0.23, 0.15); lfo(murmurB.gain, 0.31, 0.1);
  function applause(seconds = 1.8, level = 0.5) {
    const out = gain(0); out.connect(crowd);
    const t = ctx.currentTime;
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(level, t + 0.25); out.gain.linearRampToValueAtTime(0, t + seconds);
    const f = filter("highpass", 1400, 0.6); f.connect(out);
    for (let i = 0; i < seconds * 34; i++) { // many short claps
      const s = ctx.createBufferSource();
      s.buffer = white;
      const g = gain(0); s.connect(g); g.connect(f);
      const at = t + Math.random() * seconds;
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(rand(0.3, 1), at + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, at + rand(0.02, 0.05));
      s.start(at, Math.random() * 2, 0.06);
    }
  }
  function cheer() {
    const t = ctx.currentTime;
    const f = filter("bandpass", 700, 1.4), g = gain(0), s = ctx.createBufferSource();
    s.buffer = brown; s.loop = true; s.connect(f); f.connect(g); g.connect(crowd);
    f.frequency.setValueAtTime(600, t); f.frequency.linearRampToValueAtTime(1300, t + 0.5); f.frequency.linearRampToValueAtTime(800, t + 1.4);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.4, t + 0.3); g.gain.linearRampToValueAtTime(0, t + 1.5);
    s.start(t); s.stop(t + 1.6);
    applause(2.2, 0.5);
  }

  const music = gain(0); music.connect(master);
  const musicFilter = filter("lowpass", 700, 0.7); musicFilter.connect(music);
  const BPM = 118, STEP = 60 / BPM / 4;
  const BASS = [55, 0, 55, 55, 0, 65.4, 0, 49, 55, 0, 55, 55, 0, 73.4, 0, 65.4];
  const ARP = [440, 523.3, 659.3, 523.3, 392, 493.9, 587.3, 493.9];
  const env = (g, t, a, d, peak) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const noiseHit = (t, hp, duration, peak) => {
    const s = ctx.createBufferSource(), f = filter("highpass", hp, 0.7), g = gain(0);
    s.buffer = white; s.connect(f); f.connect(g); g.connect(musicFilter);
    env(g, t, 0.002, duration, peak);
    s.start(t, Math.random() * 2, duration + 0.02);
  };
  function playStep(step, t) {
    if (step % 4 === 0) { // kick
      const o = ctx.createOscillator(), g = gain(0);
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      o.connect(g); g.connect(musicFilter); env(g, t, 0.003, 0.22, 1); o.start(t); o.stop(t + 0.3);
    }
    if (step % 4 === 2) noiseHit(t, 7000, 0.09, 0.22); // open hat on the off beat
    else if (step % 2 === 1) noiseHit(t, 9000, 0.03, 0.08);
    if (step === 4 || step === 12) noiseHit(t, 1100, 0.12, 0.3); // clap
    const note = BASS[step];
    if (note) {
      const o = ctx.createOscillator(), f = filter("lowpass", 260, 1.5), g = gain(0);
      o.type = "sawtooth"; o.frequency.value = note;
      o.connect(f); f.connect(g); g.connect(musicFilter); env(g, t, 0.01, 0.17, 0.5); o.start(t); o.stop(t + 0.3);
    }
    if (step % 2 === 0) { // arpeggio
      const o = ctx.createOscillator(), f = filter("lowpass", 2200, 1), g = gain(0);
      o.type = "square"; o.frequency.value = ARP[(step / 2) % ARP.length];
      o.connect(f); f.connect(g); g.connect(musicFilter); env(g, t, 0.005, 0.12, 0.06); o.start(t); o.stop(t + 0.2);
    }
  }
  let step = 0, stepTime = 0, musicLevel = 0;
  setInterval(() => {
    if (ctx.state !== "running" || musicLevel < 0.02) { stepTime = Math.max(stepTime, ctx.currentTime); return; }
    while (stepTime < ctx.currentTime + 0.3) { playStep(step, stepTime); stepTime += STEP; step = (step + 1) % 16; }
  }, 90);

  // ---------- engine ----------
  const engine = gain(0); engine.connect(master);
  const engineFilter = filter("lowpass", 900, 0.8); engineFilter.connect(engine);
  const oscA = ctx.createOscillator(), oscB = ctx.createOscillator(), oscC = ctx.createOscillator();
  oscA.type = "sawtooth"; oscB.type = "square"; oscC.type = "sine";
  const gA = gain(0.5), gB = gain(0.22), gC = gain(0.5);
  oscA.connect(gA); oscB.connect(gB); oscC.connect(gC); gA.connect(engineFilter); gB.connect(engineFilter); gC.connect(engineFilter);
  oscA.start(); oscB.start(); oscC.start();
  const rumble = gain(0.25); looping(brown, filter("lowpass", 300, 0.7), rumble); rumble.connect(engineFilter);
  const tyres = gain(0); looping(white, filter("bandpass", 950, 0.9), tyres); tyres.connect(master);
  const GEARS = [0, 11, 20, 30, 41, 54, 90];
  let rpmNow = 900;
  function setEngine({ active, speed, throttle, boost, distance }) {
    const v = Math.abs(speed);
    let g = 0;
    while (g < GEARS.length - 2 && v > GEARS[g + 1]) g++;
    const frac = clamp((v - GEARS[g]) / (GEARS[g + 1] - GEARS[g]));
    const target = 950 + frac * 5600 * (0.6 + 0.4 * throttle) + throttle * 500 + (g === 0 ? 0 : 400);
    rpmNow += (target - rpmNow) * 0.25;
    const fundamental = (rpmNow / 60) * 3;
    to(oscA.frequency, fundamental, 0.04); to(oscB.frequency, fundamental * 0.5, 0.04); to(oscC.frequency, fundamental * 0.5, 0.05);
    to(engineFilter.frequency, 420 + throttle * 900 + frac * 700 + (boost ? 900 : 0), 0.08);
    const near = 1 / (1 + Math.max(0, distance - 6) / 16);
    to(engine.gain, active ? (0.06 + throttle * 0.08 + (boost ? 0.06 : 0)) * near : 0, 0.15);
    to(tyres.gain, active ? clamp(v / 50) * 0.05 * near : 0, 0.2);
  }

  // ---------- one-shot sounds ----------
  let horn = null;
  function hornStart() {
    if (horn || ctx.state !== "running") return;
    const out = gain(0), f = filter("bandpass", 950, 0.7), t = ctx.currentTime;
    const oscs = [415, 523, 830].map((freq, i) => {
      const o = ctx.createOscillator(), g = gain(i === 2 ? 0.12 : 0.5);
      o.type = i === 2 ? "square" : "sawtooth"; o.frequency.value = freq * (1 + (i === 1 ? 0.002 : 0));
      o.connect(g); g.connect(f); o.start(t);
      return o;
    });
    f.connect(out); out.connect(master);
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.42, t + 0.015);
    horn = { out, oscs };
  }
  function hornStop() {
    if (!horn) return;
    const { out, oscs } = horn;
    horn = null;
    const t = ctx.currentTime;
    out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(0, t + 0.07);
    for (const o of oscs) o.stop(t + 0.09);
  }
  function tick(high) {
    if (ctx.state !== "running") return;
    const t = ctx.currentTime, o = ctx.createOscillator(), g = gain(0);
    o.type = "square"; o.frequency.value = high ? 2100 : 1500;
    o.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
    o.start(t); o.stop(t + 0.04);
  }
  function shutter(distance, side = 0) {
    if (ctx.state !== "running") return;
    const level = 0.5 / (1 + distance / 9);
    if (level < 0.02) return;
    const t = ctx.currentTime, p = pan(clamp(side, -1, 1)), out = gain(level);
    p.connect(out); out.connect(master);
    for (const [at, hp, d] of [[0, 2600, 0.025], [0.05, 1400, 0.04]]) {
      const s = ctx.createBufferSource(), f = filter("bandpass", hp, 1.1), g = gain(0);
      s.buffer = white; s.connect(f); f.connect(g); g.connect(p);
      g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(1, t + at + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + at + d);
      s.start(t + at, Math.random() * 2, d + 0.02);
    }
  }
  function beep(distance, long = false) { // another car honks
    if (ctx.state !== "running") return;
    const level = 0.35 / (1 + distance / 12);
    if (level < 0.01) return;
    const t = ctx.currentTime, out = gain(0), f = filter("bandpass", 900, 0.8);
    for (const freq of [392, 494]) { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = freq; o.connect(f); o.start(t); o.stop(t + (long ? 0.7 : 0.3)); }
    f.connect(out); out.connect(master);
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(level, t + 0.02); out.gain.setValueAtTime(level, t + (long ? 0.6 : 0.22)); out.gain.linearRampToValueAtTime(0, t + (long ? 0.7 : 0.3));
  }
  function bump(strength) {
    if (ctx.state !== "running") return;
    const t = ctx.currentTime, o = ctx.createOscillator(), g = gain(0), f = filter("lowpass", 320, 0.8);
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    o.connect(f); f.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * clamp(strength, 0.2, 1), t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.start(t); o.stop(t + 0.35);
  }

  function jet() { // air jets: rising hiss and a low thrust
    if (ctx.state !== "running") return;
    const t = ctx.currentTime, s = ctx.createBufferSource(), f = filter("bandpass", 600, 0.9), g = gain(0);
    s.buffer = white; s.connect(f); f.connect(g); g.connect(master);
    f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.7);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    s.start(t, Math.random() * 1.5, 1.2);
    const o = ctx.createOscillator(), og = gain(0), lp = filter("lowpass", 240, 0.8);
    o.type = "sawtooth"; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.6);
    o.connect(lp); lp.connect(og); og.connect(master);
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.25, t + 0.1); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.start(t); o.stop(t + 1);
  }

  // ---------- control ----------
  let muted = false;
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn(api.state, muted));
  const applyMaster = () => to(master.gain, muted || document.hidden || ctx.state !== "running" ? 0 : 0.05, 0.2); // quiet: this is a background to the picture
  ctx.onstatechange = () => { applyMaster(); notify(); };
  document.addEventListener("visibilitychange", applyMaster);
  let nextCheer = 0;

  const api = {
    supported: true,
    get state() { return ctx.state; },
    get muted() { return muted; },
    onState(fn) { listeners.add(fn); fn(api.state, muted); },
    unlock() { if (ctx.state === "suspended") ctx.resume().then(applyMaster).catch(() => {}); },
    toggle() { api.unlock(); muted = !muted; applyMaster(); notify(); },
    shutter, tick, cheer, bump, beep, jet,
    horn(down) { if (down) hornStart(); else hornStop(); },
    // called every frame: where the listener (camera) and the car are, what the car does
    update({ camera, car, speed = 0, throttle = 0, boost = false, engineOn = false, dt = 0.016 }) {
      const dx = camera.x - podium.x, dz = camera.z - podium.z;
      const distance0 = Math.hypot(dx, dz);
      const near = smooth(1 - distance0 / 110);                 // 1 on the plaza, 0 far away
      const woods = smooth((distance0 - 45) / 50);              // 0 at the show, 1 in the forest
      const high = smooth((camera.y - 8) / 120);                // up in the sky: more wind
      const v = Math.abs(speed);
      musicLevel = near;
      to(forest.gain, (0.2 + high * 0.12) * woods, 0.5);
      to(birds.gain, woods * (1 - high) * 0.55, 0.6);
      to(rush.gain, Math.pow(clamp(v / 60), 1.6) * 0.06, 0.2);
      to(crowd.gain, near * 0.3, 0.6);
      to(music.gain, near * 0.22, 0.6);
      to(musicFilter.frequency, 420 + near * near * 6000, 0.5);
      birdTimer -= dt;
      if (birdTimer <= 0) { birdTimer = rand(0.9, 3.2); if (woods * (1 - high) > 0.3 && ctx.state === "running") chirp(); }
      nextCheer -= dt;
      if (nextCheer <= 0) { nextCheer = rand(7, 14); if (near > 0.6 && ctx.state === "running") applause(rand(1.2, 2.2), 0.35); }
      const distance = Math.hypot(camera.x - car.x, camera.y - car.y, camera.z - car.z);
      setEngine({ active: engineOn, speed, throttle, boost, distance });
    },
  };
  return api;
}
