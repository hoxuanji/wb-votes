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

### What a state page opens on

**State view**:
What a state page shows, decided in one step: the house and election it opens on, the offers it switches between, the election's seats and the state's run of elections. A state with no election to open on has a state view that says so, and its page says so, instead of showing something else.
_Avoid_: State map

**Offer**:
An election a jurisdiction can show, with the number of its seats that lie inside that jurisdiction. West Bengal's offer of the 2024 Lok Sabha election is its 42 seats, not the nation's 543.
_Avoid_: Option

**Own house**:
The house a jurisdiction's page opens on: its assembly where it holds full-house assembly elections, and otherwise its Lok Sabha seats, the only house it has. The other house is shown only when a link asks for it.
_Avoid_: Default house, primary house

**Asked**:
Whether the election a link names is the one that opens. It is honoured when the jurisdiction can show it, a by-election included, and defaulted when it cannot: its current election opens instead and the page says so. A link that names none is neither.
_Avoid_: Fallback, requested election

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
Whether a seat's margin was counted from its winner's and runner-up's votes, or declared by the source with no counts behind it. A counted margin can be checked against the votes; a declared one cannot, so the election page marks it "declared".
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
The elections a read covers, optionally narrowed to the seats inside one jurisdiction or one district. A general election narrowed to one state is that state's share of it.
_Avoid_: Filter

**Current revision**:
The revision of a result that is read as the result. Seat results are read at revision 0, the original, today; whether a later revision supersedes it is not yet decided.

### Comparing two elections

**Seat identity**:
What makes a seat in one election the same seat in another: the same place under the same epoch. A seat number does not identify a seat, because every delimitation renumbers constituencies from scratch.
_Avoid_: Seat key, seat number

**Paired seat**:
A seat that has a counterpart in the other election under the same epoch, whether or not either election declared a winner for it.
_Avoid_: Matched seat

**Incomparable**:
A seat with no counterpart in the other election under the same epoch, because it was redrawn or did not exist. It is reported and never counted as a change.
_Avoid_: Unmatched, redrawn (a paired seat with no declared winner was not redrawn)

**Unknown**:
A paired seat that is neither held nor flipped because one election, or both, declared no winner for it. It is reported, and counted neither as a hold nor as a change.
_Avoid_: Missing, incomparable

**Held** and **flipped**:
A paired seat with a declared winner in both elections is held when both winners belong to the same party and flipped when they do not. An independent replaced by another independent is held, because the comparison reads the party and not the person.
_Avoid_: Retained, switched

**Comparable**:
The number of paired seats that are held or flipped, and so the denominator of "N of M seats changed hands". Unknown and incomparable seats are outside it.
_Avoid_: Paired seats (an unknown seat is paired and not comparable)

**Flip matrix**:
The flipped seats counted by the party that lost them and the party that won them, the biggest count first.
_Avoid_: Transition matrix

### Reading a map

**Selection**:
What the reader has narrowed a loaded map to: its mode, an isolation, a district focus and a seat focus. It is carried in the link, so a reading can be shared and survives the back button.
_Avoid_: Map state

**Mode**:
How the map colours its seats: by winner, by flip, by margin or by runner-up. A map has no flip mode when there is no previous election of the same house to compare against.
_Avoid_: Layer (the front page's layer chooses the data, not how it is coloured)

**Isolation**:
Showing only one party's seats, or only the seats whose margin lies in one range, and muting the rest. At most one at a time, and the margin range is a two-point bin on the election page and one of five named bands on the state page. In the runner-up mode a party's seats are those it came second in.
_Avoid_: Highlight

**Focus**:
Pointing at part of the map without isolating anything: a district, which reframes the map and narrows what it describes to the district's seats, or a seat, which is only outlined.
_Avoid_: Zoom

**Mute**:
To dim a seat because the selection does not include it. A muted seat keeps its colour and loses its strength.
_Avoid_: Hide, grey out

**Narrow**:
To reduce the seats a map and its figures describe to those the selection includes: the district first, then the isolation inside it.
_Avoid_: Filter

**Subject params**:
The parts of a link that choose which data a page shows, such as the front page's layer, an election or a house, as against the selection, which narrows data already chosen.
_Avoid_: Scope, which already names the elections a read covers

**Choices**:
What a loaded map makes selectable: its parties, margin bins or bands, districts and seats, and whether flips is a mode. A request for anything outside them is set aside, and the page shows its default instead.
_Avoid_: Options

**Move**:
A change of selection that a link offers, such as isolating a party or focusing a district. Everything the move does not change, including any part of the link the page does not recognise, stays as the reader had it.
_Avoid_: Action

**Ask**:
What the reader's link asks for, before the page has decided what it can honour. A parameter the page does not recognise is part of it and is carried into the links the page offers.
_Avoid_: Request, query

**Tally**:
Seats counted by the party that won them, or by the party that came second, the biggest count first. A seat with nobody on that side counts for no one.
_Avoid_: Count
