export const NODE_DRIFT_RADIUS = 25;

function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function createDriftSeed(id) {
  const h = hashId(id);
  return {
    a: (h % 360) * (Math.PI / 180),
    b: ((h >> 3) % 360) * (Math.PI / 180),
    c: ((h >> 5) % 360) * (Math.PI / 180),
    f1: 0.11 + (h % 7) * 0.015,
    f2: 0.08 + (h % 5) * 0.012,
    f3: 0.13 + (h % 6) * 0.014,
    f4: 0.09 + (h % 4) * 0.011,
  };
}

export function driftOffset(seed, timeSec) {
  const x =
    Math.sin(timeSec * seed.f1 + seed.a) * NODE_DRIFT_RADIUS * 0.55 +
    Math.sin(timeSec * seed.f2 + seed.b) * NODE_DRIFT_RADIUS * 0.45;
  const y =
    Math.cos(timeSec * seed.f3 + seed.c) * NODE_DRIFT_RADIUS * 0.55 +
    Math.cos(timeSec * seed.f4 + seed.b) * NODE_DRIFT_RADIUS * 0.45;
  const mag = Math.hypot(x, y);
  if (mag <= NODE_DRIFT_RADIUS) return { x, y };
  const k = NODE_DRIFT_RADIUS / mag;
  return { x: x * k, y: y * k };
}
