import Link from 'next/link';
import { Scale, ExternalLink, Mail } from 'lucide-react';

// Minimal inline SVGs for social platforms not in lucide
function IconInstagram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconX({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L2.02 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="mt-0 border-t border-white/10 bg-[#050a15] pb-20 md:pb-0">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Brand */}
          <div>
            <div className="mb-2 flex items-center gap-2 font-bold text-white">
              <Scale className="h-5 w-5 text-blue-400" />
              <span>WB Votes</span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              An independent, non-partisan voter information tool for West Bengal Assembly Elections 2026.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-200">Quick Links</h3>
            <ul className="space-y-1 text-sm text-gray-400">
              {[
                { href: '/',            label: 'Constituency Finder' },
                { href: '/candidates',  label: 'All Candidates' },
                { href: '/quiz',        label: 'Voter Quiz' },
                { href: '/compare',     label: 'Compare Candidates' },
                { href: '/methodology', label: 'Methodology & Sources' },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="inline-block py-1 transition-colors duration-150 hover:text-blue-400 active:text-blue-300"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Official Sources */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-200">Official Sources</h3>
            <ul className="space-y-1 text-sm text-gray-400">
              {[
                { href: 'https://www.eci.gov.in',       label: 'Election Commission of India' },
                { href: 'https://myneta.info',           label: 'MyNeta.info (ADR)' },
                { href: 'https://affidavit.eci.gov.in', label: 'ECI Affidavit Portal' },
              ].map(({ href, label }) => (
                <li key={href}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 py-1 transition-colors duration-150 hover:text-blue-400 active:text-blue-300"
                  >
                    {label} <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Legal */}
        <div className="mt-8 border-t border-white/10 pt-6 text-center text-xs text-gray-500">
          <p>Data sourced from publicly available ECI affidavits and ADR/MyNeta.info datasets. All candidate information is self-declared.</p>
          <p className="mt-1">© {new Date().getFullYear()} WB Votes · Open source under MIT License · Not affiliated with ECI or any political party.</p>
        </div>

        {/* Developer contact */}
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="text-xs text-gray-500">
            Built by <span className="font-medium text-gray-400">Jeemut Jana</span> · Feedback, bugs, or suggestions?
          </p>
          <div className="flex items-center justify-center gap-1" role="list" aria-label="Developer contact">
            <a
              href="mailto:jeemutjana98@gmail.com"
              role="listitem"
              aria-label="Email the developer"
              className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 transition-all duration-150 hover:text-gray-300 active:scale-95 active:text-gray-200 active:bg-white/10"
            >
              <Mail className="h-[18px] w-[18px]" />
            </a>
            <a
              href="https://www.instagram.com/jeemut_/"
              target="_blank"
              rel="noopener noreferrer"
              role="listitem"
              aria-label="Instagram"
              className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 transition-all duration-150 hover:text-gray-300 active:scale-95 active:text-gray-200 active:bg-white/10"
            >
              <IconInstagram className="h-[18px] w-[18px]" />
            </a>
            <a
              href="https://x.com/jana_jeemut"
              target="_blank"
              rel="noopener noreferrer"
              role="listitem"
              aria-label="X (Twitter)"
              className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 transition-all duration-150 hover:text-gray-300 active:scale-95 active:text-gray-200 active:bg-white/10"
            >
              <IconX className="h-[18px] w-[18px]" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
