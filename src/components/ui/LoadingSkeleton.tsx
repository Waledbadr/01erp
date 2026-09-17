import React from 'react';

export const LoadingSkeleton: React.FC<{ className?: string }> = ({ className = 'h-4 w-full' }) => {
  return <div className={`animate-pulse rounded-md bg-slate-200/80 ${className}`} />;
};

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => {
  return (
    <div className="w-full space-y-3 p-4 rounded-xl border border-slate-200 bg-white">
      <div className="flex gap-4 border-b border-slate-100 pb-3">
        <LoadingSkeleton className="h-4 w-24" />
        <LoadingSkeleton className="h-4 w-32" />
        <LoadingSkeleton className="h-4 w-20 ms-auto" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 py-2 border-b border-slate-50 last:border-0">
          <LoadingSkeleton className="h-4 w-20" />
          <LoadingSkeleton className="h-4 w-40" />
          <LoadingSkeleton className="h-4 w-16 ms-auto" />
        </div>
      ))}
    </div>
  );
};
