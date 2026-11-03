// What the front page and the live endpoint both need from a feed: the boards that are live, a sentence for each, and the colour each party wears.
//
// One module so the page's first render and every poll after it are the same function of the same file. A board whose election is declared is not live
// (the count is over), so it is left out here and nowhere else; a feed that is configured but unusable is an `error` that says what is wrong, because a
// page that quietly showed no board for a broken feed would look exactly like a quiet day.

import type { LiveBoard, LiveRead } from "./situation-types.ts";
import { liveSentence } from "./live-feed.ts";
import { fillFor } from "../viz/party-ink.ts";

export type LiveReply =
  | { state: "none" }
  | { state: "error"; error: string }
  | { state: "boards"; boards: LiveBoard[]; sentences: string[]; fills: Record<string, string> };

export function liveReply(feed: LiveRead): LiveReply {
  if (feed === null) return { state: "none" };
  if ("error" in feed) return { state: "error", error: feed.error };
  const boards = feed.boards.filter((b) => b.status !== "declared");
  if (boards.length === 0) return { state: "none" };
  const fills: Record<string, string> = {};
  for (const b of boards) {
    for (const p of b.parties) fills[p.party.key] = fillFor(p.party.key);
    for (const pr of b.projections) for (const r of pr.ranges) fills[r.party.key] = fillFor(r.party.key);
  }
  return { state: "boards", boards, sentences: boards.map(liveSentence), fills };
}
