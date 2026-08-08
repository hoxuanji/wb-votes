import { permanentRedirect } from 'next/navigation';

/**
 * `/candidates` -> `/search`.
 *
 * The old page listed candidates behind a constituency filter. Search answers the same need without
 * a 2,920-row list, and it is transliteration-aware, which the old filter was not.
 *
 * No registry read, so no try/catch and no dynamic flag: this one is a constant.
 */

export default function LegacyCandidates() {
  permanentRedirect('/search');
}
