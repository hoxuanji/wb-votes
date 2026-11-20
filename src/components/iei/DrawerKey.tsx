'use client';

import { useEffect } from 'react';

/**
 * Escape closes an open evidence drawer (`details.iei-ev`) and puts the keyboard back on its summary.
 *
 * A native <details> opens and closes with its summary, with no script, and still does: this only adds the key a reader expects of anything that
 * floats over the page. It acts on the drawer the keyboard is in or, failing that, the one that is open, and it leaves Escape alone when a drawer
 * is not open (so it never swallows the key from the search field, which CommandKey owns).
 */
export function DrawerKey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const active = document.activeElement;
      const within = active instanceof Element ? active.closest('details.iei-ev[open]') : null;
      const drawer = within ?? document.querySelector('details.iei-ev[open]');
      if (!(drawer instanceof HTMLDetailsElement)) return;
      drawer.open = false;
      const summary = drawer.querySelector('summary');
      if (summary instanceof HTMLElement) {
        summary.focus();
        // Some engines drop focus when the key's own default action runs after this handler; once more, after it has.
        window.setTimeout(() => {
          if (document.activeElement !== summary) summary.focus();
        }, 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return null;
}
