'use client';

import { useEffect } from 'react';

/**
 * ⌘K / Ctrl-K focuses the header's search field. Twenty lines of client JavaScript, and the only
 * client JavaScript in the shell.
 *
 * WHY NOT A MODAL. The legacy app has one — `components/GlobalSearch.tsx`, a full palette with its own
 * overlay, result list and fetch — and it still works on the routes that mount it; this does not touch it.
 * What the intelligence shell needs is smaller: the search field is already in the chrome, already a real
 * `<form method="get">` that works with JavaScript off, and already linkable. A palette would replace a
 * working control with a copy of it that needs a network round trip to show what a keystroke already can.
 *
 * The shortcut is an ENHANCEMENT, never the only way in. Nothing here is required for search to work.
 */
export function CommandKey({ target }: { target: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = document.getElementById(target);
      if (!(el instanceof HTMLInputElement)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        el.focus();
        el.select();
        return;
      }
      // Escape returns the keyboard to the page rather than trapping it in the field.
      if (e.key === 'Escape' && document.activeElement === el) el.blur();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target]);
  return null;
}
