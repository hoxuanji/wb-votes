# wb-votes

A registry of Indian elections in which every figure carries its source. This glossary holds the words the product uses for what an election is, how elections are ordered, and what a seat's result is.

## Language

### What an election is

**Body**:
The house an election chose members for: an assembly or the Lok Sabha. A constituency has a body too, the one it sends its member to.

**Fill**:
Whether an election filled its whole body (general) or only a few vacant seats (a by-election). No other category of election matters to what the product shows.
_Avoid_: Election kind

**Full-house election**:
An election that fills its whole body, so the fill is general. A by-election is never one, and only a full-house election has a majority.
_Avoid_: General election, which also names a Lok Sabha election

**Type label**:
The long wording of an election's body and fill, such as "Assembly Election" or "Lok Sabha By-election".
_Avoid_: Election type

**Chip**:
The short wording of an election in a year picker, such as "2021", "2021 by-poll" or "LS 2019". Only a Lok Sabha year names its body.
_Avoid_: Tab label, short label

### Ordering elections

**Chronology key**:
The year, polling month and occurrence of an election, in that order of precedence. It is the only way elections are ranked, never the id string, and an election whose polling month was never sourced ranks as the earliest of its year.
_Avoid_: Sort order, recency

**Current election**:
The newest full-house election of a body in a jurisdiction, by chronology key. A by-election never replaces it.
_Avoid_: Latest election, newest election

### Reading the registry

**Registry session**:
One scoped use of the registry: it is opened, read or written, and closed within a single call, and nothing that holds it outlives that call.
_Avoid_: connection, handle, database access

**Read-then-render**:
The rule that a page reads everything it needs inside one registry session, returns plain data, and only then renders, so the open registry never reaches the components. Every page follows it.
_Avoid_: lazy read, render-time query

**Outage**:
The registry cannot be read right now: it is absent, was never built, is damaged, or is busy with a writer. A page tells the reader the registry is unavailable and what fixes it; a legacy redirect fails instead of answering "not found", which a crawler would remember.
_Avoid_: error, failure, downtime

**Defect**:
A fault in this program, such as a malformed query or a mistake in the code around it, as opposed to a state of the deployment. A defect should fail loudly rather than read as an outage; today a query naming a table or column the registry lacks still reads as one, until the schema is checked directly instead of guessed from the error message.
_Avoid_: outage, unavailable, bug (when it is shown to a reader)

**Read outcome**:
What a registry session reports: either the value it produced, or that the registry was in an outage, with a sentence for the reader and the underlying cause for the log.
_Avoid_: result (a result is an election result)

### Delimitation

**Epoch**:
One delimitation order and the constituency boundaries it drew. A national epoch (the Delimitation Commission orders of 1952, 1963, 1976 and 2008) covers every state; a jurisdictional epoch (Jammu & Kashmir 2022, Assam 2023) redraws one state or union territory and leaves the rest alone. An epoch ends in a jurisdiction where its successor there begins, so the same epoch can be over in Assam and still current in Bihar.
_Avoid_: delimitation (for the order's boundaries), vintage, boundary version

**Epoch in force**:
The epoch the law says governs a jurisdiction on a given date. It is a legal fact and changes the day an order takes effect, whether or not any election has yet been held under it.
_Avoid_: current epoch, active epoch, latest epoch

**Voting epoch**:
The epoch a jurisdiction's house is actually elected under: the epoch of the seats in its newest full-house election. A by-election never decides it, because a by-election fills a few vacancies of a house elected earlier and cannot introduce a delimitation. It differs from the epoch in force whenever an order has taken effect that no election has yet been held under.
_Avoid_: current epoch, epoch of the latest election

### What a seat's result is

**Seat result**:
What one constituency's contest came to in one election: who won, who came second, by how much, and on what turnout.
_Avoid_: Seat fact, contest row

**Declared winner**:
The candidate the source names as having won a seat. A seat with none is undeclared, and an undeclared seat belongs to no party at all, not to "Unattached".
_Avoid_: Elected candidate

**Runner-up**:
The candidate ranked second in a seat. A source that published only its winners has none for any seat.
_Avoid_: Second place, opponent

**Margin basis**:
Whether a seat's margin was counted from its winner's and runner-up's votes, or declared by the source with no counts behind it. A counted margin can be checked against the votes; a declared one cannot.
_Avoid_: Margin source

**Margin share**:
A seat's margin as a percentage of its votes polled. It is only as trustworthy as the votes polled, so it is withheld wherever those are unverified.
_Avoid_: Margin percentage

**Votes polled**:
The number of votes cast in a seat, as its turnout row reports it. It is not the sum of the candidates' votes, which for an election that published only its leading contestants is smaller.
_Avoid_: Valid votes, total votes

**Reading**:
A figure together with whether it has earned the right to be printed. A turnout is always a reading, never a bare number.
_Avoid_: Value, metric

**Unverified election**:
An election whose turnout has nothing to reconcile it against, because its source published no candidate vote counts. Its turnout, and every share of it, is withheld; the margins its source declared, in votes, are kept.
_Avoid_: Suspect election, bad data

**Scope**:
The elections a read covers, optionally narrowed to the seats inside one jurisdiction. A general election narrowed to one state is that state's share of it.
_Avoid_: Filter

**Current revision**:
The revision of a result that is read as the result. Seat results are read at revision 0, the original, today; whether a later revision supersedes it is not yet decided.
