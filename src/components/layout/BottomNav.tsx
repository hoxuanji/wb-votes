'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, ClipboardList, GitCompare } from 'lucide-react';

const TABS = [
  { href: '/',           icon: Home,          label: 'Home'       },
  { href: '/candidates', icon: Users,         label: 'Candidates' },
  { href: '/quiz',       icon: ClipboardList, label: 'Quiz'       },
  { href: '/compare',    icon: GitCompare,    label: 'Compare'    },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-slate-950/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main navigation"
    >
      <div className="flex h-16 items-stretch">
        {TABS.map(({ href, icon: Icon, label }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`
                flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold
                transition-all duration-150 active:scale-95 select-none
                ${active
                  ? 'text-blue-400'
                  : 'text-gray-500 active:text-gray-300'
                }
              `}
              aria-current={active ? 'page' : undefined}
            >
              <div className={`
                flex h-7 w-12 items-center justify-center rounded-full transition-all duration-150
                ${active ? 'bg-blue-400/20' : 'active:bg-white/10'}
              `}>
                <Icon className={`h-5 w-5 transition-transform duration-150 ${active ? 'scale-110' : ''}`} />
              </div>
              <span className={`leading-none ${active ? 'text-blue-400' : 'text-gray-500'}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
