export default function GlassCard({ title, children, className = '' }) {
  return (
    <div className={`glass ${className}`}>
      {title && <h3 style={{ marginBottom: 12, fontSize: '0.9rem', color: 'var(--text-muted)' }}>{title}</h3>}
      {children}
    </div>
  );
}
