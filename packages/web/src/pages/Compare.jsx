import { useCallback } from 'react';
import { api } from '../api/client';
import GlassCard from '../components/GlassCard';
import TablePagination from '../components/TablePagination';
import usePaginatedTable from '../hooks/usePaginatedTable';

function fmt(n) {
  if (n == null || n === '') return '—';
  return Number(n).toFixed(2);
}

export default function Compare() {
  const fetchPage = useCallback((params) => api.getCompare(params), []);

  const { rows, total, page, setPage, totalPages, pageSize, reload } = usePaginatedTable({
    fetchPage,
  });

  return (
    <>
      <h1 className="page-title">
        <span className="text-gradient">Ордер · продажа · прибыль</span>
      </h1>
      <div className="actions mb-6">
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
                <th>Продажа</th>
                <th>Прибыль</th>
                <th>Δ %</th>
                <th>Обновлено</th>
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
                  <td className={r.profit > 0 ? 'text-emerald-400' : ''}>{fmt(r.profit)}</td>
                  <td>{r.profit_percent != null ? `${r.profit_percent}%` : '—'}</td>
                  <td className="whitespace-nowrap text-white/60">
                    {r.updated_at ? new Date(r.updated_at).toLocaleString('ru') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {total === 0 && (
          <p className="py-8 text-center text-sm text-white/40">
            Сравнение ордеров, продаж и прибыли — скоро. Пагинация уже подключена.
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
