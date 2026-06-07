import { useCallback, useEffect, useState } from 'react';
import { TABLE_PAGE_SIZE } from '../constants/pagination';

export default function usePaginatedTable({
  fetchPage,
  deps = [],
  pageSize = TABLE_PAGE_SIZE,
  autoRefreshMs = 0,
}) {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);

  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    setPage(0);
  }, [depsKey]);

  const load = useCallback(() => {
    return fetchPage({ limit: pageSize, offset: page * pageSize })
      .then(({ rows: nextRows, total: nextTotal }) => {
        setRows(nextRows);
        setTotal(nextTotal);
        const maxPage = Math.max(0, Math.ceil(nextTotal / pageSize) - 1);
        if (page > maxPage) setPage(maxPage);
      })
      .catch(console.error);
  }, [fetchPage, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefreshMs) return undefined;
    const timer = setInterval(load, autoRefreshMs);
    return () => clearInterval(timer);
  }, [load, autoRefreshMs]);

  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

  return {
    rows,
    total,
    page,
    setPage,
    totalPages,
    pageSize,
    reload: load,
  };
}
