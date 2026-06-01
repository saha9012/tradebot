import { useEffect, useState } from 'react';
import { api } from '../api/client';
import GlassCard from '../components/GlassCard';

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [accountId, setAccountId] = useState('');

  const load = () => {
    const params = accountId ? { accountId, limit: 200 } : { limit: 200 };
    api.getLogs(params).then(setLogs).catch(console.error);
  };

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [accountId]);

  return (
    <>
      <h1 className="page-title">Logs</h1>
      <div className="actions" style={{ marginBottom: 16 }}>
        <label>
          Filter account
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="">All</option>
            <option value="account-1">account-1</option>
            <option value="account-2">account-2</option>
            <option value="account-3">account-3</option>
          </select>
        </label>
        <button className="btn" onClick={load}>Refresh</button>
      </div>
      <GlassCard>
        <table>
          <thead>
            <tr><th>Time</th><th>Account</th><th>Level</th><th>Action</th><th>Message</th></tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.created_at).toLocaleString('ru')}</td>
                <td>{l.account_id || '—'}</td>
                <td>{l.level}</td>
                <td>{l.action}</td>
                <td>{l.message || (l.meta ? JSON.stringify(l.meta) : '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <p style={{ color: 'var(--text-muted)', padding: 16 }}>No logs yet.</p>}
      </GlassCard>
    </>
  );
}
