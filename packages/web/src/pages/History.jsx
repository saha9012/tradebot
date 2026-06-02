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
      <h1 className="page-title">
        <span className="text-gradient">Сделки</span>
      </h1>
      <GlassCard>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Время</th>
                <th>Аккаунт</th>
                <th>Игра</th>
                <th>Действие</th>
                <th>Предмет</th>
                <th>Цена</th>
                <th>Прибыль</th>
                <th>Тест</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td>{new Date(t.created_at).toLocaleString('ru')}</td>
                  <td>{t.account_id}</td>
                  <td>{t.game}</td>
                  <td>{t.action}</td>
                  <td className="max-w-[180px] truncate">{t.market_hash_name || '—'}</td>
                  <td>{t.price ?? '—'}</td>
                  <td>{t.profit ?? '—'}</td>
                  <td>{t.dry_run ? 'да' : 'нет'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {trades.length === 0 && (
          <p className="py-4 text-sm text-white/40">Сделок пока нет.</p>
        )}
      </GlassCard>
    </>
  );
}
