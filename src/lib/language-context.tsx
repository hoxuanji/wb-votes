'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Language } from '@/types';

interface LanguageContextValue {
  lang: Language;
  setLang: (l: Language) => void;
  t: (en: string, bn: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (en) => en,
});

const STORAGE_KEY = 'wbv:lang';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>('en');

  // ponytail: SSR hydration safe — server always renders 'en', client swaps
  // on mount if a preference was saved. One frame of EN flash on first paint
  // is acceptable; full SSR-locale wiring would touch every entry point.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'bn' || saved === 'en') setLangState(saved);
    } catch { /* private mode / disabled storage */ }
  }, []);

  const setLang = (l: Language) => {
    setLangState(l);
    try { window.localStorage.setItem(STORAGE_KEY, l); } catch { /* noop */ }
  };

  const t = (en: string, bn: string) => (lang === 'bn' ? bn : en);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
