import { useEffect, useState } from 'react';
import { api } from '../api/client';
import AccountAccordion from '../components/AccountAccordion';

export default function Settings() {
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState('');

  const load = () => api.getAccounts().then(setAccounts).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <h1 className="page-title">
        <span className="text-gradient">Настройки</span>
      </h1>
      {accounts.map((acc) => (
        <AccountAccordion key={acc.id} account={acc} onUpdate={load} />
      ))}
      {error && <p className="error">{error}</p>}
    </>
  );
}
