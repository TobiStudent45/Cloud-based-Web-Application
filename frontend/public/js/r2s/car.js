// The player's car: loading the GLB from the configurator service, applying the saved configuration, making it cheap to
// draw (merged parts, no glass transmission), spinning wheels, indicator / brake / head lights, placeholder car.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { glowTexture, blobMaterial } from "./assets.js";

export const CAR_LENGTH = 4.9; // metres, every model is scaled to this length
// Wheel nodes of the models (they spin, and front/rear wheels give the driving direction).
const WHEEL_NODES = { lambo: /^Wheel_(FL|FR|RL|RR)$/, urus: /^3DWheel[ _](Front|Rear)[ _][LR]$/ }; // three.js turns spaces in node names into underscores

export async function createCarFactory() {
  const loader = new GLTFLoader();
  try {
    const { DRACOLoader } = await import("three/addons/loaders/DRACOLoader.js");
    const draco = new DRACOLoader();
    draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
    loader.setDRACOLoader(draco);
  } catch { /* optional */ }
  try {
    const { MeshoptDecoder } = await import("three/addons/libs/meshopt_decoder.module.js");
    loader.setMeshoptDecoder(MeshoptDecoder);
  } catch { /* optional */ }
  const models = new Map(); // car id -> Promise<gltf>

  function loadModel(car, onProgress) {
    if (!models.has(car.id)) {
      const promise = new Promise((resolve, reject) => {
        loader.load(car.modelUrl, resolve, (event) => onProgress?.(event.lengthComputable ? event.loaded / event.total : null), reject);
      });
      promise.catch(() => models.delete(car.id));
      models.set(car.id, promise);
    }
    return models.get(car.id);
  }

  // own copies of the materials (shared ones stay shared), configuration applied, glass made cheap
  function applyConfiguration(model, snapshot) {
    const copies = new Map();
    const copyOf = (material) => {
      if (!copies.has(material)) copies.set(material, material.clone());
      return copies.get(material);
    };
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.material = Array.isArray(object.material) ? object.material.map(copyOf) : copyOf(object.material);
    });
    const byName = new Map();
    for (const material of copies.values()) {
      if (!byName.has(material.name)) byName.set(material.name, []);
      byName.get(material.name).push(material);
      for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"]) if (material[key]) material[key].anisotropy = 16; // sharp textures at a slant
      if (material.transmission > 0) { // transmission renders the whole scene a second time: use plain transparency
        material.transmission = 0;
        material.transparent = true;
        material.opacity = Math.min(material.opacity, 0.35);
        material.depthWrite = false;
      }
    }
    for (const selection of snapshot?.selections || []) {
      const values = selection.values || {};
      for (const name of selection.materialNames || []) {
        for (const material of byName.get(name) || []) {
          if (values.baseColor !== undefined) material.color.set(values.baseColor);
          if (values.removeBaseColorTexture) material.map = null;
          if (values.metallic !== undefined) material.metalness = values.metallic;
          if (values.roughness !== undefined) material.roughness = values.roughness;
          if (values.clearcoat !== undefined && "clearcoat" in material) material.clearcoat = values.clearcoat;
          if (values.clearcoatRoughness !== undefined && "clearcoatRoughness" in material) material.clearcoatRoughness = values.clearcoatRoughness;
          material.needsUpdate = true;
        }
      }
    }
  }

  // Wheels get a pivot in their centre so they can spin; front/rear wheels give the driving direction.
  function setupWheels(model, carId) {
    const pattern = WHEEL_NODES[carId];
    const wheels = [];
    if (!pattern) return { wheels, forward: null };
    model.updateMatrixWorld(true);
    const nodes = [];
    model.traverse((o) => { if (pattern.test(o.name)) nodes.push(o); });
    const front = new THREE.Vector3(), rear = new THREE.Vector3();
    let nFront = 0, nRear = 0;
    for (const node of nodes) {
      const box = new THREE.Box3().setFromObject(node);
      if (box.isEmpty()) continue;
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const axis = size.x <= size.y && size.x <= size.z ? "x" : size.y <= size.z ? "y" : "z";
      const others = ["x", "y", "z"].filter((a) => a !== axis).map((a) => size[a]);
      const pivot = new THREE.Group();
      model.add(pivot);
      pivot.position.copy(model.worldToLocal(center.clone()));
      pivot.updateMatrixWorld(true);
      pivot.attach(node);
      wheels.push({ pivot, axis, radius: Math.max(...others) / 2 });
      if (/(F[LR]$|Front)/i.test(node.name)) { front.add(center); nFront++; } else { rear.add(center); nRear++; }
    }
    let forward = null;
    if (nFront && nRear) forward = front.divideScalar(nFront).sub(rear.divideScalar(nRear)).setY(0).normalize();
    return { wheels, forward };
  }

  // merge the ~500 static parts into a few draw calls (one per material)
  function mergeStatic(model, wheelPivots) {
    model.updateMatrixWorld(true);
    const groups = new Map();
    const remove = [];
    const inWheel = (object) => { for (let o = object; o; o = o.parent) if (wheelPivots.includes(o)) return true; return false; };
    model.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh || Array.isArray(o.material) || !o.geometry.index || inWheel(o)) return;
      const geometry = o.geometry.clone();
      geometry.applyMatrix4(o.matrixWorld);
      if (o.matrixWorld.determinant() < 0) { // mirrored parts: keep the triangle winding
        const index = geometry.index.array;
        for (let i = 0; i < index.length; i += 3) { const t = index[i + 1]; index[i + 1] = index[i + 2]; index[i + 2] = t; }
      }
      const signature = Object.keys(geometry.attributes).sort().map((k) => k + geometry.attributes[k].itemSize).join(",");
      const key = o.material.uuid + signature;
      if (!groups.has(key)) groups.set(key, { material: o.material, geometries: [] });
      groups.get(key).geometries.push(geometry);
      remove.push(o);
    });
    for (const o of remove) o.parent?.remove(o);
    for (const { material, geometries } of groups.values()) {
      const merged = geometries.length > 1 ? mergeGeometries(geometries, false) : geometries[0];
      if (merged) model.add(new THREE.Mesh(merged, material));
    }
  }

  // Simple placeholder car (front towards -z), used when the 3D file is missing.
  function placeholderCar(color) {
    const group = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({ color: "#161a20", roughness: 0.1, metalness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.6), paint); body.position.y = 0.6;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2.1), glass); cabin.position.set(0, 1.1, 0.2);
    group.add(body, cabin);
    const wheels = [];
    for (const [x, z] of [[-0.95, -1.5], [0.95, -1.5], [-0.95, 1.5], [0.95, 1.5]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.4, z);
      pivot.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 18).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#15171b" })));
      group.add(pivot);
      wheels.push({ pivot, axis: "x", radius: 0.4, sign: -1 });
    }
    return { object: group, wheels };
  }

  // wrapper that places the model: length CAR_LENGTH, centred, on the ground, front towards -z
  function prepareCar(car, snapshot, gltf) {
    const model = gltf.scene.clone(true);
    applyConfiguration(model, snapshot);
    const { wheels, forward } = setupWheels(model, car.id);
    mergeStatic(model, wheels.map((w) => w.pivot));
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = CAR_LENGTH / Math.max(size.x, size.z);
    model.scale.multiplyScalar(scale);
    const scaled = new THREE.Box3().setFromObject(model);
    const center = scaled.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -scaled.min.y, -center.z);
    const inner = new THREE.Group();
    inner.add(model);
    // turn the model so that its front (from the wheels, else the longer axis) points towards -z
    inner.rotation.y = forward ? Math.PI - Math.atan2(forward.x, forward.z) : size.x > size.z ? Math.PI / 2 : Math.PI;
    for (const wheel of wheels) {
      const axisVector = new THREE.Vector3(wheel.axis === "x" ? 1 : 0, wheel.axis === "y" ? 1 : 0, wheel.axis === "z" ? 1 : 0).applyQuaternion(inner.quaternion);
      wheel.sign = axisVector.x > 0 ? -1 : 1; // rolling forward (-z) turns the wheel about -x
      wheel.radius *= scale;
    }
    return { object: inner, wheels };
  }

  return { loadModel, prepareCar, placeholderCar };
}

// ---------- the car's lights: glow sprites (indicators, brake lights, headlights) and a soft shadow ----------
export function createCarLights() {
  const group = new THREE.Group();
  const sprite = (color, x, y, z, size) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.set(x, y, z);
    s.scale.setScalar(size);
    group.add(s);
    return s;
  };
  const front = { left: [sprite("#ff9a1f", -0.82, 0.62, -2.3, 0.7)], right: [sprite("#ff9a1f", 0.82, 0.62, -2.3, 0.7)] };
  const rear = { left: [sprite("#ff9a1f", -0.85, 0.82, 2.3, 0.7)], right: [sprite("#ff9a1f", 0.85, 0.82, 2.3, 0.7)] };
  const brake = [sprite("#ff1020", -0.55, 0.8, 2.32, 0.6), sprite("#ff1020", 0.55, 0.8, 2.32, 0.6)];
  const head = [sprite("#fff4d0", -0.6, 0.66, -2.34, 1.0), sprite("#fff4d0", 0.6, 0.66, -2.34, 1.0)];
  const beamMaterial = new THREE.MeshBasicMaterial({ color: "#fff4d0", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beams = [-0.6, 0.6].map((x) => {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(2.6, 22, 20, 1, true).translate(0, -11, 0).rotateX(Math.PI / 2 - 0.04), beamMaterial);
    beam.position.set(x, 0.66, -2.4);
    group.add(beam);
    return beam;
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 3.4).rotateX(-Math.PI / 2), blobMaterial);
  shadow.position.y = 0.04;
  group.add(shadow);

  return {
    group,
    // state: { left, right, hazard, brake, lights }; t = clock for blinking
    update(state, t) {
      const blink = Math.sin(t * Math.PI * 3) > 0; // about 1.5 flashes per second
      const left = (state.left || state.hazard) && blink, right = (state.right || state.hazard) && blink;
      const show = (list, opacity) => { for (const s of list) { s.material.opacity = opacity; s.visible = opacity > 0; } }; // what is off is not drawn at all
      show([...front.left, ...rear.left], left ? 1 : 0);
      show([...front.right, ...rear.right], right ? 1 : 0);
      show(brake, state.brake ? 1 : state.lights ? 0.45 : 0);
      show(head, state.lights ? 1 : 0);
      beamMaterial.opacity = state.lights ? 0.1 : 0;
      for (const b of beams) b.visible = state.lights;
    },
  };
}
