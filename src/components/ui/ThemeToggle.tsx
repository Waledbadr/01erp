import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { getTheme, setTheme, Theme } from '../../lib/theme.js';

export const ThemeToggle: React.FC<{ isAr: boolean }> = ({ isAr }) => {
  const [theme, setState] = useState<Theme>(getTheme);
  useEffect(() => {
    const on = (e: Event) => setState((e as CustomEvent<Theme>).detail);
    window.addEventListener('theme-changed', on);
    return () => window.removeEventListener('theme-changed', on);
  }, []);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const label = theme === 'dark' ? (isAr ? 'الوضع الفاتح' : 'Light mode') : isAr ? 'الوضع الداكن' : 'Dark mode';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={label}
      aria-label={label}
      className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition"
    >
      {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-600" />}
    </button>
  );
};
