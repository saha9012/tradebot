import { useCallback, useState } from 'react';
import { api } from '../api/client';
import TablePagination from '../components/TablePagination';
import usePaginatedTable from '../hooks/usePaginatedTable';
import { parseMarketCheckMessage, actionLabel } from '../util/parseLogMessage';

const LOG_GRID = '10.5rem 6.25rem 3.75rem 8.75rem 1px minmax(20rem, 1fr)';

function LogBody({ log, parsed }) {
  if (parsed?.kind === 'buy') {
    return (
      <div className="log-feed-details">
        <div className="log-feed-item">{parsed.item}</div>
        <div className="log-feed-detail">
          buy {parsed.buyWas} → {parsed.buyAt} · sell {parsed.sell} · +{parsed.profit}₽ · {parsed.source} ·{' '}
          {parsed.liquidity}
        </div>
      </div>
    );
  }

  if (parsed?.kind === 'skip') {
    return (
      <div className="log-feed-details">
        <div className="log-feed-item">{parsed.item}</div>
        <div className="log-feed-detail">
          buy {parsed.buyWas} sell {parsed.sell} · {parsed.reason} · {parsed.source} · {parsed.liquidity}
        </div>
      </div>
    );
  }

  return <div className="log-feed-details log-feed-details--plain">{log.message || '—'}</div>;
}

function LogRow({ log }) {
  const parsed = log.action === 'market_check' ? parseMarketCheckMessage(log.message) : null;
  const time = new Date(log.created_at).toLocaleString('ru');
  const act = actionLabel(log.action);
  const level = (log.level || 'info').toLowerCase();
  const levelClass =
    log.level === 'error'
      ? 'log-feed-level--error'
      : log.level === 'warn'
        ? 'log-feed-level--warn'
        : '';

  return (
    <div className="log-feed-row" style={{ gridTemplateColumns: LOG_GRID }}>
      <div className="log-feed-cell log-feed-time">{time}</div>
      <div className="log-feed-cell log-feed-account">{log.account_id || '—'}</div>
      <div className="log-feed-cell">
        <span className={`log-feed-level ${levelClass}`}>{level}</span>
      </div>
      <div className="log-feed-cell log-feed-action">{act}</div>
      <div className="log-feed-divider" aria-hidden />
      <div className="log-feed-cell log-feed-cell--item">
        <LogBody log={log} parsed={parsed} />
      </div>
    </div>
  );
}

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
    <div className="logs-page">
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

      <div className="log-feed-scroll">
        <div className="log-feed">
          {logs.map((l) => (
            <LogRow key={l.id} log={l} />
          ))}
          {total === 0 && (
            <p className="py-10 text-center text-sm text-white/40">Записей пока нет.</p>
          )}
        </div>
      </div>

      <TablePagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
      />
    </div>
  );
}
