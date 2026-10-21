import { follow } from '../_place/follow.tsx';
import { legacyTarget } from '../../../packages/mandate/src/repo/legacy.ts';

/**
 * `/candidates` -> `/search`.
 *
 * The old page listed candidates behind a constituency filter. Search answers the same need without
 * a 2,920-row list, and it is transliteration-aware, which the old filter was not.
 *
 * No registry read, so no try/catch and no dynamic flag: this one is a constant.
 */

export default function LegacyCandidates() {
  return follow(legacyTarget({ route: 'candidates' }));
}
