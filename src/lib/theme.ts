/** Light / dark theme. The choice is remembered per browser; the first visit follows the system. */
export type Theme = 'light' | 'dark';
const KEY = 'erp_theme';

export function getTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage unavailable */
  }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable */
  }
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: theme }));
}
