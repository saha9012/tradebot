import { useCallback, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { api } from '../api/client';
import GlassCard from '../components/GlassCard';
import TablePagination from '../components/TablePagination';
import usePaginatedTable from '../hooks/usePaginatedTable';

function fmt(n) {
  if (n == null || n === '') return '—';
  return Number(n).toFixed(2);
}

const SKIP_LABELS = {
  max_item_price: 'цена выше лимита',
  profit_percent_low: 'прибыль % ниже минимума',
  profit_percent_high: 'прибыль % выше максимума',
  cs2_filter_excluded: 'фильтр CS2',
  scam_skip: 'подозрительная прибыль %',
  min_profit: 'мало прибыли (₽)',
  low_liquidity: 'мало продаж за сутки',
  no_price_data: 'нет цены',
  no_buy_order_data: 'нет buy',
  no_netSell_data: 'нет выручки',
};

function skipLabel(reason) {
  if (!reason) return '—';
  return SKIP_LABELS[reason] || reason;
}

export default function Decisions() {
  const [accountId, setAccountId] = useState('');

  const fetchPage = useCallback(
    (params) => {
      const q = accountId ? { ...params, accountId } : params;
      return api.getDecisions(q);
    },
    [accountId],
  );

  const { rows, total, page, setPage, totalPages, pageSize, reload } = usePaginatedTable({
    fetchPage,
    deps: [accountId],
    autoRefreshMs: 12000,
  });

  return (
    <>
      <h1 className="page-title">
        <span className="text-gradient">Решения</span>
      </h1>

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
        <button type="button" className="btn" onClick={reload}>
          Обновить
        </button>
      </div>

      <GlassCard className="max-w-[min(100%,1400px)]">
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="analytics-table w-full text-left text-xs">
            <thead>
              <tr>
                <th>ID</th>
                <th>Предмет</th>
                <th>Buy ордер</th>
                <th>Sell</th>
                <th>Прибыль</th>
                <th>%</th>
                <th>Решение</th>
                <th>Причина</th>
                <th>Ссылка</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-cyan-300/80">{r.item_id || '—'}</td>
                  <td className="max-w-[200px] truncate font-medium" title={r.market_hash_name}>
                    {r.market_hash_name}
                  </td>
                  <td>{fmt(r.buy_order_price ?? r.highest_buy_order)}</td>
                  <td>{fmt(r.sell_listing_price ?? r.lowest_listing)}</td>
                  <td className={r.profit > 0 ? 'text-emerald-400' : ''}>{fmt(r.profit)}</td>
                  <td>{r.profit_percent != null ? `${r.profit_percent}%` : '—'}</td>
                  <td>
                    {r.decision === 'buy' ? (
                      <span className="text-emerald-400">buy</span>
                    ) : (
                      <span className="text-white/50">skip</span>
                    )}
                  </td>
                  <td className="max-w-[140px] truncate text-white/45" title={r.skip_reason}>
                    {r.decision === 'buy' ? '—' : skipLabel(r.skip_reason)}
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
        {total === 0 && (
          <p className="py-8 text-center text-sm text-white/40">
            Пока нет решений. Запустите поиск — бот запишет buy/skip по каждому лоту.
          </p>
        )}
        <TablePagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </GlassCard>
    </>
  );
}
