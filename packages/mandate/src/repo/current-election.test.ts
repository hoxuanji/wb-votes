// `currentElection`: the newest full-house election of a body, optionally within one jurisdiction.
//
// Hand-built, because the live registry cannot show the cases that matter: it holds one election in 2005 per
// state, no assembly whose newest row is a by-election, and nothing that would catch a ranking by id. The rule
// itself — `currentIds` — is tested against a bare table in core/election-kind.test.ts; this is the verb on
// the real schema, where `seatsContested` has contests to count.

import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { currentElection } from "./elections.ts";

function fixture(): DatabaseSync {
  const d = open(":memory:");
  migrate(d, "2026-08-12T00:00:00.000Z");
  d.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka','state','Karnataka','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('br','state','Bihar','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb','state','West Bengal','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka.ac.001','ac','SEAT A','ka');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka.ac.002','ac','SEAT B','ka');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
      VALUES (1,'ka.ac.001','ka','ac','e1',1,'SEAT A','general');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
      VALUES (2,'ka.ac.002','ka','ac','e1',2,'SEAT B','general');
  `);
  const election = d.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year,
                           polling_month, occurrence)
     VALUES (?, ?, ?, ?, 'e1', ?, 'declared', ?, ?, ?, ?)`,
  );
  const contest = d.prepare(
    `INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`,
  );
  // Karnataka: a by-election NEWER than the assembly election must not become the current one.
  election.run("ka-assembly-2018", "assembly", "state", "ka", "KA 2018", "ac", 2018, 5, 1);
  election.run("ka-bypoll-ae-2021", "bypoll", "state", "ka", "KA bypoll 2021", "ac", 2021, null, 1);
  contest.run("c1", "ka-assembly-2018", 1);
  contest.run("c2", "ka-assembly-2018", 2);
  contest.run("c3", "ka-bypoll-ae-2021", 1);
  // Bihar 2005 held two. The October election is current, though its id sorts below February's.
  election.run("br-assembly-2005-a", "assembly", "state", "br", "BR Oct 2005", "ac", 2005, 10, 2);
  election.run("br-assembly-2005-z", "assembly", "state", "br", "BR Feb 2005", "ac", 2005, 2, 1);
  // West Bengal has a by-election and nothing else.
  election.run("wb-bypoll-ae-2021", "bypoll", "state", "wb", "WB bypoll 2021", "ac", 2021, null, 1);
  // The Lok Sabha belongs to the union, and a parliamentary by-election in a state is not it.
  election.run("ls-2019", "general", "union", "in", "LS 2019", "pc", 2019, 4, 1);
  election.run("ls-2024", "general", "union", "in", "LS 2024", "pc", 2024, 4, 1);
  election.run("ka-bypoll-ge-2025", "bypoll", "state", "ka", "KA LS bypoll 2025", "pc", 2025, null, 1);
  contest.run("c4", "ls-2024", 1);
  return d;
}

test("currentElection: a jurisdiction's own current election, never a newer by-election", () => {
  const d = fixture();
  try {
    // Spread: node:sqlite rows have a null prototype, which a strict deepEqual refuses to equate.
    assert.deepEqual({ ...currentElection(d, "assembly", "ka") }, {
      id: "ka-assembly-2018",
      jurisdictionId: "ka",
      year: 2018,
      seatsContested: 2,
    });
  } finally {
    d.close();
  }
});

test("currentElection: the later of two elections in a year is the current one, whatever the ids say", () => {
  const d = fixture();
  try {
    assert.equal(currentElection(d, "assembly", "br")?.id, "br-assembly-2005-a");
  } finally {
    d.close();
  }
});

test("currentElection: null where the body has no full-house election in that scope", () => {
  const d = fixture();
  try {
    assert.equal(currentElection(d, "assembly", "wb"), null, "only a by-election");
    assert.equal(currentElection(d, "assembly", "nowhere"), null, "no such jurisdiction");
    assert.equal(currentElection(d, "lok-sabha", "ka"), null, "the general election belongs to the union");
  } finally {
    d.close();
  }
});

test("currentElection: with no scope it is the newest current election of the body", () => {
  const d = fixture();
  try {
    assert.equal(currentElection(d, "assembly")?.id, "ka-assembly-2018", "Karnataka 2018 over Bihar 2005");
    assert.deepEqual({ ...currentElection(d, "lok-sabha") }, {
      id: "ls-2024",
      jurisdictionId: "in",
      year: 2024,
      seatsContested: 1,
    });
  } finally {
    d.close();
  }
});

test("currentElection: an empty registry has no current election", () => {
  const d = open(":memory:");
  migrate(d, "2026-08-12T00:00:00.000Z");
  try {
    assert.equal(currentElection(d, "assembly"), null);
    assert.equal(currentElection(d, "lok-sabha"), null);
  } finally {
    d.close();
  }
});
