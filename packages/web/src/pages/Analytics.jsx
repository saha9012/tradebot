import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Trash2, Timer } from 'lucide-react';
import { api } from '../api/client';
import GlassCard from '../components/GlassCard';

function fmt(n) {
  if (n == null || n === '') return '—';
  return Number(n).toFixed(2);
}

function formatCountdown(ms) {
  if (ms <= 0) return 'скоро';
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d} д ${h} ч ${m} мин`;
  if (h > 0) return `${h} ч ${m} мин ${s} с`;
  if (m > 0) return `${m} мин ${s} с`;
  return `${s} с`;
}

export default function Analytics() {
  const [rows, setRows] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [purge, setPurge] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => {
    const params = accountId ? { accountId, limit: 150 } : { limit: 150 };
    api.getAnalytics(params).then(setRows).catch(console.error);
    api.getAnalyticsPurgeSchedule().then(setPurge).catch(console.error);
  }, [accountId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const msLeft = purge ? Math.max(0, purge.nextPurgeAt - now) : null;

  const onClear = async () => {
    if (
      !window.confirm(
        'Очистить аналитику, решения и логи цен? Сделки и их ID не удаляются.'
      )
    )
      return;
    setClearing(true);
    try {
      await api.clearAnalytics();
      setRows([]);
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <h1 className="page-title">
        <span className="text-gradient">Аналитика</span>
      </h1>

      <div className="actions mb-6 flex-wrap">
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
        {purge != null && (
          <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60">
            <Timer className="h-4 w-4 text-cyan-400" />
            Авто-очистка через {formatCountdown(msLeft)}
            {purge.rowCount != null && (
              <span className="text-white/35">
                · записей: {purge.rowCount}
                {purge.analyticsCount != null && (
                  <span>
                    {' '}
                    (данные {purge.analyticsCount}, решения {purge.decisionsCount ?? 0})
                  </span>
                )}
              </span>
            )}
          </span>
        )}
        <button
          type="button"
          className="btn flex items-center gap-2 border-red-500/30 text-red-300 hover:bg-red-500/10"
          onClick={onClear}
          disabled={clearing}
        >
          <Trash2 className="h-4 w-4" />
          {clearing ? 'Очистка…' : 'Очистить аналитику'}
        </button>
      </div>

      <GlassCard className="max-w-[min(100%,1400px)]">
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="analytics-table w-full text-left text-xs">
            <thead>
              <tr>
                <th>ID</th>
                <th>Обновлено</th>
                <th>Предмет</th>
                <th>Buy</th>
                <th>Sell</th>
                <th>Продаж/24ч</th>
                <th>Ссылка</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-cyan-300/80">{r.item_id || '—'}</td>
                  <td className="whitespace-nowrap text-white/60">
                    {new Date(r.updated_at || r.created_at).toLocaleString('ru')}
                  </td>
                  <td className="max-w-[200px] truncate font-medium" title={r.market_hash_name}>
                    {r.market_hash_name}
                  </td>
                  <td>{fmt(r.highest_buy_order)}</td>
                  <td>{fmt(r.lowest_listing)}</td>
                  <td>{r.sales_per_day ?? 0}</td>
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
            Пока нет данных Steam. Запустите поиск — появятся цены и ликвидность.
          </p>
        )}
      </GlassCard>
    </>
  );
}
