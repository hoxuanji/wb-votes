'use client';

import Link from 'next/link';
import { CalendarClock, AlertTriangle } from 'lucide-react';
import type { StateLiveSummary } from '@/lib/live-store';
import { constituencies } from '@/data/constituencies';
import { RE_ELECTION_ACS } from '@/lib/re-election';

const constById = Object.fromEntries(constituencies.map((c) => [c.id, c]));

interface Props { summary: StateLiveSummary; }

/**
 * Wrap-up banner: shown when counting has essentially concluded (>= 290 of 294
 * declared) and at least one AC is parked in the re-election list. Explains why
 * the state isn't '294/294 declared' — avoids the dashboard reading as stuck.
 */
export function ReElectionNotice({ summary }: Props) {
  const acs = Object.keys(RE_ELECTION_ACS);
  if (acs.length === 0) return null;
  // Only surface once counting is basically done elsewhere — otherwise it'd
  // read as noise mid-day.
  if (summary.declared < summary.totalACs - acs.length - 4) return null;

  const remaining = summary.totalACs - summary.declared;
  const allResolved = summary.declared >= summary.totalACs - acs.length;

  return (
    <section className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-5">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0 rounded-full bg-amber-500/15 p-2">
              {allResolved ? (
                <CalendarClock className="h-5 w-5 text-amber-300" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-300" />
              )}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">
                {allResolved ? 'Counting complete' : 'Wrapping up'}
              </p>
              <p className="mt-1 text-sm font-bold text-white sm:text-base">
                {allResolved
                  ? `${summary.declared} of ${summary.totalACs} seats declared · re-election pending in ${acs.length} constituenc${acs.length === 1 ? 'y' : 'ies'}`
                  : `${summary.declared} of ${summary.totalACs} seats declared · ${remaining} pending`}
              </p>
              <p className="mt-1 text-[12px] text-amber-100/70">
                {allResolved
                  ? 'Final state-wide tally fixed for 293 seats. The remaining contest below goes to a fresh poll.'
                  : 'Counting in its final window — remaining constituencies being tallied.'}
              </p>
            </div>
          </div>
        </div>

        {allResolved && (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {acs.map((acId) => {
              const c = constById[acId];
              const info = RE_ELECTION_ACS[acId];
              if (!c) return null;
              return (
                <li key={acId}>
                  <Link
                    href={`/constituency/${acId}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 transition hover:bg-amber-500/10"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{c.name}</p>
                      <p className="text-[11px] text-amber-100/70">
                        {c.district} · AC #{c.assemblyNumber}
                      </p>
                      <p className="mt-1 text-[11px] text-amber-100/80">{info.reason}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      Re-election
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
