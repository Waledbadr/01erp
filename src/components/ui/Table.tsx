import React from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  align?: 'start' | 'center' | 'end';
  mobilePriority?: 'high' | 'medium' | 'low';
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  actions?: (item: T) => React.ReactNode;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'لا توجد بيانات متاحة',
  onRowClick,
  actions,
}: TableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  const alignStyles = {
    start: 'text-start',
    center: 'text-center',
    end: 'text-end',
  };

  return (
    <div className="w-full">
      {/* 1. Desktop & Tablet Table View (Hidden on mobile < 640px) */}
      <div className="hidden sm:block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-600 ${
                      alignStyles[col.align || 'start']
                    }`}
                  >
                    {col.header}
                  </th>
                ))}
                {actions && (
                  <th scope="col" className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-600 text-end">
                    الإجراءات
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((item) => (
                <tr
                  key={keyExtractor(item)}
                  onClick={() => onRowClick?.(item)}
                  className={`transition-colors hover:bg-slate-50/80 ${onRowClick ? 'cursor-pointer' : ''}`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`whitespace-nowrap px-4 py-3.5 text-slate-700 ${
                        alignStyles[col.align || 'start']
                      }`}
                    >
                      {col.render ? col.render(item) : (item as Record<string, unknown>)[col.key] as React.ReactNode}
                    </td>
                  ))}
                  {actions && (
                    <td className="whitespace-nowrap px-4 py-3.5 text-end">
                      {actions(item)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Mobile Cards-on-Mobile Strategy (< 640px) */}
      <div className="sm:hidden flex flex-col gap-3">
        {data.map((item) => (
          <div
            key={keyExtractor(item)}
            onClick={() => onRowClick?.(item)}
            className={`rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col gap-2.5 ${
              onRowClick ? 'cursor-pointer active:bg-slate-50' : ''
            }`}
          >
            {columns.map((col) => (
              <div key={col.key} className="flex items-center justify-between text-xs border-b border-slate-50 pb-1.5 last:border-0 last:pb-0">
                <span className="font-medium text-slate-500">{col.header}:</span>
                <span className="font-semibold text-slate-800 text-end">
                  {col.render ? col.render(item) : (item as Record<string, unknown>)[col.key] as React.ReactNode}
                </span>
              </div>
            ))}
            {actions && (
              <div className="mt-1 pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                {actions(item)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
