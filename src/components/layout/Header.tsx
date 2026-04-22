'use client';

import Link from 'next/link';
import { Scale } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { GlobalSearch } from '@/components/GlobalSearch';

export function Header() {
  const { lang, setLang, t } = useLanguage();

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200/80 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 h-14">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-gray-900 active:opacity-70 transition-opacity"
          aria-label="WB Votes — Home"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 shadow-sm">
            <Scale className="h-4 w-4 text-white" />
          </div>
          <span className="text-[15px] tracking-tight">
            {t('WB Votes', 'ডব্লিউবি ভোটস')}
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">
          {[
            { href: '/',           label: t('Home', 'হোম') },
            { href: '/candidates', label: t('Candidates', 'প্রার্থী') },
            { href: '/quiz',       label: t('Quiz', 'কুইজ') },
            { href: '/compare',    label: t('Compare', 'তুলনা') },
            { href: '/methodology',label: t('Methodology', 'পদ্ধতি') },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-all duration-150 hover:bg-gray-100 active:scale-95 active:bg-gray-200 min-h-[36px]"
            aria-label="Toggle language"
          >
            {lang === 'en' ? 'বাংলা' : 'EN'}
          </button>
          {/* ⌘K search still works (hidden trigger) */}
          <div className="hidden">
            <GlobalSearch />
          </div>
        </div>
      </div>
    </header>
  );
}
