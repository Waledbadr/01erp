'use client';

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from 'react';
import { messages, type Locale, type MessageKey } from './messages';

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
};
const LocaleContext = createContext<LocaleContextValue | null>(null);
const storageKey = 'erp-locale';
const changeEvent = 'erp-locale-change';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(changeEvent, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(changeEvent, onChange);
  };
}
function getSnapshot(): Locale {
  return window.localStorage.getItem(storageKey) === 'en' ? 'en' : 'ar';
}
function getServerSnapshot(): Locale {
  return 'ar';
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const setLocale = (next: Locale) => {
    window.localStorage.setItem(storageKey, next);
    window.dispatchEvent(new Event(changeEvent));
  };
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true';
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.title = messages[locale].appName;
  }, [locale]);
  return (
    <LocaleContext.Provider
      value={{ locale, setLocale, t: (key) => messages[locale][key] }}
    >
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('LocaleProvider is required');
  return value;
}
