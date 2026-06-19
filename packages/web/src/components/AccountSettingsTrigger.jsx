/** Перевёрнутый крест — настройки стратегии */
export default function AccountSettingsTrigger({ onClick, disabled }) {
  return (
    <button
      type="button"
      className="account-settings-trigger"
      onClick={onClick}
      disabled={disabled}
      aria-label="Настройки аккаунта"
      title="Настройки стратегии"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="account-settings-cross">
        <path
          d="M12 3v18M8 7h8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
