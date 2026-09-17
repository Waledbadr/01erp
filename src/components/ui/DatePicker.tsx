import React from 'react';
import { Calendar } from 'lucide-react';

export interface DatePickerProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(
  ({ label, error, helperText, id, className = '', ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold text-slate-700 mb-1 text-start">
            {label}
          </label>
        )}
        <div className="relative rounded-lg shadow-sm">
          <input
            id={inputId}
            ref={ref}
            type="date"
            aria-invalid={Boolean(error)}
            className={`block w-full min-h-[44px] rounded-lg border text-sm text-slate-900 bg-white ps-3.5 pe-10 focus:outline-none focus:ring-2 transition-colors ${
              error
                ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-200'
                : 'border-slate-300 focus:border-emerald-600 focus:ring-emerald-100'
            } disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed ${className}`}
            {...props}
          />
          <div className="absolute inset-y-0 end-0 pe-3 flex items-center pointer-events-none text-slate-400">
            <Calendar className="w-4 h-4" />
          </div>
        </div>
        {error ? (
          <p className="mt-1 text-xs text-rose-600 font-medium text-start">{error}</p>
        ) : helperText ? (
          <p className="mt-1 text-xs text-slate-500 text-start">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

DatePicker.displayName = 'DatePicker';
