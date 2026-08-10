// The /pl index: a signpost to the MANDATE surfaces, which cycles 1–3 built beside the old app under
// a strangler-fig rule (never edit an old file), so nothing linked to them and they were unreachable.
//
// Under src/app/pl/**, which is the only place this cycle may add a page, and an <article> inside the
// root layout's <main> like every other page here — a second <main> would give the document two main
// landmarks. Classes come from mandate.css + place.css via src/app/pl/layout.tsx: no inline hexes,
// because a third copy of the token block is a third palette that drifts.
//
// ponytail: a static list and no registry read. Each surface below reports its own registry state,
// and a count query here bought one more DatabaseSync handle to leak. Delete the whole file when the
// new shell (§5) has real navigation.

import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const surfaces: { href: string; label: string; floor: string; replaces: string }[] = [
  {
    href: "/p/mamata-banerjee-4a681f",
    label: "Person Brief — Mamata Banerjee",
    floor: "Floor 1 · Brief",
    replaces: "/candidate/[id] and /mla/[id]",
  },
  {
    href: "/p/abhijit-roy-164bf1",
    label: "Person Brief — a three-election career",
    floor: "Floor 1 · Brief",
    replaces: "/candidate/[id]",
  },
  {
    href: "/pl/wb",
    label: "Place Brief — West Bengal, 294 seats across 23 districts",
    floor: "Floor 1 · Brief",
    replaces: "/assembly",
  },
  {
    href: "/pl/wb/cooch-behar/mekliganj",
    label: "Place Brief — Mekliganj",
    floor: "Floor 1 · Brief",
    replaces: "/constituency/[id]",
  },
  {
    href: "/pl/wb/cooch-behar/mekliganj/analysis",
    label: "Place Analysis — Mekliganj, four elections, server-rendered charts",
    floor: "Floor 2 · Analysis",
    replaces: "/results",
  },
  {
    href: "/v1/entity/person/mamata-banerjee-4a681f",
    label: "API — person entity, with its sources[]",
    floor: "API",
    replaces: "/api/candidates/[id]",
  },
  {
    href: "/v1/search?q=%E0%A6%AE%E0%A6%AE%E0%A6%A4%E0%A6%BE",
    label: "API — search for “মমতা” (Bengali resolves to the same people as “Mamata”)",
    floor: "API",
    replaces: "— new",
  },
];

/**
 * The jurisdiction picker in the chrome submits here as a plain GET (`/pl?to=wb`), because a native
 * <select> with no JavaScript cannot navigate on its own. Turning that parameter into a real URL is this
 * route's job; an unknown or absent value just renders the index rather than erroring, so a hand-edited
 * query string cannot produce a broken page.
 */
export default function MandateIndex({ searchParams }: { searchParams?: { to?: string } }) {
  const to = searchParams?.to;
  if (to !== undefined && /^[a-z]{2}$/.test(to)) redirect(`/pl/${to}`);

  return (
    <article className="wrap">
      <p className="eyebrow">Mandate · build index</p>
      <h1 className="name">The new surfaces, reachable.</h1>
      <p className="verdict">
        The old WB Votes app is untouched and still serves every one of its routes. These are the
        MANDATE surfaces built beside it.
      </p>
      <ul className="srcs">
        {surfaces.map((s) => (
          <li key={s.href}>
            <span className="unit">{s.floor}</span>
            <a className="body-link" href={s.href}>
              {s.label}
            </a>
            <span className="note"> replaces {s.replaces}</span>
          </li>
        ))}
      </ul>
      <p className="foot">
        Every figure on these pages is recorded as provisional: 2,924 of the registry&rsquo;s 2,932
        sources were never fetched, only asserted by their publisher, and each page says so where its
        numbers are. A page whose registry is not built says that too, with the command that builds
        it. The old app: <a className="body-link" href="/">WB Votes home</a>.
      </p>
    </article>
  );
}
