import { Users, BookOpen, Home, MapPin, Info } from 'lucide-react';
import { getDemographicsForAC } from '@/data/demographics';

interface DemographicsPanelProps {
  constituencyId: string;
  className?: string;
}

function formatPopulation(n?: number): string {
  if (!n) return '—';
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `${(n / 100_000).toFixed(2)} L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatPct(n?: number, digits = 1): string {
  return typeof n === 'number' ? `${n.toFixed(digits)}%` : '—';
}

export function DemographicsPanel({ constituencyId, className = '' }: DemographicsPanelProps) {
  const d = getDemographicsForAC(constituencyId);

  if (!d || typeof d.population !== 'number') {
    return (
      <div className={`rounded-xl border border-dashed border-white/10 p-6 text-center ${className}`}>
        <Info className="mx-auto mb-2 h-6 w-6 text-gray-500" />
        <p className="text-sm text-gray-400">Demographic data unavailable for this constituency.</p>
      </div>
    );
  }

  const stats = [
    { icon: Users,    label: 'Population (district)', value: formatPopulation(d.population), accent: 'text-blue-300' },
    { icon: BookOpen, label: 'Literacy rate',         value: formatPct(d.literacyRate),       accent: 'text-emerald-300' },
    { icon: Users,    label: 'Sex ratio (F per 1000 M)', value: d.sexRatio?.toString() ?? '—', accent: 'text-pink-300' },
    { icon: Users,    label: 'SC population',         value: formatPct(d.scPct, 2),            accent: 'text-amber-300' },
    { icon: Users,    label: 'ST population',         value: formatPct(d.stPct, 2),            accent: 'text-amber-300' },
    { icon: Home,     label: 'Urban population',      value: formatPct(d.urbanPct),            accent: 'text-purple-300' },
  ];

  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <MapPin className="h-4 w-4 text-blue-400" />
          Constituency Demographics
        </h3>
        <span className="text-xs text-gray-500">Census {d.sourceYear}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map(({ icon: Icon, label, value, accent }) => (
          <div key={label} className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="mb-1 flex items-center gap-1.5">
              <Icon className={`h-3.5 w-3.5 ${accent}`} />
              <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
            </div>
            <p className={`text-lg font-bold ${accent}`}>{value}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 flex items-start gap-1.5 text-[11px] text-gray-500">
        <Info className="h-3 w-3 shrink-0 mt-0.5" />
        <span>
          {d.sourceNote
            ? `${d.sourceNote}. Figures are district-level; AC-level data will be added when ECI voter rolls are ingested.`
            : 'Figures reflect district-level Census 2011 data; AC-level data will be added when ECI voter rolls are ingested.'}
        </span>
      </p>
    </div>
  );
}
