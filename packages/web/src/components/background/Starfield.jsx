import { useMemo } from 'react';
import { buildStarField } from './buildStars';

export default function Starfield() {
  const stars = useMemo(() => buildStarField(220), []);

  return (
    <div className="starfield absolute inset-0" aria-hidden>
      {stars.map((star) => (
        <span
          key={star.id}
          className={`star star--${star.tier} star--${star.tint}`}
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            ...(star.tier === 'dust' ? { opacity: star.opacity } : {}),
            animationDelay: `${star.delay}s`,
            animationDuration: `${star.duration}s`,
            '--star-base': star.opacity,
          }}
        />
      ))}
    </div>
  );
}
