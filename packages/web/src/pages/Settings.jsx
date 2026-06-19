import { useEffect, useState } from 'react';
import { api } from '../api/client';
import AccountAccordion from '../components/AccountAccordion';

export default function Settings() {
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = () => api.getAccounts().then(setAccounts).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="settings-page">
      <h1 className="page-title settings-page-title">
        <span className="text-gradient">Настройки</span>
      </h1>
      <div className="settings-accounts">
        {accounts.map((acc) => (
          <AccountAccordion
            key={acc.id}
            account={acc}
            onUpdate={load}
            expanded={expandedId === acc.id}
            onToggleExpand={() => setExpandedId((id) => (id === acc.id ? null : acc.id))}
          />
        ))}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
