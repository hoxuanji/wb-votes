import Link from 'next/link';
import { ExternalLink, MapPin } from 'lucide-react';
import type { CabinetMember, MinistryPortfolio } from '@/types';
import { getPartyById } from '@/data/parties';
import { constituencies } from '@/data/constituencies';
import { MinistryBadge } from './MinistryBadge';

const constituencyById = Object.fromEntries(constituencies.map(c => [c.id, c]));

interface MinisterCardProps {
  member: CabinetMember;
  className?: string;
  /** When true (used at top of /cabinet for the CM), uses a larger hero treatment. */
  hero?: boolean;
}

export function MinisterCard({ member, hero = false, className = '' }: MinisterCardProps) {
  const party = getPartyById(member.partyId);
  const partyColor = party?.color ?? '#546E7A';
  const constituency = member.constituencyId ? constituencyById[member.constituencyId] : undefined;

  const currentPortfolios = member.portfolios.filter(p => !p.to);
  const topRank = currentPortfolios[0]?.rank;

  // The MLA detail page is M4 — link only when constituency exists; UI is enabled but goes to a placeholder for now.
  const profileHref = constituency ? `/constituency/${constituency.id}` : null;

  return (
    <article
      className={`relative flex h-full flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/[0.07] ${hero ? 'sm:flex-row sm:items-start sm:gap-5 sm:p-6' : ''} ${className}`}
      style={{ borderLeft: `3px solid ${partyColor}` }}
    >
      {/* Photo / monogram */}
      <Avatar
        photoUrl={member.photoUrl}
        name={member.name}
        size={hero ? 'lg' : 'md'}
        partyColor={partyColor}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Name + party */}
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className={`font-bold text-white ${hero ? 'text-xl sm:text-2xl' : 'text-base'}`}>
            {member.name}
          </h3>
          {party && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
              style={{ backgroundColor: partyColor }}
            >
              {party.abbreviation}
            </span>
          )}
        </div>

        {/* Constituency */}
        {constituency && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
            <MapPin className="h-3 w-3" />
            <Link href={`/constituency/${constituency.id}`} className="hover:text-blue-300 hover:underline">
              {constituency.name}, {constituency.district}
            </Link>
          </p>
        )}
        {!constituency && (
          <p className="mt-0.5 text-xs text-gray-500 italic">MLC / non-MLA member</p>
        )}

        {/* Portfolios */}
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {currentPortfolios.map((p) => (
            <li key={`${p.ministry}-${p.from}`}>
              <MinistryBadge portfolio={p} variant="full" />
            </li>
          ))}
        </ul>

        {/* Bio */}
        {hero && member.bio && (
          <p className="mt-3 text-sm text-blue-100/80">{member.bio}</p>
        )}

        {/* Footer — pinned to bottom via mt-auto so cards line up */}
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 text-[11px] text-gray-500">
          <span>Inducted {formatDate(member.inducted)}</span>
          <a
            href={member.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-blue-400 hover:underline"
          >
            source <ExternalLink className="h-2.5 w-2.5" />
          </a>
          {profileHref && (
            <Link href={profileHref} className="ml-auto text-blue-300 hover:underline">
              View constituency →
            </Link>
          )}
        </div>
      </div>

      {/* Rank tag (top-right corner) */}
      {topRank && (
        <span
          className="absolute right-3 top-3 hidden sm:inline-flex"
          aria-hidden
        >
          <MinistryBadge
            portfolio={{ ministry: '', rank: topRank, from: currentPortfolios[0].from } as MinistryPortfolio}
            variant="compact"
          />
        </span>
      )}
    </article>
  );
}

function Avatar({ photoUrl, name, size, partyColor }: { photoUrl?: string; name: string; size: 'md' | 'lg'; partyColor: string }) {
  const dim = size === 'lg' ? 'h-20 w-20 sm:h-28 sm:w-28' : 'h-12 w-12';
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');

  if (photoUrl) {
    // Using a plain <img> here keeps the component a pure server component
    // and avoids next/image domain config for arbitrary government URLs.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt={name} className={`${dim} shrink-0 rounded-full object-cover ring-2 ring-white/20`} />;
  }

  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-full text-white ring-2 ring-white/20`}
      style={{ background: `linear-gradient(135deg, ${partyColor}cc, ${partyColor}55)` }}
      aria-hidden
    >
      <span className={size === 'lg' ? 'text-2xl font-bold' : 'text-sm font-bold'}>{initials}</span>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}
