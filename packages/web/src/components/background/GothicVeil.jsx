/** Готика — только по краям экрана, не лезет в центр с интерфейсом. */
export default function GothicVeil() {
  return (
    <div className="gothic-veil absolute inset-0" aria-hidden>
      <svg className="gothic-veil__pillar gothic-veil__pillar--left" viewBox="0 0 48 420" fill="none">
        <path d="M24 8 L24 400 M12 24 H36 M14 380 H34" stroke="currentColor" strokeWidth="1" />
        <path d="M24 48 L16 64 L24 80 L32 64 Z" stroke="currentColor" strokeWidth="0.8" />
        <path d="M24 340 L16 356 L24 372 L32 356 Z" stroke="currentColor" strokeWidth="0.8" />
      </svg>
      <svg className="gothic-veil__pillar gothic-veil__pillar--right" viewBox="0 0 48 420" fill="none">
        <path d="M24 8 L24 400 M12 24 H36 M14 380 H34" stroke="currentColor" strokeWidth="1" />
        <path d="M24 48 L16 64 L24 80 L32 64 Z" stroke="currentColor" strokeWidth="0.8" />
        <path d="M24 340 L16 356 L24 372 L32 356 Z" stroke="currentColor" strokeWidth="0.8" />
      </svg>

      <svg className="gothic-veil__arch gothic-veil__arch--tl" viewBox="0 0 220 300" fill="none">
        <path
          d="M20 280V120c0-44 36-80 80-80h20M20 280H8M120 40v-18M120 40c18 0 34 8 44 22"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path d="M48 200h72M48 160h56M48 120h40" stroke="currentColor" strokeWidth="0.8" opacity="0.7" />
      </svg>
      <svg className="gothic-veil__arch gothic-veil__arch--tr" viewBox="0 0 220 300" fill="none">
        <path
          d="M200 280V120c0-44-36-80-80-80h-20M200 280h12M100 40v-18M100 40c-18 0-34 8-44 22"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path d="M172 200H100M116 160h56M128 120h40" stroke="currentColor" strokeWidth="0.8" opacity="0.7" />
      </svg>
      <svg className="gothic-veil__arch gothic-veil__arch--bl" viewBox="0 0 200 120" fill="none">
        <path d="M16 100 V52c0-28 24-48 52-48h64c28 0 52 20 52 48v48" stroke="currentColor" strokeWidth="1" />
        <path d="M52 72 H148 M68 56 H132" stroke="currentColor" strokeWidth="0.7" opacity="0.65" />
      </svg>
      <svg className="gothic-veil__arch gothic-veil__arch--br" viewBox="0 0 200 120" fill="none">
        <path d="M16 100 V52c0-28 24-48 52-48h64c28 0 52 20 52 48v48" stroke="currentColor" strokeWidth="1" />
        <path d="M52 72 H148 M68 56 H132" stroke="currentColor" strokeWidth="0.7" opacity="0.65" />
      </svg>

      {/* Роза — только у верхнего края, вне зоны узлов */}
      <svg className="gothic-veil__rose" viewBox="0 0 320 320" fill="none">
        <circle cx="160" cy="160" r="118" stroke="currentColor" strokeWidth="1" opacity="0.45" />
        <circle cx="160" cy="160" r="88" stroke="currentColor" strokeWidth="0.8" opacity="0.35" />
        <path
          d="M160 42 L160 278 M42 160 L278 160 M78 78 L242 242 M242 78 L78 242"
          stroke="currentColor"
          strokeWidth="0.7"
          opacity="0.3"
        />
        <path
          d="M160 58c-28 24-44 52-44 82s16 70 44 94c28-24 44-52 44-82s-16-58-44-82z"
          stroke="currentColor"
          strokeWidth="0.9"
          opacity="0.4"
        />
      </svg>
    </div>
  );
}
