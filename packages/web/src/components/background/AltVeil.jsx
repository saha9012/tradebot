/**
 * Альтушка — тёмная, по периферии: наклейки, цепи, кресты, надписи.
 * Не в центре экрана, чтобы не мешать horizon.
 */
export default function AltVeil() {
  return (
    <div className="alt-veil absolute inset-0" aria-hidden>
      <p className="alt-veil__rune alt-veil__rune--left font-gothic">lux · tenebris</p>
      <p className="alt-veil__rune alt-veil__rune--right font-gothic">mercari · fatum</p>

      <div className="alt-veil__sticker alt-veil__sticker--bl">
        <span className="alt-veil__sticker-icon">†</span>
        <span className="alt-veil__sticker-text">no gods</span>
      </div>
      <div className="alt-veil__sticker alt-veil__sticker--br">
        <span className="alt-veil__sticker-icon">✦</span>
        <span className="alt-veil__sticker-text">only market</span>
      </div>

      <div className="alt-veil__chain" />

      <div className="alt-veil__footer">
        <span className="alt-veil__glyph">♱</span>
        <p className="alt-veil__tagline font-display">торг · судьба · тень</p>
        <span className="alt-veil__glyph">⟡</span>
      </div>

      <p className="alt-veil__motto font-gothic">memento mercari</p>
    </div>
  );
}
