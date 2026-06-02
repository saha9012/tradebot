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
      <p className="mb-6 max-w-2xl text-sm leading-relaxed text-white/50">
        Логин и пароль Steam — только в <code>.env</code> в корне проекта. Здесь — правила торговли.
        Сначала «Войти в Steam», затем держи «Тестовый режим (Dry run)».
      </p>
      {accounts.map((acc) => (
        <AccountAccordion key={acc.id} account={acc} onUpdate={load} />
      ))}
      {error && <p className="error">{error}</p>}
    </>
  );
}
