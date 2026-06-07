import { useCallback, useState } from 'react';
import { api } from '../api/client';
import GlassCard from '../components/GlassCard';
import TablePagination from '../components/TablePagination';
import usePaginatedTable from '../hooks/usePaginatedTable';

export default function Logs() {
  const [accountId, setAccountId] = useState('');
  const [clearing, setClearing] = useState(false);

  const fetchPage = useCallback(
    (params) => {
      const q = accountId ? { ...params, accountId } : params;
      return api.getLogs(q);
    },
    [accountId],
  );

  const { rows: logs, total, page, setPage, totalPages, pageSize, reload } = usePaginatedTable({
    fetchPage,
    deps: [accountId],
    autoRefreshMs: 15000,
  });

  const clearLogs = async () => {
    const msg = accountId
      ? `Удалить все логи для ${accountId}?`
      : 'Удалить ВСЕ логи? Это нельзя отменить.';
    if (!window.confirm(msg)) return;

    setClearing(true);
    try {
      await api.clearLogs(accountId || undefined);
      setPage(0);
      await reload();
    } catch (e) {
      alert(e.message);
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <h1 className="page-title">
        <span className="text-gradient">Логи</span>
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
        <button type="button" className="btn btn-danger" onClick={clearLogs} disabled={clearing}>
          {clearing ? '…' : 'Очистить историю'}
        </button>
      </div>
      <GlassCard>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Время</th>
                <th>Аккаунт</th>
                <th>Уровень</th>
                <th>Действие</th>
                <th>Сообщение</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap">{new Date(l.created_at).toLocaleString('ru')}</td>
                  <td>{l.account_id || '—'}</td>
                  <td>
                    <span
                      className="badge"
                      style={
                        l.level === 'error'
                          ? { borderColor: '#f87171', color: '#f87171' }
                          : l.level === 'warn'
                            ? { borderColor: '#fbbf24', color: '#fbbf24' }
                            : undefined
                      }
                    >
                      {l.level}
                    </span>
                  </td>
                  <td className="font-mono text-xs text-cyan-300/90">{l.action}</td>
                  <td className="max-w-md text-white/80">{l.message || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {total === 0 && <p className="py-4 text-sm text-white/40">Записей пока нет.</p>}
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
