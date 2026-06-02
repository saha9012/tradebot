const ITEMS = [
  'Steam Market',
  'Dota 2',
  'Dry Run',
  'Скан лотов',
  'Community Market',
  'Flare UI',
];

export default function StatusMarquee() {
  const items = [...ITEMS, ...ITEMS];

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-white/5 py-3 glass">
      <div className="flex animate-marquee whitespace-nowrap">
        {items.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="mx-6 font-display text-sm font-bold uppercase tracking-wider text-white/25 md:text-base"
          >
            {item}
            <span className="mx-6 text-cyan-400/50">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}
