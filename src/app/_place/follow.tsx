import { notFound, permanentRedirect, redirect } from 'next/navigation';
import type { LegacyTarget } from '../../../packages/mandate/src/repo/legacy.ts';
import { Choose } from './choose.tsx';

/**
 * Do what a legacy route was told: redirect, ask which seat was meant, or 404.
 *
 * Every legacy page is `follow(legacyTarget(...))`, so what a route does about a miss is decided in legacy.ts, where a
 * test can see it, and not in a page file where only a render can. `permanentRedirect` and `redirect` throw Next's
 * control-flow errors rather than returning, so only `choose` produces markup.
 */
export function follow(target: LegacyTarget) {
  if (target.kind === 'not-found') notFound();
  if (target.kind === 'choose') return <Choose places={target.places} />;
  return target.permanent ? permanentRedirect(target.to) : redirect(target.to);
}
