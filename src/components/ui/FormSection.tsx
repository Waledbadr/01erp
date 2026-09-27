import React from 'react';

/**
 * Shared building blocks for data-entry forms inside modals (customer, supplier, item, invoice).
 * They give every form the same grouped-section layout, label style, required marker, hint and
 * error placement, so master-data screens look consistent in RTL and LTR.
 */

export type FormTone = 'emerald' | 'blue' | 'indigo' | 'amber' | 'slate' | 'violet';

const toneIcon: Record<FormTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-100',
};

const toneRing: Record<FormTone, string> = {
  emerald: 'focus:border-emerald-600 focus:ring-emerald-100',
  blue: 'focus:border-blue-600 focus:ring-blue-100',
  indigo: 'focus:border-indigo-600 focus:ring-indigo-100',
  amber: 'focus:border-amber-600 focus:ring-amber-100',
  slate: 'focus:border-slate-600 focus:ring-slate-100',
  violet: 'focus:border-violet-600 focus:ring-violet-100',
};

/** Class string for a native <input>, <select> or <textarea> in a form field. */
export function fieldClass(opts: { error?: boolean; tone?: FormTone; mono?: boolean; className?: string } = {}): string {
  const { error, tone = 'emerald', mono, className = '' } = opts;
  return [
    'block w-full min-h-[42px] rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400',
    'shadow-xs transition-colors focus:outline-hidden focus:ring-2',
    'disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed',
    error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-100' : `border-slate-300 ${toneRing[tone]}`,
    mono ? 'font-mono tracking-wide' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export interface FormSectionProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  tone?: FormTone;
  /** Number of grid columns on medium screens and up. */
  columns?: 1 | 2 | 3 | 4;
  /** Content rendered at the end of the section header (e.g. an "add line" button). */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const gridCols: Record<NonNullable<FormSectionProps['columns']>, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4',
};

export const FormSection: React.FC<FormSectionProps> = ({
  icon,
  title,
  description,
  tone = 'slate',
  columns = 2,
  actions,
  children,
  className = '',
}) => (
  <section className={`rounded-xl border border-slate-200 bg-white ${className}`}>
    <header className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 rounded-t-xl">
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${toneIcon[tone]}`}>
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-slate-900">{title}</h4>
          {description && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
    <div className={`grid gap-4 p-4 ${gridCols[columns]}`}>{children}</div>
  </section>
);

export interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  /** How many grid columns the field spans. 'full' spans the whole row. */
  span?: 1 | 2 | 3 | 'full';
  children: React.ReactNode;
}

const spanClass: Record<string, string> = {
  '1': '',
  '2': 'md:col-span-2',
  '3': 'md:col-span-3',
  full: 'col-span-full',
};

export const Field: React.FC<FieldProps> = ({ label, htmlFor, required, hint, error, span = 1, children }) => (
  <div className={spanClass[String(span)]}>
    <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-700">
      <span>{label}</span>
      {required && <span className="text-rose-600" aria-hidden="true">*</span>}
    </label>
    {children}
    {error ? (
      <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>
    ) : hint ? (
      <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
    ) : null}
  </div>
);

export interface ToggleCardProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description?: string;
  tone?: 'emerald' | 'rose' | 'amber' | 'blue' | 'indigo';
}

const toggleTone: Record<NonNullable<ToggleCardProps['tone']>, { on: string; box: string }> = {
  emerald: { on: 'border-emerald-300 bg-emerald-50', box: 'text-emerald-600 focus:ring-emerald-500' },
  rose: { on: 'border-rose-300 bg-rose-50', box: 'text-rose-600 focus:ring-rose-500' },
  amber: { on: 'border-amber-300 bg-amber-50', box: 'text-amber-600 focus:ring-amber-500' },
  blue: { on: 'border-blue-300 bg-blue-50', box: 'text-blue-600 focus:ring-blue-500' },
  indigo: { on: 'border-indigo-300 bg-indigo-50', box: 'text-indigo-600 focus:ring-indigo-500' },
};

/** A checkbox rendered as a selectable card with a title and explanation. */
export const ToggleCard: React.FC<ToggleCardProps> = ({ checked, onChange, title, description, tone = 'emerald' }) => (
  <label
    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
      checked ? toggleTone[tone].on : 'border-slate-200 bg-white hover:bg-slate-50'
    }`}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className={`mt-0.5 h-4 w-4 rounded border-slate-300 ${toggleTone[tone].box}`}
    />
    <span className="min-w-0">
      <span className="block text-xs font-bold text-slate-800">{title}</span>
      {description && <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{description}</span>}
    </span>
  </label>
);

export interface InfoBannerProps {
  icon?: React.ReactNode;
  tone?: 'emerald' | 'blue' | 'indigo' | 'amber';
  children: React.ReactNode;
}

const bannerTone: Record<NonNullable<InfoBannerProps['tone']>, string> = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  blue: 'border-blue-200 bg-blue-50 text-blue-900',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-900',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
};

export const InfoBanner: React.FC<InfoBannerProps> = ({ icon, tone = 'emerald', children }) => (
  <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-xs leading-relaxed ${bannerTone[tone]}`}>
    {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
    <div className="min-w-0">{children}</div>
  </div>
);
