import Link from 'next/link';
import { Crown, ArrowRight } from 'lucide-react';
import { wbCabinet2026, getChiefMinister } from '@/data/cabinet';
import { getPartyById } from '@/data/parties';
import { MinistryBadge } from './MinistryBadge';

/**
 * Compact summary embedded on the governance home tab. Surfaces the CM + a
 * handful of senior cabinet ministers and links to the full /cabinet page.
 */
export function CabinetSummary() {
  const cm = getChiefMinister();
  const cabinetMinisters = wbCabinet2026
    .filter((m) => m.id !== cm?.id && m.portfolios.some((p) => p.rank === 'Cabinet' && !p.to))
    .slice(0, 6);

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-4 flex items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-white sm:text-2xl">West Bengal Cabinet</h2>
          <p className="mt-1 text-sm text-gray-400">
            {wbCabinet2026.length} ministers · 2026–2031 term
          </p>
        </div>
        <Link
          href="/cabinet"
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-blue-300 hover:bg-white/10 min-h-[40px]"
        >
          View full cabinet <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* CM tile */}
      {cm && (
        <Link
          href="/cabinet"
          className="mb-3 flex items-center gap-3 rounded-xl border border-amber-300/30 bg-gradient-to-r from-amber-400/15 via-amber-400/5 to-transparent p-4 transition-colors hover:bg-amber-400/20 sm:gap-4"
        >
          <Crown className="h-8 w-8 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-200">Chief Minister</p>
            <p className="text-base font-bold text-white sm:text-lg">{cm.name}</p>
            <p className="text-xs text-amber-100/80">
              {cm.portfolios.filter((p) => !p.to && p.rank !== 'CM').map((p) => p.ministry).join(' · ') || 'Head of cabinet'}
            </p>
          </div>
        </Link>
      )}

      {/* Senior cabinet grid */}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {cabinetMinisters.map((m) => {
          const party = getPartyById(m.partyId);
          const color = party?.color ?? '#546E7A';
          const top = m.portfolios.find((p) => !p.to);
          return (
            <li key={m.id}>
              <Link
                href="/cabinet"
                className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/10"
                style={{ borderLeft: `3px solid ${color}` }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{m.name}</p>
                  {top && (
                    <p className="mt-0.5 truncate text-xs text-gray-400">{top.ministry}</p>
                  )}
                </div>
                {top && <MinistryBadge portfolio={top} variant="compact" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
