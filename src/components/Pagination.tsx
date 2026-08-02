import { useState, useMemo } from 'react';

interface PaginationProps {
  /** 当前页码（1-based） */
  page: number;
  /** 每页条数 */
  pageSize: number;
  /** 总条数 */
  total: number;
  /** 页码变化回调 */
  onPageChange: (page: number) => void;
  /** 每页条数变化回调 */
  onPageSizeChange: (size: number) => void;
  /** 每页条数选项 */
  sizeOptions?: number[];
  /** 总数标签文本 */
  label?: string;
}

const DEFAULT_SIZE_OPTIONS = [5, 10, 15, 20, 50];

export function usePagination(defaultPageSize = 20) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const paginate = useMemo(() => {
    return {
      page,
      pageSize,
      onPageChange: setPage,
      onPageSizeChange: (size: number) => {
        setPageSize(size);
        setPage(1);
      },
    };
  }, [page, pageSize]);

  return paginate;
}

export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  sizeOptions = DEFAULT_SIZE_OPTIONS,
  label = '条',
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const handleSizeChange = (size: number) => {
    onPageSizeChange(size);
  };

  return (
    <div className="flex flex-col gap-3 px-5 py-3 border-t border-warm-100 bg-warm-50/30 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-xs text-warm-500">
        <span>每页</span>
        <select
          value={pageSize}
          onChange={e => handleSizeChange(Number(e.target.value))}
          className="input input--sm w-16"
        >
          {sizeOptions.map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <span>{label}，共 {total} {label}</span>
      </div>

      <div className="flex items-center gap-1 flex-wrap justify-center">
        <button
          onClick={() => onPageChange(1)}
          disabled={safePage === 1}
          className="btn btn--ghost btn--sm disabled:opacity-30"
        >«</button>
        <button
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage === 1}
          className="btn btn--ghost btn--sm disabled:opacity-30"
        >上一页</button>
        <span className="px-3 py-1 text-xs text-warm-600 tabular-nums">
          <span className="font-semibold text-accent-600">{safePage}</span> / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage === totalPages}
          className="btn btn--ghost btn--sm disabled:opacity-30"
        >下一页</button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={safePage === totalPages}
          className="btn btn--ghost btn--sm disabled:opacity-30"
        >»</button>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={safePage}
          onChange={e => {
            const v = parseInt(e.target.value);
            if (!isNaN(v) && v >= 1 && v <= totalPages) onPageChange(v);
          }}
          className="input input--sm w-14 text-center"
        />
      </div>
    </div>
  );
}
