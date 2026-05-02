'use client';

import Link from 'next/link';
import { Scale } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { GlobalSearch } from '@/components/GlobalSearch';
import { getClientElectionPhase } from '@/lib/election-phase';

export function Header() {
  const { lang, setLang, t } = useLanguage();
  const phase = getClientElectionPhase();
  const showExplore = phase !== 'pre';

  const navLinks = [
    { href: '/',           label: t('Home', 'হোম') },
    ...(showExplore ? [{ href: '/explore', label: t('Explore', 'এক্সপ্লোর') }] : []),
    { href: '/candidates', label: t('Candidates', 'প্রার্থী') },
    { href: '/quiz',       label: t('Quiz', 'কুইজ') },
    { href: '/compare',    label: t('Compare', 'তুলনা') },
    { href: '/methodology',label: t('Methodology', 'পদ্ধতি') },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 h-14">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-white active:opacity-70 transition-opacity"
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
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition-colors duration-150 hover:bg-white/10 hover:text-white active:bg-white/15"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-all duration-150 hover:bg-white/10 active:scale-95 active:bg-white/15 min-h-[36px]"
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
