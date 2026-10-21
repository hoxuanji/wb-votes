import Link from "next/link";
import { Shell } from "../../components/iei/Shell.tsx";
import { Crumbs, Panel } from "../../components/iei/parts.tsx";
import type { Apart, Place, SeatPlace } from "../../../packages/mandate/src/repo/place-resolve.ts";
import { tellApart } from "../../../packages/mandate/src/repo/place-resolve.ts";
import { bodyOfKind, stateHref } from "../../../packages/mandate/src/repo/routes.ts";
import { bodyWord } from "../../../packages/mandate/src/core/election-kind.ts";
import "../iei.css";

/**
 * A NAME THAT MORE THAN ONE SEAT ANSWERS TO, and the page that asks which.
 *
 * The resolver returns `many` rather than cutting a tie to its first row, and this is where that goes: answering with
 * either seat would be the silent substitution the whole route architecture exists to prevent.
 *
 * The old pre-body URL meant an assembly seat and a Lok Sabha seat of one name, and its sentence says so. A tie
 * that is not exactly that — two assembly seats of one name, or three seats — gets a sentence that does not claim
 * a difference in body it has not got.
 *
 * Each entry links to its place's own address. Two seats of one body that share a name are addressed by their
 * registry id, so those entries are two links to two seats and not two links back to this page. They would also read
 * alike, so each says its district, and its seat number where its district is not enough (`tellApart`); an entry
 * that a name or a body already tells from the rest says only its body.
 */
export function Choose({ places: found }: { places: readonly Place[] }) {
  // A tie is between seats: a state or a district is named by its id and has nothing to tie with.
  const places = found.filter((p): p is SeatPlace => p.level === "seat");
  const [first] = places;
  if (first === undefined) return null;
  const bodies = new Set(places.map((p) => p.kind));
  const apart = tellApart(places);
  return (
    <Shell here="place" reading>
      <Crumbs
        trail={[
          { label: "India", href: "/" },
          { label: first.stateId.toUpperCase(), href: stateHref(first.stateId) },
          { label: first.name },
        ]}
      />
      <div className="iei-head">
        <p className="iei-eyebrow">
          {places.length === 2 ? "Two constituencies share this name" : `${places.length} constituencies share this name`}
        </p>
        <h1 className="iei-answer">{first.name}</h1>
        <p className="iei-sub">
          {places.length === 2 && bodies.size === 2
            ? "One elects a member of the state assembly, the other a member of the Lok Sabha. They cover different territory and different electorates."
            : "They are different seats, and the name alone does not say which you meant."}
        </p>
      </div>
      <Panel title="Which did you mean?">
        <ul className="iei-district-list">
          {places.map((p, i) => {
            const { district, number } = apart[i] as Apart;
            return (
              <li key={p.versionId}>
                <Link href={p.href}>
                  {p.name}
                  <b>
                    {[bodyWord(bodyOfKind(p.kind)), district, number === null ? null : `no. ${number}`]
                      .filter((part) => part !== null)
                      .join(" · ")}
                  </b>
                </Link>
              </li>
            );
          })}
        </ul>
      </Panel>
    </Shell>
  );
}
