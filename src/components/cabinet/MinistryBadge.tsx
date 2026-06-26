import { Crown, Star, Award, BadgeCheck } from 'lucide-react';
import type { MinistryPortfolio, MinistryRank } from '@/types';

const RANK_STYLES: Record<MinistryRank, { ring: string; bg: string; text: string; icon: typeof Crown; label: string }> = {
  'CM':              { ring: 'ring-amber-300/60', bg: 'bg-amber-400/15',  text: 'text-amber-200',   icon: Crown,       label: 'Chief Minister' },
  'Cabinet':         { ring: 'ring-blue-300/50',  bg: 'bg-blue-400/15',   text: 'text-blue-200',    icon: Star,        label: 'Cabinet' },
  'MoS-Independent': { ring: 'ring-violet-300/50',bg: 'bg-violet-400/15', text: 'text-violet-200',  icon: BadgeCheck,  label: 'MoS (Indep.)' },
  'MoS':             { ring: 'ring-slate-300/40', bg: 'bg-slate-400/15',  text: 'text-slate-200',   icon: Award,       label: 'MoS' },
};

interface MinistryBadgeProps {
  portfolio: MinistryPortfolio;
  /** Compact = pill only with rank icon; full = pill with ministry name. */
  variant?: 'compact' | 'full';
  className?: string;
}

/**
 * Pill that surfaces a single ministry portfolio + its rank.
 * Reused on /cabinet, MLAScorecard, and the future /mla/[id] header.
 */
export function MinistryBadge({ portfolio, variant = 'full', className = '' }: MinistryBadgeProps) {
  const style = RANK_STYLES[portfolio.rank];
  const Icon = style.icon;

  if (variant === 'compact') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${style.bg} ${style.ring} ${style.text} ${className}`}
        title={`${style.label} · ${portfolio.ministry}`}
      >
        <Icon className="h-3 w-3" />
        {style.label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${style.bg} ${style.ring} ${style.text} ${className}`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{portfolio.ministry}</span>
    </span>
  );
}

export function getRankLabel(rank: MinistryRank): string {
  return RANK_STYLES[rank].label;
}
