'use client';

import { useEffect, useRef } from 'react';

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={'button ' + (props.className ?? '')} />;
}
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={'field ' + (props.className ?? '')} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={'field ' + (props.className ?? '')} />;
}
export function DatePicker(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <Input {...props} type="date" />;
}
type DialogProps = {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  closeLabel: string;
};

export function Modal(props: DialogProps) {
  return <DialogSurface {...props} kind="dialog" />;
}

export function Drawer(props: DialogProps) {
  return <DialogSurface {...props} kind="drawer" />;
}

function DialogSurface({
  open,
  title,
  children,
  onClose,
  closeLabel,
  kind,
}: DialogProps & { kind: 'dialog' | 'drawer' }) {
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(
      'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
    );
    (first ?? dialog)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === focusable[focusable.length - 1]
      ) {
        event.preventDefault();
        focusable[0].focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={kind}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <Button onClick={onClose} aria-label={closeLabel}>
            ×
          </Button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Toast({
  message,
  role = 'status',
}: {
  message: string;
  role?: 'status' | 'alert';
}) {
  return (
    <div className="toast" role={role}>
      {message}
    </div>
  );
}
export function Table<T>({
  rows,
  columns,
  keyOf,
}: {
  rows: T[];
  columns: {
    key: string;
    label: string;
    render: (row: T) => React.ReactNode;
  }[];
  keyOf: (row: T) => string;
}) {
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={keyOf(row)}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-cards">
        {rows.map((row) => (
          <dl key={keyOf(row)}>
            {columns.map((column) => (
              <div key={column.key}>
                <dt>{column.label}</dt>
                <dd>{column.render(row)}</dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
    </>
  );
}
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="tablist" className="tabs">
      {tabs.map((tab) => (
        <button
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          key={tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="badge">{children}</span>;
}
export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
export function Skeleton() {
  return <div className="skeleton" aria-hidden="true" />;
}
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      closeLabel={cancelLabel}
    >
      <p>{message}</p>
      <div className="dialog-actions">
        <Button onClick={onCancel}>{cancelLabel}</Button>
        <Button onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="page-header">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </header>
  );
}
export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="filter-bar">{children}</div>;
}
export function Loading({ label }: { label: string }) {
  return (
    <div role="status" className="loading">
      <Skeleton />
      <span>{label}</span>
    </div>
  );
}
