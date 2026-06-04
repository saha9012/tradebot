import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { api } from '../api/client';
import GlassCard from '../components/GlassCard';

function fmt(n) {
  if (n == null || n === '') return '—';
  return Number(n).toFixed(2);
}

export default function Analytics() {
  const [rows, setRows] = useState([]);
  const [accountId, setAccountId] = useState('');

  const load = () => {
    const params = accountId ? { accountId, limit: 150 } : { limit: 150 };
    api.getAnalytics(params).then(setRows).catch(console.error);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, [accountId]);

  return (
    <>
      <h1 className="page-title">
        <span className="text-gradient">Аналитика</span>
      </h1>
      <p className="mb-6 max-w-2xl text-sm text-white/50">
        Итог проверки: цены, решение, ликвидность. Пошаговые запросы к Steam (listing,
        histogram…) — на вкладке «Отладка fetch». В «Логах» — одна короткая строка.
      </p>

      <div className="actions mb-6">
        <label className="flex items-center gap-2 text-sm text-white/50">
          Аккаунт
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="min-w-[140px]"
          >
            <option value="">Все</option>
            <option value="account-1">account-1</option>
            <option value="account-2">account-2</option>
            <option value="account-3">account-3</option>
          </select>
        </label>
        <button type="button" className="btn" onClick={load}>
          Обновить
        </button>
      </div>

      <GlassCard className="max-w-[min(100%,1400px)]">
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="analytics-table w-full text-left text-xs">
            <thead>
              <tr>
                <th>Время</th>
                <th>Предмет</th>
                <th>nameid</th>
                <th>Buy</th>
                <th>Sell</th>
                <th>Прибыль</th>
                <th>%</th>
                <th>Ликв. д/н</th>
                <th>Источник</th>
                <th>Решение</th>
                <th>Ссылка</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-white/60">
                    {new Date(r.created_at).toLocaleString('ru')}
                  </td>
                  <td className="max-w-[200px] truncate font-medium" title={r.market_hash_name}>
                    {r.market_hash_name}
                  </td>
                  <td className="font-mono text-cyan-300/90">{r.item_name_id || '—'}</td>
                  <td>{fmt(r.buy_order_price ?? r.highest_buy_order)}</td>
                  <td>{fmt(r.lowest_listing)}</td>
                  <td className={r.profit > 0 ? 'text-emerald-400' : ''}>{fmt(r.profit)}</td>
                  <td>{r.profit_percent != null ? `${r.profit_percent}%` : '—'}</td>
                  <td>
                    {r.sales_per_day ?? 0} / {r.sales_per_week ?? 0}
                  </td>
                  <td>
                    <span
                      className={`rounded px-1.5 py-0.5 ${
                        r.price_source === 'histogram'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {r.price_source || '—'}
                    </span>
                  </td>
                  <td>
                    {r.decision === 'buy' ? (
                      <span className="text-emerald-400">buy</span>
                    ) : (
                      <span className="text-white/50" title={r.skip_reason}>
                        skip
                      </span>
                    )}
                  </td>
                  <td>
                    {r.listing_url ? (
                      <a
                        href={r.listing_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
                      >
                        Steam
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <p className="py-8 text-center text-sm text-white/40">
            Пока нет записей. Запустите поиск — данные появятся после проверки лотов.
          </p>
        )}
      </GlassCard>
    </>
  );
}
