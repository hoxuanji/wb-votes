'use client';

import { useEffect, useState } from 'react';
import { THEME_KEY, type ThemeChoice } from './theme.ts';

/**
 * System → Light → Dark → System. The page follows the system until the reader chooses; the choice is kept in localStorage and applied
 * before first paint by THEME_INIT (theme.ts), so this component only has to write it and show it.
 *
 * It renders the 'system' state on the server and reads the saved one after mount, so the first client render matches the HTML; the
 * glyph can change once, after hydration, for a reader who chose.
 */

const ORDER: readonly ThemeChoice[] = ['system', 'light', 'dark'];
const WORD: Record<ThemeChoice, string> = { system: 'System', light: 'Light', dark: 'Dark' };

function readSaved(): ThemeChoice {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage is blocked: the choice holds for this page and is forgotten on the next, which is the best this reader's browser allows.
  }
}

/** One 16-unit glyph per state. Stroke, not fill: it takes the button's colour in every theme and in forced-colors. */
function Glyph({ choice }: { choice: ThemeChoice }) {
  const common = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true } as const;
  if (choice === 'light') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" strokeLinecap="round" />
      </svg>
    );
  }
  if (choice === 'dark') {
    return (
      <svg {...common}>
        <path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1.5" />
      <path d="M5.5 13.75h5" strokeLinecap="round" />
    </svg>
  );
}

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>('system');
  useEffect(() => setChoice(readSaved()), []);

  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length] as ThemeChoice;
  return (
    <button
      type="button"
      className="iei-theme"
      onClick={() => {
        const swap = (): void => {
          apply(next);
          setChoice(next);
        };
        // A cross-fade between the two themes where the browser can do one, and an instant swap where it cannot or the reader asked for no motion.
        // Done in script rather than CSS: motion.test.ts holds every CSS animation inside `prefers-reduced-motion: no-preference`, and this way
        // there is no animation declared outside it to hold.
        const withTransition = (document as Document & { startViewTransition?: (update: () => void) => unknown }).startViewTransition;
        if (typeof withTransition === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) withTransition.call(document, swap);
        else swap();
      }}
      aria-label={`Colour theme: ${WORD[choice]}. Switch to ${WORD[next]}.`}
      title={`Theme: ${WORD[choice]}`}
    >
      <Glyph choice={choice} />
    </button>
  );
}
