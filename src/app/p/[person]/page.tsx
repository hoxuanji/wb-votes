import { notFound } from "next/navigation";
import type { PersonBrief } from "../../../../packages/mandate/src/repo/index.ts";
import type { Problem } from "../../../../packages/mandate/src/repo/envelope.ts";
import { personReply } from "../../../../packages/mandate/src/repo/envelope.ts";
import { personTitle } from "../../../../packages/mandate/src/repo/page-title.ts";
import { inr } from "../../../../packages/mandate/src/repo/brief.ts";
import { displayName } from "../../../../packages/mandate/src/repo/display-name.ts";
import { possibleSamePerson } from "../../../../packages/mandate/src/repo/person-links.ts";
import { personFinding, runColumns } from "../../../../packages/mandate/src/repo/person-story.ts";
import { readSeatField } from "../../../../packages/mandate/src/repo/seat-field.ts";
import { readSeatHistory } from "../../../../packages/mandate/src/repo/seat-history.ts";
import { readRegistry } from "../../../../packages/mandate/src/repo/session.ts";
import { Foot, Shell } from "../../../components/iei/Shell.tsx";
import { Finding } from "../../../components/iei/Finding.tsx";
import {
  AgainstWhom,
  AssemblyDetails,
  CareerRun,
  ContestField,
  DeclaredFacts,
  PersonIdentity,
  RecordTable,
  SameNote,
  SamePersonList,
} from "../../../components/iei/Person.tsx";
import { Crumbs, EmptyState, Panel, RegistryMissing } from "../../../components/iei/parts.tsx";
import "../../iei.css";

// Constraint 7: .data/ is gitignored, so this route can never be prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { person: string } }) {
  return { title: personTitle(params.person) };
}

/**
 * `/p/<person>` — one person, and everything the registry holds about them.
 *
 * The page reads through `personReply` — the same function `/v1/entity/person/[slug]` answers with — so there is exactly ONE place that opens
 * the registry for the person, and it is one webpack can follow: envelope.ts imports the repo layer statically. The previous cwd-relative
 * CommonJS loader here was not statically analysable, so webpack compiled the binding to `undefined` and every slug 500'd in a production build
 * (the guard test in brief.test.ts keeps it from coming back). Sharing personReply also means the HTML and the JSON can never disagree.
 *
 * ── WHAT THE REDESIGN IS ──
 *
 * It used to open with six equal tiles and then three tables: nothing said which fact mattered, a four-win career was a table, a person's
 * opponents were not links, and the turnout tile printed a figure the product withholds. It opens on one sentence now, computed from the
 * person's rows (repo/person-story.ts holds its eight rules and what each may not say); under it the seat's elections as columns with this
 * person marked in each and their margins on one scale, so a missing year or a declared margin is visibly a different kind of evidence; then
 * who they stood against, who else was on the ballot, the exact record, and what they declared. Every name is a way to the next person.
 *
 * The seat's history, the 2026 field and the doubt about who else may be the same person need the registry's other readers, so they are read
 * here beside the reply; a registry that cannot be read is the outage the reply would have reported.
 */

export default async function PersonBriefPage({ params }: { params: { person: string } }) {
  const slug = decodeURIComponent(params.person);
  const reply = await personReply(slug);
  if (reply.status === 404) notFound();
  // Any other non-200 is a problem document whose `detail` is written to be shown verbatim: a missing
  // database or an uncited record.
  if ("code" in reply.body) return <Unavailable problem={reply.body} />;
  const brief: PersonBrief = reply.body.data;

  const latest = brief.candidacies.at(0);
  const read = readRegistry((db) => ({
    history: latest === undefined ? null : readSeatHistory(db, latest.versionId),
    field: latest === undefined ? null : readSeatField(db, latest.versionId),
    same: possibleSamePerson(db, brief.person.id),
  }));
  if (!read.ok) {
    return (
      <Shell here="person" reading>
        <RegistryMissing />
      </Shell>
    );
  }
  const { history, field, same } = read.value;

  const name = displayName(brief.person.canonicalName);
  const finding = personFinding(brief, { history });
  const columns = latest === undefined || history === null ? [] : runColumns(brief, history, latest.versionId);
  const newest = field?.elections.find((e) => e.contestId === latest?.contestId);
  const canonical = brief.person.canonicalName.toLowerCase();
  const otherNames = [...new Set(brief.aliases.map((a) => a.name).filter((n) => n.toLowerCase() !== canonical))];
  // Where this person most recently stood, so the breadcrumb puts them somewhere rather than nowhere. A person is not IN the place tree: they
  // contest seats in it. A row with no contest has the seat it is recorded as sitting for, if any; a person with neither has no seat crumb.
  const seat = latest ?? brief.sitting ?? undefined;

  return (
    <Shell here="person" reading>
      <Crumbs
        trail={[
          { label: "India", href: "/" },
          ...(seat === undefined || seat.placeName === null ? [] : [{ label: seat.placeName, href: seat.placeHref ?? undefined }]),
          { label: name },
        ]}
      />
      <div className="iei-head">
        <p className="iei-eyebrow">Person</p>
        <h1 className="iei-answer" title={brief.person.canonicalName}>
          {name}
        </h1>
        <Finding finding={finding} />
        <PersonIdentity brief={brief} />
        {/* The other spellings sit UNDER the finding: one record carries 53 of them, and in the eyebrow they were two full lines above the name. */}
        {otherNames.length === 0 ? null : (
          <p className="iei-note">
            Also recorded as {otherNames.slice(0, 2).join(" · ")}
            {otherNames.length > 2 ? ` · and ${inr(otherNames.length - 2)} more spellings` : ""}
          </p>
        )}
        <SameNote same={same} />
      </div>

      {columns.length === 0 ? null : (
        <Panel id="run" title="The run" question="Where did this person stand, and how close was it?" sources={brief.sources}>
          <CareerRun columns={columns} name={name} />
        </Panel>
      )}
      {history === null ? null : <AgainstWhom history={history} brief={brief} />}
      {newest === undefined ? null : <ContestField election={newest} subjectId={brief.person.id} />}
      <RecordTable brief={brief} />
      <DeclaredFacts brief={brief} />
      <SamePersonList same={same} />
      <AssemblyDetails brief={brief} />

      <Foot />
    </Shell>
  );
}

function Unavailable({ problem }: { problem: Problem }) {
  return (
    <Shell here="person" reading>
      {problem.code === "registry-unavailable" ? <RegistryMissing /> : <EmptyState title={problem.title} detail={problem.detail} />}
    </Shell>
  );
}
