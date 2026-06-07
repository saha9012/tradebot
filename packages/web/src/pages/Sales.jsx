import { useCallback } from 'react';
import { api } from '../api/client';
import GlassCard from '../components/GlassCard';
import TablePagination from '../components/TablePagination';
import usePaginatedTable from '../hooks/usePaginatedTable';

export default function Sales() {
  const fetchPage = useCallback((params) => api.getSales(params), []);

  const { rows, total, page, setPage, totalPages, pageSize, reload } = usePaginatedTable({
    fetchPage,
  });

  return (
    <>
      <h1 className="page-title">
        <span className="text-gradient">Продажа предметов</span>
      </h1>
      <div className="actions mb-6">
        <button type="button" className="btn" onClick={reload}>
          Обновить
        </button>
      </div>
      <GlassCard className="max-w-[min(100%,1200px)]">
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table>
            <thead>
              <tr>
                <th>ID предмета</th>
                <th>Предмет</th>
                <th>Аккаунт</th>
                <th>Цена, ₽</th>
                <th>Статус</th>
                <th>Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-cyan-300/80">{r.item_id || '—'}</td>
                  <td className="max-w-[220px] truncate font-medium" title={r.market_hash_name}>
                    {r.market_hash_name || '—'}
                  </td>
                  <td>{r.account_id || '—'}</td>
                  <td>{r.price ?? '—'}</td>
                  <td>{r.status || '—'}</td>
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
            Раздел в подготовке — таблица и пагинация готовы. Данные появятся после снятия трейд-бана.
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
