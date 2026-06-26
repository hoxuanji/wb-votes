import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft, ExternalLink, MapPin, UserCheck, Trophy, Wallet, Clock,
  ScrollText, ChevronRight, Phone, Globe, Mail, Newspaper, History, FileText,
  GraduationCap, Briefcase, Scale, AlertTriangle, Info,
} from 'lucide-react';
import { constituencies, getConstituencyById } from '@/data/constituencies';
import { getCurrentMLAForAC } from '@/data/current-mla';
import { getMLARecordForAC } from '@/data/mla-records';
import { getCabinetMemberByConstituency } from '@/data/cabinet';
import { getCandidateById } from '@/data/candidates';
import { getPartyById } from '@/data/parties';
import { getHistoricalResultForACYear } from '@/data/historical-results';
import { getServerElectionPhase, isGovernance } from '@/lib/election-phase';
import { MinistryBadge } from '@/components/cabinet/MinistryBadge';
import { ConstituencyNewsFeed } from '@/components/ConstituencyNewsFeed';
import { formatAssets } from '@/data/candidates';
import type { PageProps } from '@/types';

export const dynamic = 'force-static';

// WB MLALADS standard: ₹70 lakh per MLA per year.
const MLALADS_ANNUAL_L = 70;
const MLALADS_TERM_YEARS = 5;

export function generateStaticParams() {
  return constituencies.map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const constituency = getConstituencyById(params.id);
  if (!constituency) return {};
  const mla = getCurrentMLAForAC(params.id);
  const title = mla
    ? `${mla.name} — MLA, ${constituency.name} (2026–2031)`
    : `${constituency.name} MLA — Vacant Seat`;
  const description = mla
    ? `Profile of ${mla.name}, sitting MLA for ${constituency.name}, ${constituency.district}. Assembly performance, MLALADS funds, ministry portfolio, electoral history, and local news.`
    : `${constituency.name}, ${constituency.district} — MLA seat currently vacant pending the next polling outcome.`;
  return {
    title,
    description,
    openGraph: { title, description },
  };
}

function pct(v?: number | null): string {
  return typeof v === 'number' ? `${Math.round(v)}%` : '—';
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

export default function MLAProfilePage({ params }: PageProps) {
  const constituency = getConstituencyById(params.id);
  if (!constituency) notFound();

  const phase = getServerElectionPhase();
  const governance = isGovernance(phase);
  const term = governance ? '2026-2031' : '2021-2026';
  const termLabel = governance ? '2026–2031' : '2021–2026';

  const currentMLA = getCurrentMLAForAC(params.id);
  const minister = getCabinetMemberByConstituency(params.id);
  const candidate = currentMLA?.candidateId ? getCandidateById(currentMLA.candidateId) : undefined;
  const record = getMLARecordForAC(params.id, term);

  const result2021 = getHistoricalResultForACYear(params.id, 2021);
  const result2016 = getHistoricalResultForACYear(params.id, 2016);
  const result2026 = getHistoricalResultForACYear(params.id, 2026);

  // Vacant fallback: when in governance and no current MLA data exists.
  if (governance && !currentMLA) {
    return (
      <VacantSeat constituency={constituency} result2021={result2021} />
    );
  }

  // Identity sources:
  //   governance → currentMLA; pre/live/post → 2021 winner (from historical-results).
  const name = governance ? currentMLA!.name : result2021?.winner.name;
  const partyId = governance ? currentMLA!.partyId : result2021?.winner.partyId;
  if (!name || !partyId) {
    return <VacantSeat constituency={constituency} result2021={result2021} />;
  }

  const party = getPartyById(partyId);
  const color = party?.color ?? '#546E7A';
  const margin = governance ? currentMLA!.marginVotes : (result2021?.marginVotes ?? null);
  const voteShare = governance ? currentMLA!.voteShare : (result2021?.winner.voteShare ?? null);
  const sourceUrl = governance ? currentMLA!.sourceUrl : undefined;

  return (
    <main className="min-h-screen pb-20 md:pb-12">
      {/* Hero */}
      <section
        className="border-b border-white/10 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 px-4 py-8 text-white"
        style={{ borderBottom: `3px solid ${color}` }}
      >
        <div className="mx-auto max-w-5xl">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-blue-200">
            <Link href="/" className="inline-flex items-center gap-1 hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" />
              Home
            </Link>
            <ChevronRight className="h-3 w-3 opacity-60" />
            <Link href={`/constituency/${constituency.id}`} className="hover:text-white">
              {constituency.name}
            </Link>
            <ChevronRight className="h-3 w-3 opacity-60" />
            <span className="text-white/80">MLA</span>
          </div>

          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <Avatar photoUrl={candidate?.photoUrl} name={name} color={color} />

            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-blue-200">
                <UserCheck className="h-3.5 w-3.5" />
                Sitting MLA · {termLabel}
              </div>
              <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">{name}</h1>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {party && (
                  <span
                    className="rounded px-2 py-0.5 text-xs font-bold"
                    style={{ backgroundColor: color, color: '#fff' }}
                  >
                    {party.abbreviation}
                  </span>
                )}
                <span className="text-blue-100/90">{party?.name}</span>
              </div>

              <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-blue-100">
                <MapPin className="h-4 w-4" />
                <Link href={`/constituency/${constituency.id}`} className="hover:text-white hover:underline">
                  {constituency.name}, {constituency.district}
                </Link>
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/80">
                  {constituency.reservation}
                </span>
              </p>

              {/* Ministry portfolios */}
              {minister && minister.portfolios.filter((p) => !p.to).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {minister.portfolios.filter((p) => !p.to).map((p) => (
                    <MinistryBadge key={`${p.ministry}-${p.from}`} portfolio={p} variant="full" />
                  ))}
                </div>
              )}

              {/* Margin chip */}
              {margin != null && (
                <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs">
                  <Trophy className="h-3.5 w-3.5 text-amber-300" />
                  <span>
                    Won {governance ? '2026' : '2021'} by{' '}
                    <span className="font-bold text-white">{margin.toLocaleString('en-IN')}</span> votes
                    {voteShare != null && (
                      <> · <span className="font-bold text-white">{voteShare.toFixed(1)}%</span> vote share</>
                    )}
                  </span>
                </p>
              )}

              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-[11px] text-blue-200 hover:text-white hover:underline"
                >
                  Source <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {/* Assembly performance */}
        <Section icon={<ScrollText className="h-4 w-4 text-blue-400" />} title={`Assembly performance · ${termLabel}`}>
          {record ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Attendance" value={pct(record.attendancePct)} note="of sessions" />
              <Stat label="Questions" value={record.questionsAsked?.toString() ?? '—'} note="asked" />
              <Stat label="Bills" value={record.billsIntroduced?.toString() ?? '—'} note="introduced" />
              <Stat label="Debates" value={record.debatesParticipated?.toString() ?? '—'} note="participated" />
            </div>
          ) : (
            <EmptyState
              icon={<Clock className="h-4 w-4 text-amber-400" />}
              title="Assembly performance data not available yet"
              detail={
                governance
                  ? 'Attendance, questions, and bills will populate here once the West Bengal assembly publishes session data via wbassembly.gov.in and PRS India.'
                  : 'Performance records for the prior term have not been compiled yet.'
              }
            />
          )}
          {record?.sourceUrl && (
            <a
              href={record.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-[11px] text-blue-400 hover:underline"
            >
              PRS India source <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </Section>

        {/* MLALADS funds */}
        <Section icon={<Wallet className="h-4 w-4 text-violet-400" />} title="MLALADS constituency funds">
          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500">Annual allocation</p>
                <p className="text-lg font-bold text-white">₹{MLALADS_ANNUAL_L} lakh</p>
                <p className="text-[11px] text-gray-500">per WB government norm</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Term total</p>
                <p className="text-lg font-bold text-white">
                  ₹{MLALADS_ANNUAL_L * MLALADS_TERM_YEARS / 100} Cr
                </p>
                <p className="text-[11px] text-gray-500">over {MLALADS_TERM_YEARS} years</p>
              </div>
            </div>
            <Link
              href="/funds"
              className="mt-4 inline-flex items-center gap-1 text-xs text-blue-400 hover:underline"
            >
              Compare across all ACs <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </Section>

        {/* Affidavit / background */}
        {candidate && (
          <Section icon={<FileText className="h-4 w-4 text-emerald-400" />} title="Candidate background (2026 ECI affidavit)">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <BgTile icon={<UserCheck className="h-3.5 w-3.5" />} label="Age" value={candidate.age?.toString() ?? '—'} />
              <BgTile icon={<GraduationCap className="h-3.5 w-3.5" />} label="Education" value={candidate.education ?? '—'} />
              <BgTile icon={<Briefcase className="h-3.5 w-3.5" />} label="Occupation" value={candidate.occupation ?? '—'} />
              <BgTile
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                label="Criminal cases"
                value={candidate.criminalCases.toString()}
                tone={candidate.criminalCases > 0 ? 'warn' : undefined}
              />
              <BgTile icon={<Scale className="h-3.5 w-3.5" />} label="Total assets" value={formatAssets(candidate.totalAssets)} />
              <BgTile
                icon={<Scale className="h-3.5 w-3.5" />}
                label="Liabilities"
                value={candidate.totalLiabilities > 0 ? formatAssets(candidate.totalLiabilities) : '—'}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Link
                href={`/candidate/${candidate.id}`}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-gray-300 hover:bg-white/10"
              >
                Full candidate profile <ChevronRight className="h-3 w-3" />
              </Link>
              {candidate.affidavitUrl && (
                <a
                  href={candidate.affidavitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-gray-300 hover:bg-white/10"
                >
                  ECI affidavit <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </Section>
        )}

        {/* Electoral history */}
        <Section icon={<History className="h-4 w-4 text-cyan-400" />} title="Electoral history">
          <div className="space-y-2">
            {result2026 && <HistoryRow year={2026} result={result2026} active />}
            {result2021 && <HistoryRow year={2021} result={result2021} />}
            {result2016 && <HistoryRow year={2016} result={result2016} />}
            {!result2026 && !result2021 && !result2016 && (
              <EmptyState
                icon={<Info className="h-4 w-4 text-gray-500" />}
                title="No historical results recorded"
                detail="Add via scripts/build-historical.js once the Lokdhaba CSV lands."
              />
            )}
          </div>
        </Section>

        {/* Local news */}
        <Section icon={<Newspaper className="h-4 w-4 text-amber-400" />} title="Local news & coverage">
          <ConstituencyNewsFeed constituencyId={constituency.id} />
        </Section>

        {/* Contact */}
        <Section icon={<Mail className="h-4 w-4 text-pink-400" />} title="Contact representative">
          <div className="flex flex-wrap gap-2 text-xs">
            <a
              href="https://wbassembly.gov.in/member-directory"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-gray-300 hover:bg-white/10"
            >
              <Globe className="h-3.5 w-3.5 text-blue-400" />
              wbassembly.gov.in member directory
            </a>
            <Link
              href={`/find-rep?ac=${constituency.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 font-medium text-blue-300 hover:bg-blue-500/20"
            >
              Report a civic issue <ChevronRight className="h-3 w-3" />
            </Link>
            {minister && (
              <Link
                href="/cabinet"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-gray-300 hover:bg-white/10"
              >
                <UserCheck className="h-3.5 w-3.5 text-violet-400" />
                Cabinet directory
              </Link>
            )}
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            For direct contact (phone, email, office), see the wbassembly.gov.in member directory.
          </p>
        </Section>
      </div>
    </main>
  );
}

// ─── components ──────────────────────────────────────────────────────────────

function Avatar({ photoUrl, name, color }: { photoUrl?: string; name: string; color: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  if (photoUrl) {
    return (
      <div
        className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-2 sm:h-28 sm:w-28"
        style={{ borderColor: color }}
      >
        <Image src={photoUrl} alt={name} fill sizes="112px" className="object-cover" />
      </div>
    );
  }
  return (
    <div
      className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border-2 text-2xl font-bold text-white sm:h-28 sm:w-28"
      style={{ borderColor: color, backgroundColor: `${color}33` }}
    >
      {initials}
    </div>
  );
}

function Section({
  icon, title, children,
}: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-center">
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-[11px] font-medium text-gray-400">{label}</p>
      {note && <p className="text-[10px] text-gray-500">{note}</p>}
    </div>
  );
}

function BgTile({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        {icon}
        {label}
      </div>
      <p className={`mt-1 text-sm font-bold ${tone === 'warn' ? 'text-amber-300' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function EmptyState({
  icon, title, detail,
}: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-dashed border-white/10 bg-black/10 px-3 py-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <p className="text-xs font-medium text-gray-200">{title}</p>
        <p className="mt-0.5 text-[11px] text-gray-500">{detail}</p>
      </div>
    </div>
  );
}

function HistoryRow({
  year, result, active = false,
}: {
  year: number;
  result: { winner: { name: string; partyId: string; partyAbbr: string; voteShare: number }; marginVotes: number };
  active?: boolean;
}) {
  const party = getPartyById(result.winner.partyId);
  const color = party?.color ?? '#546E7A';
  const hasVoteShare = typeof result.winner.voteShare === 'number' && result.winner.voteShare > 0;
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 ${
        active ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 bg-black/20'
      }`}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="w-12 shrink-0 text-center">
        <p className={`text-xs font-bold ${active ? 'text-emerald-300' : 'text-gray-400'}`}>{year}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{result.winner.name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: color }}>
            {party?.abbreviation ?? result.winner.partyAbbr}
          </span>
          {hasVoteShare && <span>{result.winner.voteShare.toFixed(1)}% vote share</span>}
          <span>
            {hasVoteShare ? '· ' : ''}margin {result.marginVotes.toLocaleString('en-IN')}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── vacant-seat fallback ────────────────────────────────────────────────────

function VacantSeat({
  constituency, result2021,
}: { constituency: { id: string; name: string; district: string }; result2021?: ReturnType<typeof getHistoricalResultForACYear> }) {
  return (
    <main className="min-h-screen pb-20 md:pb-12">
      <section className="border-b border-white/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4 py-10 text-white">
        <div className="mx-auto max-w-5xl">
          <Link href={`/constituency/${constituency.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-blue-200 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            {constituency.name}
          </Link>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{constituency.name} · MLA seat</h1>
          <p className="mt-2 inline-flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-sm text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            Seat currently vacant — outcome pending.
          </p>
          <p className="mt-3 max-w-2xl text-sm text-gray-400">
            No sitting MLA is recorded for this constituency yet. This typically happens during a by-election window or
            when the most recent result has not been certified.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {result2021 && (
          <Section icon={<History className="h-4 w-4 text-cyan-400" />} title="Previous incumbent (2021)">
            <HistoryRow year={2021} result={result2021} />
          </Section>
        )}
      </div>
    </main>
  );
}
