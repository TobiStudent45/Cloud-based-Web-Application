// Shared textures and materials (soft shadow blob, camera flash, cached colour materials).

import * as THREE from "three";

function radialTexture(size, stops) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const radial = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) radial.addColorStop(at, color);
  g.fillStyle = radial;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export const blobTexture = radialTexture(128, [[0, "rgba(0,0,0,.75)"], [0.55, "rgba(0,0,0,.35)"], [1, "rgba(0,0,0,0)"]]);
export const flashTexture = radialTexture(64, [[0, "rgba(255,255,255,1)"], [0.25, "rgba(255,250,235,.8)"], [1, "rgba(255,250,235,0)"]]);
export const glowTexture = radialTexture(64, [[0, "rgba(255,255,255,1)"], [0.35, "rgba(255,255,255,.55)"], [1, "rgba(255,255,255,0)"]]);

export const blobMaterial = new THREE.MeshBasicMaterial({ map: blobTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16 });

const cache = new Map();
export const lambert = (color) => {
  if (!cache.has(color)) cache.set(color, new THREE.MeshLambertMaterial({ color }));
  return cache.get(color);
};
export const standard = (color, roughness = 0.6, metalness = 0.1) => {
  const key = `s${color}${roughness}${metalness}`;
  if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  return cache.get(key);
};
export const basic = (color) => {
  const key = `b${color}`;
  if (!cache.has(key)) cache.set(key, new THREE.MeshBasicMaterial({ color }));
  return cache.get(key);
};
