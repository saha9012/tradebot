const ITEMS = [
  { text: 'no gods · only market', tone: 'cyan' },
  { text: 'торг · судьба · тень', tone: 'lime' },
  { text: 'pretty when i profit', tone: 'ghost' },
  { text: 'void girlfriend mode', tone: 'fuchsia' },
  { text: '3am scan era', tone: 'ghost' },
  { text: 'soft grunge bot', tone: 'cyan' },
  { text: 'main char liquidity', tone: 'fuchsia' },
  { text: 'lace · chains · deals', tone: 'lime' },
  { text: 'delulu profits', tone: 'ghost' },
  { text: 'memento mercari', tone: 'cyan' },
];

function MarqueeItem({ text, tone }) {
  return (
    <span className={`alt-marquee__item alt-marquee__item--${tone}`}>
      {text}
      <span className="alt-marquee__sep" aria-hidden>
        ♱
      </span>
    </span>
  );
}

export default function StatusMarquee() {
  const items = [...ITEMS, ...ITEMS];

  return (
    <div data-horizon-surface className="alt-marquee mb-6">
      <div className="alt-marquee__inner animate-marquee-alt">
        {items.map((item, i) => (
          <MarqueeItem key={`${item.text}-${i}`} text={item.text} tone={item.tone} />
        ))}
      </div>
    </div>
  );
}
