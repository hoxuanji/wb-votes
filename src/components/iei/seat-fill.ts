import { fillFor, NOT_HELD } from '../../../packages/mandate/src/viz/party-ink.ts';
import { SEQUENTIAL } from '../../../packages/mandate/src/repo/home.ts';
import type { MapMode } from '../../../packages/mandate/src/repo/map-selection.ts';
import type { ElectionSeat } from '../../../packages/mandate/src/repo/election-map.ts';

/**
 * What a seat looks like under each reading of the map: its fill, and the one line its hover card says.
 *
 * The map draws a seat as a polygon and the tile view draws it as a square, and the two have to agree about what a colour means, so
 * both read it from here. A seat is the same colour, and says the same thing when pointed at, in either shape.
 */

const IN = new Intl.NumberFormat('en-IN');

/** One decimal, and a real-but-small value never rounds away to nothing. */
function pct(v: number): string {
  if (v !== 0 && Number(v.toFixed(1)) === 0) return '<0.1%';
  return `${v.toFixed(1)}%`;
}

/**
 * The margin ramp: BRIGHTEST at the knife edge.
 *
 * Inverted deliberately, and it is the same argument `home.ts` makes for its own margin layer — a knife-edge
 * seat is the finding, so it has to be the loud mark. On a near-black surface the loud end of a sequential
 * ramp is its LIGHTEST step, not its darkest, so a tight seat gets `SEQUENTIAL`'s last entry and a safe seat
 * its first, which is dimmer and still a mark.
 */
function marginFill(marginPct: number | null): string {
  if (marginPct === null) return NOT_HELD;
  const t = Math.min(1, marginPct / 30);
  const i = Math.min(SEQUENTIAL.length - 1, Math.floor((1 - t) * SEQUENTIAL.length));
  return SEQUENTIAL[i] as string;
}

/** The fill for one seat under one encoding, and the reason it is that colour. */
export function seatFill(s: ElectionSeat, mode: MapMode): string {
  switch (mode) {
    case 'winners':
      return s.partyKey === null ? NOT_HELD : fillFor(s.partyKey);
    case 'runnerup':
      return s.runnerUpKey === null ? NOT_HELD : fillFor(s.runnerUpKey);
    case 'margin':
      return marginFill(s.marginPct);
    case 'flips':
      // A HOLD IS NOT A COLOUR. Only a seat that moved carries the gaining party's ink; a hold is the canvas,
      // and a seat whose boundary was redrawn is drawn as absent because it is neither a hold nor a flip.
      if (!s.comparable || s.flip === null) return NOT_HELD;
      return s.flip.changed && s.partyKey !== null ? fillFor(s.partyKey) : 'var(--iei-raised)';
  }
}

/**
 * The hover card: ONE line, and different per mode, because the mode is the question being asked.
 *
 * Short on purpose. The full result — winner, runner-up, both vote counts, turnout — is on the seat's own page, which the
 * seat is a link to, and the list beside the map gives it for the seats it shows.
 *
 * A figure is said for what it is. The margin is a percentage of the votes polled and sits beside a party's name, where it
 * reads as that party's vote share, so it says "won by" and "margin". Where it is not known the line says the votes, or that
 * there is no margin, and never a bare dash.
 */
export function seatTitle(s: ElectionSeat, mode: MapMode): string {
  const where = s.name.toUpperCase();
  if (s.partyLabel === null) return `${where} — no winner recorded`;
  switch (mode) {
    case 'winners':
      return `${where} — ${s.partyLabel}${s.marginPct === null ? '' : `, won by ${pct(s.marginPct)}`}`;
    case 'runnerup':
      return s.runnerUpLabel === null
        ? `${where} — no runner-up recorded`
        : `${where} — 2nd: ${s.runnerUpLabel}`;
    case 'margin': {
      const votes =
        s.marginVotes === null ? null : `${IN.format(s.marginVotes)} votes${s.marginBasis === 'declared' ? ' (declared)' : ''}`;
      if (votes === null) return `${where} — margin not reported`;
      return `${where} — ${s.marginPct === null ? votes : `${pct(s.marginPct)} margin, ${votes}`}`;
    }
    case 'flips':
      if (!s.comparable) return `${where} — boundary redrawn, not comparable`;
      if (s.flip === null) return `${where} — no comparison`;
      return s.flip.changed
        ? `${where} — ${s.flip.from.label} to ${s.partyLabel}`
        : `${where} — ${s.partyLabel} held`;
  }
}
