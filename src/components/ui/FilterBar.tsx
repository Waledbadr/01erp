import React from 'react';
import { Search, RotateCcw } from 'lucide-react';
import { Input } from './Input.js';
import { Button } from './Button.js';

export interface FilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  children?: React.ReactNode;
  onClear?: () => void;
  showClear?: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'بحث...',
  children,
  onClear,
  showClear = false,
}) => {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
      <div className="flex-1 max-w-md">
        <Input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          startIcon={<Search className="w-4 h-4" />}
          className="bg-slate-50 border-slate-200"
        />
      </div>
      <div className="flex items-center gap-2.5 flex-wrap">
        {children}
        {showClear && onClear && (
          <Button variant="ghost" size="sm" onClick={onClear} startIcon={<RotateCcw className="w-3.5 h-3.5" />}>
            مسح التصفية
          </Button>
        )}
      </div>
    </div>
  );
};
