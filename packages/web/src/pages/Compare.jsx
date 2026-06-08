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

export default function Compare() {
  const [accountId, setAccountId] = useState('');

  const fetchPage = useCallback(
    (params) => {
      const q = accountId ? { ...params, accountId } : params;
      return api.getCompare(q);
    },
    [accountId],
  );

  const { rows, total, page, setPage, totalPages, pageSize, reload } = usePaginatedTable({
    fetchPage,
    deps: [accountId],
    autoRefreshMs: 15000,
  });

  return (
    <>
      <h1 className="page-title">
        <span className="text-gradient">Ордер · продажа · прибыль</span>
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
                <th>Хеш</th>
                <th>Название</th>
                <th>Buy ордер, ₽</th>
                <th>Sell, ₽</th>
                <th>Прибыль, ₽</th>
                <th>Дата</th>
                <th>Steam</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-cyan-300/80">{r.item_id || '—'}</td>
                  <td className="max-w-[200px] truncate font-medium" title={r.market_hash_name}>
                    {r.market_hash_name || '—'}
                  </td>
                  <td>{fmt(r.buy_order_price)}</td>
                  <td>{fmt(r.sell_price)}</td>
                  <td className={r.profit > 0 ? 'text-emerald-400' : r.profit < 0 ? 'text-red-400' : ''}>
                    {fmt(r.profit)}
                  </td>
                  <td className="whitespace-nowrap text-white/60">
                    {r.updated_at ? new Date(r.updated_at).toLocaleString('ru') : '—'}
                  </td>
                  <td>
                    {r.listing_url ? (
                      <a
                        href={r.listing_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
                      >
                        Лот
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
            Нет данных для сравнения. Нужны предметы в инвентаре (вкладка «Продажа») и история покупок по buy-ордеру.
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
