export default function TablePagination({ page, totalPages, total, pageSize, onPageChange }) {
  if (total === 0) return null;

  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);

  return (
    <div className="table-pagination">
      <p className="table-pagination__meta">
        {from}–{to} из {total}
      </p>
      <div className="table-pagination__controls">
        <button
          type="button"
          className="btn table-pagination__btn"
          disabled={page <= 0}
          onClick={() => onPageChange(page - 1)}
        >
          ← Назад
        </button>
        <span className="table-pagination__page">
          {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          className="btn table-pagination__btn"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
        >
          Вперёд →
        </button>
      </div>
    </div>
  );
}
