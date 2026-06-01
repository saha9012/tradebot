import { useEffect, useState } from 'react';
import { api } from '../api/client';
import GlassCard from '../components/GlassCard';

export default function History() {
  const [trades, setTrades] = useState([]);

  useEffect(() => {
    api.getTrades(100).then(setTrades).catch(console.error);
  }, []);

  return (
    <>
      <h1 className="page-title">History</h1>
      <GlassCard>
        <table>
          <thead>
            <tr><th>ID</th><th>Time</th><th>Account</th><th>Game</th><th>Action</th><th>Item</th><th>Price</th><th>Profit</th><th>Dry</th></tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id}>
                <td>{t.id}</td>
                <td>{new Date(t.created_at).toLocaleString('ru')}</td>
                <td>{t.account_id}</td>
                <td>{t.game}</td>
                <td>{t.action}</td>
                <td>{t.market_hash_name || '—'}</td>
                <td>{t.price ?? '—'}</td>
                <td>{t.profit ?? '—'}</td>
                <td>{t.dry_run ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {trades.length === 0 && <p style={{ color: 'var(--text-muted)', padding: 16 }}>No trades yet.</p>}
      </GlassCard>
    </>
  );
}
