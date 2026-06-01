import { useEffect, useState } from 'react';
import { api } from '../api/client';
import GlassCard from '../components/GlassCard';
import AccountAccordion from '../components/AccountAccordion';

export default function Settings() {
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState('');

  const load = () => api.getAccounts().then(setAccounts).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        Steam credentials via .env (ACCOUNT_1_USERNAME, ACCOUNT_1_PASSWORD, ACCOUNT_1_SHARED_SECRET).
      </p>
      {accounts.map((acc) => (
        <AccountAccordion key={acc.id} account={acc} onUpdate={load} />
      ))}
      {error && <p className="error">{error}</p>}
    </>
  );
}
