import { useEffect, useState } from 'react';
import { api } from '../api/client';
import GlassCard from '../components/GlassCard';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = () => api.getDashboard().then(setData).catch((e) => setError(e.message));

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

  const toggleBot = async () => {
    setLoading(true);
    try {
      if (data?.running) await api.botStop();
      else await api.botStart();
      await load();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (!data) return <div className="page-title">Dashboard {error && <span className="error">{error}</span>}</div>;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Dashboard</h1>
        <div className="actions">
          <span className={`badge ${data.running ? 'running' : 'stopped'}`}>{data.running ? 'Running' : 'Stopped'}</span>
          {data.emergencyStop && <span className="badge" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>Emergency</span>}
          <button className={`btn ${data.running ? 'btn-danger' : 'btn-primary'}`} onClick={toggleBot} disabled={loading}>
            {data.running ? 'Stop' : 'Start'}
          </button>
          <button className="btn btn-danger" disabled={loading} onClick={async () => {
            setLoading(true);
            try { await api.botEmergencyStop(); await load(); } catch (e) { setError(e.message); }
            finally { setLoading(false); }
          }}>Emergency</button>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        <GlassCard title="Total Wallet">
          <div className="stat-value">{data.totalWallet.toFixed(2)} ₽</div>
        </GlassCard>
        <GlassCard title="PnL Today / Week">
          <div className="stat-value" style={{ color: data.pnlToday >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {data.pnlToday >= 0 ? '+' : ''}{data.pnlToday.toFixed(2)} ₽
          </div>
          <div className="stat-label" style={{ marginTop: 8 }}>7d: {(data.pnlWeek ?? 0).toFixed(2)} ₽</div>
        </GlassCard>
        <GlassCard title="Accounts">
          <div className="stat-value">{data.accounts.filter((a) => a.enabled).length} / {data.accounts.length}</div>
        </GlassCard>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        {data.accounts.map((acc) => (
          <GlassCard key={acc.id} title={`${acc.label} (${acc.game})`}>
            <div className="stat-label">Wallet</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{(acc.wallet_balance ?? 0).toFixed(2)} ₽</div>
            <div style={{ marginTop: 8 }}><span className="badge">{acc.status}</span></div>
          </GlassCard>
        ))}
      </div>

      <GlassCard title="Recent Trades">
        {data.recentTrades.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No trades yet. Start bot in dry-run mode.</p>
        ) : (
          <table>
            <thead><tr><th>Time</th><th>Account</th><th>Action</th><th>Item</th><th>Price</th><th>Profit</th></tr></thead>
            <tbody>
              {data.recentTrades.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.created_at).toLocaleString('ru')}</td>
                  <td>{t.account_id}</td>
                  <td>{t.action}{t.dry_run ? ' (dry)' : ''}</td>
                  <td>{t.market_hash_name || '—'}</td>
                  <td>{t.price ?? '—'}</td>
                  <td>{t.profit ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassCard>
      {error && <p className="error">{error}</p>}
    </>
  );
}
