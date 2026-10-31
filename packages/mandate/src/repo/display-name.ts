// A person's name as a page prints it. The registry stores what the source printed, and 3,338 of 6,167 names are ALL CAPS, which a list of
// people cannot print as it is. This is display only: the stored name never changes, and a link keeps the registry's spelling in its title.

/** "S/O ...", "D/O ...", "W/O ...", "C/O ...": the source sometimes appends the candidate's parentage to the name. */
const PARENTAGE = /\s+[SDWC]\/O\b.*$/i;

const LETTERS = /[A-Za-z]+/g;

/**
 * The name for display: an ALL CAPS name in Title Case, parentage cut, never reordered, never empty.
 *
 * A name with any lower-case letter is left as it is, because the source's own casing is better evidence than a rule. Every run of
 * letters is capitalised on its own, so "DR. MD. FAZLE HAQUE" is "Dr. Md. Fazle Haque" and "MD.NASIRUDDIN" is "Md.Nasiruddin".
 */
export function displayName(raw: string): string {
  const name = raw.replace(PARENTAGE, "").trim();
  if (name === "") return raw;
  if (/[a-z]/.test(name)) return name;
  return name.replace(LETTERS, (w) => w[0]! + w.slice(1).toLowerCase());
}
