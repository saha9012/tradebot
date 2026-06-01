import { useState } from 'react';
import { api } from '../api/client';

const FIELDS = [
  { key: 'feePercent', label: 'Fee %', type: 'number' },
  { key: 'minProfitAbsolute', label: 'Min profit ₽', type: 'number', step: '0.01' },
  { key: 'maxProfitPercent', label: 'Max profit % (scam)', type: 'number' },
  { key: 'maxProfitPercentHighTier', label: 'Max profit % (200-500₽)', type: 'number' },
  { key: 'maxItemPrice', label: 'Max item price ₽', type: 'number' },
  { key: 'minLiquidity', label: 'Min sales/day', type: 'number' },
  { key: 'undercutStep', label: 'Undercut step ₽', type: 'number', step: '0.01' },
  { key: 'balanceThreshold', label: 'Balance threshold ₽', type: 'number' },
  { key: 'maxSpendPerDay', label: 'Max spend / day ₽', type: 'number' },
  { key: 'maxBuyOrders', label: 'Max buy orders / tick', type: 'number' },
  { key: 'relistMorning', label: 'Relist morning', type: 'time' },
  { key: 'relistAfternoon', label: 'Relist afternoon', type: 'time' },
  { key: 'relistEvening', label: 'Relist evening', type: 'time' },
];

export default function AccountAccordion({ account, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(account.strategy || {});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true); setErr('');
    try {
      await api.updateStrategy(account.id, config);
      setMsg('Saved');
      onUpdate();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); setTimeout(() => setMsg(''), 2000); }
  };

  const login = async () => {
    setBusy(true); setErr('');
    try { await api.login(account.id); onUpdate(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    setBusy(true);
    try { await api.logout(account.id); onUpdate(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const toggleEnabled = async () => {
    await api.patchAccount(account.id, { enabled: !account.enabled });
    onUpdate();
  };

  return (
    <div className="glass accordion">
      <div className="accordion-header" onClick={() => setOpen(!open)}>
        <div>
          <strong>{account.label}</strong>
          <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{account.game.toUpperCase()}</span>
          <span className="badge" style={{ marginLeft: 8 }}>{account.status}</span>
        </div>
        <span>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="accordion-body">
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            <span>Wallet: {(account.wallet_balance ?? 0).toFixed(2)} ₽</span>
            <span>Env: {account.credentials_env}_*</span>
          </div>
          <div className="actions">
            <button className="btn btn-primary" onClick={login} disabled={busy}>Login</button>
            <button className="btn" onClick={logout} disabled={busy}>Logout</button>
            <button className="btn" disabled={busy} onClick={async () => {
              setBusy(true);
              try { await api.refreshWallet(account.id); onUpdate(); } catch (e) { setErr(e.message); }
              finally { setBusy(false); }
            }}>Refresh wallet</button>
            <button className="btn" onClick={toggleEnabled}>{account.enabled ? 'Disable' : 'Enable'}</button>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={!!config.dryRun} onChange={(e) => setConfig({ ...config, dryRun: e.target.checked })} />
              Dry run
            </label>
          </div>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input
                  type={f.type}
                  step={f.step}
                  value={config[f.key] ?? ''}
                  onChange={(e) => setConfig({ ...config, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })}
                />
              </label>
            ))}
          </div>
          <div className="actions">
            <button className="btn btn-primary" onClick={save} disabled={busy}>Save strategy</button>
            {msg && <span style={{ color: 'var(--success)' }}>{msg}</span>}
          </div>
          {err && <p className="error">{err}</p>}
          {account.last_error && <p className="error">Last error: {account.last_error}</p>}
        </div>
      )}
    </div>
  );
}
