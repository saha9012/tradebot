import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { api } from '../api/client';
import AccountSettingsModal from './AccountSettingsModal';
import AccountSettingsTrigger from './AccountSettingsTrigger';

const STATUS_RU = {
  offline: 'не в сети',
  idle: 'готов',
  needs_login: 'нужен вход',
  logging_in: 'вход…',
  trading: 'торгует',
  error: 'ошибка',
  rate_limited: 'лимит Steam',
};

export default function AccountAccordion({ account, onUpdate, expanded = false, onToggleExpand }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const statusLabel = STATUS_RU[account.status] || account.status;
  const dryRun = account.strategy?.dryRun ?? true;

  const login = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.login(account.id);
      onUpdate();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.logout(account.id);
      onUpdate();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async () => {
    await api.patchAccount(account.id, { enabled: !account.enabled });
    onUpdate();
  };

  const toggleDryRun = async () => {
    setBusy(true);
    try {
      await api.updateStrategy(account.id, { ...account.strategy, dryRun: !dryRun });
      onUpdate();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={`glass account-card rounded-2xl ${expanded ? 'account-card--open' : ''}`}>
        <div
          className="account-card-header account-card-interactive"
          data-horizon-surface
          role="button"
          tabIndex={0}
          onClick={() => onToggleExpand?.()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleExpand?.();
            }
          }}
        >
          <div className="account-card-info">
            <strong>{account.label}</strong>
            <span className="account-game-tag">{account.game.toUpperCase()}</span>
            <span className="badge">{statusLabel}</span>
            {account.sessionActive ? (
              <span className="badge running">Steam онлайн</span>
            ) : account.status !== 'offline' && account.status !== 'logging_in' ? (
              <span className="badge badge-warn">нужен вход</span>
            ) : null}
            {!account.enabled && <span className="badge badge-muted">выключен</span>}
          </div>

          <div className="account-card-tools account-card-interactive" data-horizon-surface>
            <AccountSettingsTrigger onClick={() => setSettingsOpen(true)} disabled={busy} />
            <ChevronDown
              className={`account-chevron ${expanded ? 'account-chevron--up' : ''}`}
              size={20}
              aria-hidden
            />
          </div>
        </div>

        {expanded && (
          <div className="account-card-body account-card-interactive" data-horizon-surface>
            <div className="account-quick-stats">
              <div className="account-stat">
                <span className="account-stat-label">Кошелёк</span>
                <span className="account-stat-value">{(account.wallet_balance ?? 0).toFixed(2)} ₽</span>
              </div>
              <div className="account-stat">
                <span className="account-stat-label">Режим</span>
                <span className="account-stat-value">{dryRun ? 'тест' : 'боевой'}</span>
              </div>
            </div>

            <div className="account-quick-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={login} disabled={busy}>
                Войти в Steam
              </button>
              <button type="button" className="btn btn-sm" onClick={logout} disabled={busy}>
                Выйти
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setErr('');
                  try {
                    await api.refreshWallet(account.id);
                    onUpdate();
                  } catch (e) {
                    setErr(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Обновить кошелёк
              </button>
              <button type="button" className="btn btn-sm" onClick={toggleEnabled} disabled={busy}>
                {account.enabled ? 'Отключить' : 'Включить'}
              </button>
            </div>

            <label className="account-dry-run">
              <input type="checkbox" checked={!!dryRun} onChange={toggleDryRun} disabled={busy} />
              <span>Тестовый режим — без реальных покупок</span>
            </label>

            <p className="account-strategy-hint">
              Стратегия, фильтры и лимиты — в{' '}
              <button type="button" className="link-btn" onClick={() => setSettingsOpen(true)}>
                настройках
              </button>{' '}
              (иконка справа)
            </p>

            {err && <p className="error account-card-error">{err}</p>}
            {account.last_error && (
              <p className="error account-card-error">Steam: {account.last_error}</p>
            )}
          </div>
        )}
      </div>

      <AccountSettingsModal
        account={account}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onUpdate={onUpdate}
      />
    </>
  );
}
