export default function FieldLabel({ label, hint, children }) {
  return (
    <label className="field-label">
      <span className="field-label-row">
        <span>{label}</span>
        {hint && (
          <span className="hint-icon" tabIndex={0} aria-label={hint}>
            ?
            <span className="hint-tooltip" role="tooltip">{hint}</span>
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
