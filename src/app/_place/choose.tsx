import { Foot, Shell } from "../../components/iei/Shell.tsx";
import { Crumbs, DataList, DataRow, Panel } from "../../components/iei/parts.tsx";
import type { Apart, Place, SeatPlace } from "../../../packages/mandate/src/repo/place-resolve.ts";
import { placeIndex, tellApart } from "../../../packages/mandate/src/repo/place-resolve.ts";
import { bodyOfKind, stateHref } from "../../../packages/mandate/src/repo/routes.ts";
import { readRegistry } from "../../../packages/mandate/src/repo/session.ts";
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
 *
 * The entries are rows of the product's list, and not the small grey grid the district chooser uses: this page has one
 * job, to be chosen from, and a row that does not look like a link does it badly. What tells a row from the other is
 * also in its link, for a reader who hears the links out of their rows.
 */
export function Choose({ places: found }: { places: readonly Place[] }) {
  // A tie is between seats: a state or a district is named by its id and has nothing to tie with.
  const places = found.filter((p): p is SeatPlace => p.level === "seat");
  const [first] = places;
  if (first === undefined) return null;
  const bodies = new Set(places.map((p) => p.kind));
  const apart = tellApart(places);
  // The state as the registry names it, as every other page's trail does; its id only where the registry has no name.
  const named = readRegistry((db) => placeIndex(db).states.find((s) => s.id === first.stateId)?.name);
  return (
    <Shell here="place" reading>
      <Crumbs
        trail={[
          { label: "India", href: "/" },
          { label: (named.ok ? named.value : undefined) ?? first.stateId.toUpperCase(), href: stateHref(first.stateId) },
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
        <DataList label="Constituencies that share this name">
          {places.map((p, i) => {
            const { district, number } = apart[i] as Apart;
            const what = [bodyWord(bodyOfKind(p.kind)), district, number === null ? null : `no. ${number}`]
              .filter((part) => part !== null)
              .join(" · ");
            return (
              <DataRow
                key={p.versionId}
                href={p.href}
                title={
                  <>
                    {p.name}
                    <span className="iei-sr"> — {what}</span>
                  </>
                }
                detail={what}
              />
            );
          })}
        </DataList>
      </Panel>
      <Foot />
    </Shell>
  );
}
