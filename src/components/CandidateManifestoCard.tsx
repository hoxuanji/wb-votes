'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import type { Candidate, Party, ScoreBreakdown } from '@/types';

interface CandidateManifestoCardProps {
  candidate: Candidate;
  party: Party;
  breakdown: ScoreBreakdown;
  rank: number;
}

function ScoreColor(score: number): string {
  if (score >= 75) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function ScoreBg(score: number): string {
  if (score >= 75) return 'bg-emerald-50 border-emerald-200';
  if (score >= 50) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

export function CandidateManifestoCard({ candidate, party, breakdown, rank }: CandidateManifestoCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isTop = rank === 1;

  return (
    <div
      className={`rounded-xl border transition-all ${
        isTop
          ? 'border-blue-200 bg-blue-50 ring-1 ring-blue-200 shadow-sm'
          : 'border-gray-100 bg-white'
      }`}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Rank */}
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            isTop ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {rank}
        </div>

        {/* Photo */}
        <div
          className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full"
          style={{ border: `2px solid ${party.color}55` }}
        >
          {candidate.photoUrl ? (
            <Image src={candidate.photoUrl} alt={candidate.name} fill className="object-cover" sizes="44px" />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-sm font-bold text-white"
              style={{ backgroundColor: party.color }}
            >
              {candidate.name.charAt(0)}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{candidate.name}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: party.color }} />
            <span className="text-xs text-gray-500">{party.abbreviation}</span>
          </div>
        </div>

        {/* Final score */}
        <div className={`shrink-0 rounded-lg border px-3 py-1.5 text-center ${ScoreBg(breakdown.finalScore)}`}>
          <p className={`text-lg font-extrabold leading-none ${ScoreColor(breakdown.finalScore)}`}>
            {breakdown.finalScore}%
          </p>
          <p className="mt-0.5 text-[10px] text-gray-500">match</p>
        </div>
      </div>

      {/* Sub-scores bar */}
      <div className="mx-3 mb-2 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 px-3 py-2">
        <div className="text-center">
          <p className="text-xs font-semibold text-blue-700">{breakdown.partyScore}%</p>
          <p className="text-[10px] text-gray-400">Policy alignment</p>
        </div>
        <div className="text-center">
          <p className={`text-xs font-semibold ${ScoreColor(breakdown.integrityScore)}`}>
            {breakdown.integrityScore}%
          </p>
          <p className="text-[10px] text-gray-400">Candidate profile</p>
        </div>
      </div>

      {/* Expandable why section */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex w-full items-center justify-between px-3 pb-2 text-xs text-gray-500 hover:text-gray-700"
      >
        <span>Why this score?</span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {expanded && (
        <div className="mx-3 mb-3 rounded-lg bg-white px-3 py-2 text-xs border border-gray-100 space-y-1.5">
          {breakdown.penaltyReasons.map((r, i) => (
            <p key={i} className="flex items-start gap-1.5 text-red-600">
              <span className="mt-px shrink-0">▼</span>
              <span>{r}</span>
            </p>
          ))}
          {breakdown.bonusReasons.map((r, i) => (
            <p key={i} className="flex items-start gap-1.5 text-emerald-700">
              <span className="mt-px shrink-0">▲</span>
              <span>{r}</span>
            </p>
          ))}
          <div className="pt-1 border-t border-gray-100">
            <Link
              href={`/candidate/${candidate.id}`}
              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
            >
              View full profile <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
