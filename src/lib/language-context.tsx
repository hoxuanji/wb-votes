'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
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

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>('en');
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
