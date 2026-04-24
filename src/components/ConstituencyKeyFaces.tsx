'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Shield, TrendingUp, AlertTriangle, Star } from 'lucide-react';
import type { Candidate } from '@/types';
import { parties } from '@/data/parties';
import { formatCurrency } from '@/lib/utils';
import { PartySymbol } from '@/components/ui/PartySymbol';

const partyMap = Object.fromEntries(parties.map(p => [p.id, p]));

interface FaceCard {
  candidate: Candidate;
  tag: string;
  tagColor: string;
  tagIcon: React.ReactNode;
  highlight: string;
}

function buildFaceCards(candidates: Candidate[]): FaceCard[] {
  if (candidates.length === 0) return [];
  const cards: FaceCard[] = [];
  const seen = new Set<string>();

  // Incumbents first
  for (const c of candidates.filter(c => c.isIncumbent)) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    cards.push({
      candidate: c,
      tag: 'Incumbent MLA',
      tagColor: 'bg-blue-100 text-blue-700',
      tagIcon: <Star className="h-3 w-3" />,
      highlight: `${c.incumbentYears ?? '?'}y in office`,
    });
  }

  // Highest declared assets
  const richest = [...candidates]
    .filter(c => c.totalAssets > 0 && !seen.has(c.id))
    .sort((a, b) => b.totalAssets - a.totalAssets)[0];
  if (richest) {
    seen.add(richest.id);
    cards.push({
      candidate: richest,
      tag: 'Highest Assets',
      tagColor: 'bg-emerald-100 text-emerald-700',
      tagIcon: <TrendingUp className="h-3 w-3" />,
      highlight: formatCurrency(richest.totalAssets),
    });
  }

  // Most criminal cases
  const mostCases = [...candidates]
    .filter(c => c.criminalCases > 0 && !seen.has(c.id))
    .sort((a, b) => b.criminalCases - a.criminalCases)[0];
  if (mostCases) {
    seen.add(mostCases.id);
    cards.push({
      candidate: mostCases,
      tag: `${mostCases.criminalCases} Case${mostCases.criminalCases > 1 ? 's' : ''}`,
      tagColor: 'bg-red-100 text-red-700',
      tagIcon: <AlertTriangle className="h-3 w-3" />,
      highlight: 'Pending cases declared',
    });
  }

  // Clean record from major party (fill remaining slots)
  const major = ['AITC', 'BJP', 'CPI(M)', 'INC'];
  for (const partyId of major) {
    if (cards.length >= 5) break;
    const candidate = candidates.find(c => c.partyId === partyId && !seen.has(c.id));
    if (candidate) {
      seen.add(candidate.id);
      cards.push({
        candidate,
        tag: partyMap[partyId]?.abbreviation ?? partyId,
        tagColor: 'bg-gray-100 text-gray-600',
        tagIcon: <Shield className="h-3 w-3" />,
        highlight: candidate.education || 'Candidate',
      });
    }
  }

  // Fill up to 5 with remaining candidates
  for (const c of candidates) {
    if (cards.length >= 5) break;
    if (!seen.has(c.id)) {
      seen.add(c.id);
      cards.push({
        candidate: c,
        tag: partyMap[c.partyId]?.abbreviation ?? c.partyId,
        tagColor: 'bg-gray-100 text-gray-600',
        tagIcon: <Shield className="h-3 w-3" />,
        highlight: c.education || 'Candidate',
      });
    }
  }

  return cards;
}

interface Props {
  candidates: Candidate[];
  className?: string;
}

export function ConstituencyKeyFaces({ candidates, className = '' }: Props) {
  const cards = buildFaceCards(candidates);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  function checkScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 8);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkScroll); ro.disconnect(); };
  }, []);

  if (cards.length === 0) return null;

  return (
    <div className={`rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden ${className}`}>
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <h2 className="text-sm font-bold text-gray-900">Key Candidates to Watch</h2>
        <span className="text-xs text-gray-400">{cards.length} highlighted</span>
      </div>

      <div className="relative px-5 py-4">
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-1"
          style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {cards.map(({ candidate: c, tag, tagColor, tagIcon, highlight }) => {
            const party = partyMap[c.partyId];
            return (
              <Link
                key={c.id}
                href={`/candidate/${c.id}`}
                className="group shrink-0 w-40 rounded-xl border border-gray-100 bg-gray-50 p-3 transition-all duration-150 hover:border-blue-200 hover:bg-blue-50 hover:shadow-sm active:scale-95 active:bg-blue-100"
                style={{ scrollSnapAlign: 'start' }}
              >
                {/* Tag */}
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tagColor}`}>
                  {tagIcon} {tag}
                </span>

                {/* Photo */}
                <div className="relative mx-auto my-3 h-16 w-16 overflow-hidden rounded-full border-2 border-white shadow-sm">
                  {c.photoUrl ? (
                    <Image src={c.photoUrl} alt={c.name} fill className="object-cover" sizes="64px" />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-xl font-bold text-white"
                      style={{ backgroundColor: party?.color ?? '#64748b' }}
                    >
                      {c.name.charAt(0)}
                    </div>
                  )}
                </div>

                {/* Name */}
                <p className="text-center text-xs font-semibold text-gray-900 leading-tight line-clamp-2 group-hover:text-blue-700">
                  {c.name}
                </p>

                {/* Party badge */}
                <div className="mt-1.5 flex justify-center items-center gap-1">
                  <PartySymbol party={{ abbreviation: party?.abbreviation ?? c.partyId, color: party?.color ?? '#64748b', symbolUrl: party?.symbolUrl }} size={16} />
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: party?.color ?? '#64748b' }}
                  >
                    {party?.abbreviation ?? c.partyId}
                  </span>
                </div>

                {/* Highlight stat */}
                <p className="mt-1.5 text-center text-[10px] text-gray-400 line-clamp-1">{highlight}</p>
              </Link>
            );
          })}
        </div>

        {/* Desktop arrows */}
        {canLeft && (
          <button
            onClick={() => scrollRef.current?.scrollBy({ left: -176, behavior: 'smooth' })}
            className="absolute -left-1 top-1/2 -translate-y-1/2 hidden sm:flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white shadow hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
        )}
        {canRight && (
          <button
            onClick={() => scrollRef.current?.scrollBy({ left: 176, behavior: 'smooth' })}
            className="absolute -right-1 top-1/2 -translate-y-1/2 hidden sm:flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white shadow hover:bg-gray-50"
          >
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
        )}
      </div>
    </div>
  );
}
