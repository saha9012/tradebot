/** Детерминированные «звёзды» для фона — стабильны между рендерами. */
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildStarField(count = 220, seed = 0x0b57) {
  const rand = mulberry32(seed);
  const stars = [];

  for (let i = 0; i < count; i += 1) {
    const roll = rand();
    let tier = 'dust';
    if (roll > 0.88) tier = 'glint';
    else if (roll > 0.62) tier = 'star';

    const tintRoll = rand();
    let tint = 'white';
    if (tintRoll > 0.82) tint = 'cyan';
    else if (tintRoll > 0.64) tint = 'violet';

    stars.push({
      id: i,
      x: rand() * 100,
      y: rand() * 100,
      tier,
      tint,
      size: tier === 'glint' ? 2.5 + rand() * 2 : tier === 'star' ? 1.5 + rand() * 1.2 : 1 + rand() * 0.8,
      opacity: tier === 'glint' ? 0.7 + rand() * 0.3 : tier === 'star' ? 0.45 + rand() * 0.4 : 0.22 + rand() * 0.28,
      delay: rand() * 8,
      duration: 2.8 + rand() * 4.5,
    });
  }

  return stars;
}
