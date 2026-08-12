import { notFound } from "next/navigation";
import Link from "next/link";
import type { PersonBrief } from "../../../../packages/mandate/src/repo/index.ts";
import type { Problem } from "../../../../packages/mandate/src/repo/envelope.ts";
import { personReply } from "../../../../packages/mandate/src/repo/envelope.ts";
import {
  deltas,
  headline,
  inr,
  isDecided,
  isoDay,
  marginText,
  tiles,
  won,
} from "../../../../packages/mandate/src/repo/brief.ts";
import { Shell } from "../../../components/iei/Shell.tsx";
import {
  Crumbs,
  EmptyState,
  Metric,
  Metrics,
  Panel,
  RegistryMissing,
  Table,
  Value,
} from "../../../components/iei/parts.tsx";
import "../../iei.css";

// Constraint 7: .data/ is gitignored, so this route can never be prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `/p/<person>` — one person, and everything the registry holds about them.
 *
 * The page reads through `personReply` — the same function `/v1/entity/person/[slug]` answers with — so there
 * is exactly ONE place that opens the registry, and it is the one webpack survives: envelope.ts loads it with
 * an `import(/* webpackIgnore: true *\/ ...)` of an absolute file URL, which webpack leaves alone. The
 * previous cwd-relative CommonJS loader here was not statically analysable, so webpack compiled the binding
 * to `undefined` and every slug 500'd in a production build (the guard test in brief.test.ts keeps it from
 * coming back). Sharing personReply also means the HTML and the JSON can never disagree about a figure.
 *
 * WHAT PHASE 2.5 CHANGED. It wears the product's chrome, uses the product's primitives, and its provenance is
 * a drawer. It used to open with an eyebrow reading "Mandate · person brief" — the internal name of a build
 * cycle — followed by a five-clause paragraph about how many of its sources had been fetched, above the
 * numbers, before the reader had seen a single figure. Below that, each of six tiles carried its own visible
 * source label, and the page ended in a list of every source again. The provenance is all still here, in the
 * `ⓘ` in each panel header. What changed is that the person is the first thing on the page about the person.
 */

export default async function PersonBriefPage({ params }: { params: { person: string } }) {
  const slug = decodeURIComponent(params.person);
  const reply = await personReply(slug);
  if (reply.status === 404) notFound();
  // Any other non-200 is a problem document whose `detail` is written to be shown verbatim: a missing
  // database, a server that shipped without packages/mandate, or an uncited record.
  if ("code" in reply.body) return <Unavailable problem={reply.body} />;
  const brief: PersonBrief = reply.body.data;

  const trail = brief.affidavitTrail;
  const rows = deltas(trail);
  const canonical = brief.person.canonicalName.toLowerCase();
  const otherNames = [
    ...new Set(brief.aliases.map((a) => a.name).filter((n) => n.toLowerCase() !== canonical)),
  ];
  // Where this person most recently stood, so the breadcrumb puts them somewhere rather than nowhere. A
  // person is not IN the place tree — they contest seats in it — so the trail ends at the seat and the
  // person's own name is the leaf.
  const latest = brief.candidacies.at(0);

  return (
    <Shell here="person" reading>
      <Crumbs
        trail={[
          { label: "India", href: "/" },
          ...(latest === undefined || latest.placeName === null
            ? []
            : [{ label: latest.placeName, href: undefined }]),
          { label: brief.person.canonicalName },
        ]}
      />
      <div className="iei-head">
        <p className="iei-eyebrow">Person</p>
        <h1 className="iei-answer">{brief.person.canonicalName}</h1>
        <p className="iei-sub">{headline(brief)}</p>
        {/* The other spellings, UNDER the headline rather than in the eyebrow. One record here carries 53 of
            them, and putting the first three in a 9.5px uppercase eyebrow made two full lines of aliases the
            first thing on the page — above the person's own name. */}
        {otherNames.length === 0 ? null : (
          <p className="iei-note">
            Also recorded as {otherNames.slice(0, 2).join(" · ")}
            {otherNames.length > 2 ? ` · and ${inr(otherNames.length - 2)} more spellings` : ""}
          </p>
        )}
      </div>

      <Panel
        title="What the numbers say"
        question="Declared figures and the record behind them"
        basis="measured"
        sources={brief.sources}
      >
        <Metrics>
          {tiles(brief).map((t) => (
            <Metric
              key={t.label}
              label={t.label}
              text={t.value}
              unit={t.unit ?? undefined}
              hint={t.note}
              sources={t.source === null ? undefined : [t.source]}
            />
          ))}
        </Metrics>
      </Panel>

      {brief.candidacies.length === 0 ? null : (
        <Panel title="Career" question="Every contest on record, newest first" basis="measured">
          <Table
            label="Career"
            caption={`${inr(brief.candidacies.length)} contest${brief.candidacies.length === 1 ? "" : "s"} on record. The seat links to its brief.`}
            captionVisible
            tight={brief.candidacies.length > 12}
            // 194 contests is a real record in this registry, and without its own scroll region it makes a
            // 4,500px document out of one table.
            tall={brief.candidacies.length > 24}
            head={
              <>
                <th scope="col" className="iei-n">
                  Year
                </th>
                <th scope="col">Seat</th>
                <th scope="col">Party</th>
                <th scope="col">Result</th>
                <th scope="col" className="iei-n">
                  Votes
                </th>
                <th scope="col" className="iei-n">
                  Share
                </th>
                <th scope="col" className="iei-n">
                  Margin
                </th>
              </>
            }
          >
            {brief.candidacies.map((c) => {
              const decided = isDecided(c);
              return (
                <tr key={`${c.contestId}-${c.electionId}`}>
                  <th scope="row">{c.year}</th>
                  <td>
                    {c.placeName}
                    {c.placeNumber !== null && <span className="iei-of"> no. {c.placeNumber}</span>}
                  </td>
                  <td>
                    <Party short={c.partyShortName} symbol={c.partySymbolRef} />
                  </td>
                  <td className={won(c) ? "iei-up" : undefined}>
                    {won(c) ? "Won" : decided ? "Lost" : <span className="iei-absent">no result declared</span>}
                    {decided && !won(c) && c.rank !== null && <span className="iei-rule">rank {c.rank}</span>}
                  </td>
                  <td className="iei-n">
                    <Value value={c.votes} absent="not reported" />
                  </td>
                  <td className="iei-n">
                    <Value value={c.voteShare} unit="%" decimals={1} absent="not reported" />
                  </td>
                  <td className="iei-n">
                    {marginText(c.margin, won(c)) ?? <Value value={null} absent="not reported" />}
                  </td>
                </tr>
              );
            })}
          </Table>
        </Panel>
      )}

      <Panel
        title="Affidavit trail"
        question="What was declared to the returning officer, and when"
        basis="measured"
        note={
          rows.length === 0
            ? undefined
            : "Self-declared, as filed. A pending-case count is a count and nothing more: the source records no stage, no court and no outcome."
        }
      >
        {rows.length === 0 ? (
          <p className="iei-note">
            No affidavit filing for this person is in the registry, so there is no declared-assets figure to
            report.
          </p>
        ) : (
          <Table
            label="Affidavit trail"
            caption={
              `${inr(trail.length)} filing${trail.length === 1 ? "" : "s"} from ` +
              `${inr(new Set(trail.map((t) => t.sourceId)).size)} affidavit source${new Set(trail.map((t) => t.sourceId)).size === 1 ? "" : "s"}, oldest first.` +
              (trail.length === 1 ? " One filing, so no change between filings is computable." : "")
            }
            captionVisible
            head={
              <>
                <th scope="col">Field</th>
                {trail.map((t) => (
                  <th scope="col" className="iei-n" key={t.year}>
                    {t.year}
                    {t.filedOn !== null && t.filedOn !== "" && <span className="iei-rule">{t.filedOn}</span>}
                  </th>
                ))}
                {trail.length > 1 && (
                  <th scope="col" className="iei-n">
                    Change
                  </th>
                )}
              </>
            }
          >
            {rows.map((r) => (
              <tr key={r.field}>
                <th scope="row">{r.field}</th>
                {trail.map((t) => {
                  const cell = r.cells.find((c) => c.year === t.year);
                  return (
                    <td className="iei-n" key={t.year}>
                      {cell === undefined ? <Value value={null} absent="not reported" /> : cell.text}
                    </td>
                  );
                })}
                {trail.length > 1 && (
                  <td className="iei-n">{r.change ?? <Value value={null} absent="not reported" />}</td>
                )}
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      {brief.mergeProvenance.length === 0 ? null : (
        <Panel
          title="How this record was assembled"
          question="Which rows were merged into this person, and on whose decision?"
          basis="measured"
        >
          <Table
            label="Merge provenance"
            caption={
              `This person row absorbed ${inr(brief.mergeProvenance.length)} other row${brief.mergeProvenance.length === 1 ? "" : "s"} ` +
              `during entity resolution. Each merge is reversible with npm run mandate -- unmerge.`
            }
            captionVisible
            head={
              <>
                <th scope="col">Absorbed row</th>
                <th scope="col" className="iei-n">
                  Score
                </th>
                <th scope="col">Decided by</th>
                <th scope="col">When</th>
              </>
            }
          >
            {brief.mergeProvenance.map((m) => (
              <tr key={m.mergeId}>
                <th scope="row">{m.absorbedId}</th>
                <td className="iei-n">
                  <Value value={m.score} decimals={2} absent="not scored" />
                </td>
                <td>{m.decidedBy}</td>
                <td>{isoDay(m.decidedAt)}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}

      <footer className="iei-foot">
        {/* ONE EVIDENCE AFFORDANCE PER FACT, and the panels above own them. This used to repeat the whole
            source list here as well, plus a paragraph explaining the ⓘ — a mechanism described in prose on
            every page is the scattering this consolidation removes, and the drawer teaches itself. */}
        <p>
          What this registry holds and does not: <Link href="/coverage">/coverage</Link>.
        </p>
      </footer>
    </Shell>
  );
}

/**
 * Party identity: the short name, with the symbol mark where the source recorded a different one.
 *
 * NO PER-PAGE PARTY COLOUR. The previous version tinted the first three parties on the page from its own
 * three-hue palette, which meant BJP was one colour on a person page, a different one on the national map
 * (where hue is assigned by jurisdictions governed) and a third on the next person page whose party order
 * differed. A party wears one hue in this product, assigned once in repo/home.ts, and a page that cannot
 * reach that assignment shows no hue rather than inventing one.
 */
function Party({ short, symbol }: { short: string | null; symbol: string | null }) {
  if (short === null) return <span className="iei-absent">party not recorded</span>;
  return (
    <span className="iei-chip">
      {symbol !== null && symbol.toUpperCase() !== short.toUpperCase() && (
        <span className="iei-of">{symbol.toUpperCase()} </span>
      )}
      {short}
    </span>
  );
}

function Unavailable({ problem }: { problem: Problem }) {
  return (
    <Shell here="person" reading>
      {problem.code === "registry-unavailable" ? (
        <RegistryMissing />
      ) : (
        <EmptyState title={problem.title} detail={problem.detail} />
      )}
    </Shell>
  );
}
