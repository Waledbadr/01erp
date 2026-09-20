import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { ar } from './ar.js';
import { en } from './en.js';

export type Language = 'ar' | 'en';
export type Direction = 'rtl' | 'ltr';

interface I18nContextType {
  language: Language;
  direction: Direction;
  isRTL: boolean;
  isRtl: boolean;
  isAr: boolean;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: typeof ar;
  formatCurrency: (amount: number | string) => string;
  formatDate: (date: Date | string) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

const STORAGE_KEY = 'saudi_erp_language_pref';

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (saved === 'ar' || saved === 'en') return saved;
    }
    return 'ar'; // Default Arabic RTL
  });

  const direction: Direction = language === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('dir', direction);
      document.documentElement.setAttribute('lang', language === 'ar' ? 'ar-SA' : 'en-US');
      localStorage.setItem(STORAGE_KEY, language);
    }
  }, [language, direction]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const toggleLanguage = () => {
    setLanguageState((prev) => (prev === 'ar' ? 'en' : 'ar'));
  };

  const t = useMemo(() => (language === 'ar' ? ar : en), [language]);

  const formatCurrency = (amount: number | string): string => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) return '0.00 ' + (language === 'ar' ? 'ر.س' : 'SAR');
    const formatted = new Intl.NumberFormat(language === 'ar' ? 'ar-SA' : 'en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
    return `${formatted} ${language === 'ar' ? 'ر.س' : 'SAR'}`;
  };

  const formatDate = (dateInput: Date | string): string => {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  return (
    <I18nContext.Provider
      value={{
        language,
        direction,
        isRTL: direction === 'rtl',
        isRtl: direction === 'rtl',
        isAr: language === 'ar',
        setLanguage,
        toggleLanguage,
        t,
        formatCurrency,
        formatDate,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
};

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

export const useLanguage = useI18n;
