# Capture and triage (note, belongs to no slice)

A thought arrives. Writing it down has to cost nothing, and leaving it
lying there has to cost nothing either. Later something reads the pile and
says which of these have to be decided now.

What each entry eventually becomes matters more than its text: an
invariant, a decision, an open consideration, a case waiting for a second
instance. Those categories are what a plan can be shaped from, and a
project's current picture is then derived from its entries rather than
maintained by hand.

## This already exists three times

- `pod/notes/system/inbox/ld/*.md`, December 2025: numbered scratch notes,
  each starting with one Turtle line, `<> a :Idea .`. Capture at zero cost,
  no triage, and the transcription into titled notes happened by hand two
  months later.
- **Weltbild**: a SKOS scheme on the pod with an input walked against it
  one question at a time, an accepted delta written back, and a walk
  record kept. This is the triage half, and it is the strongest of the
  three, since it records why an entry landed where it did.
- **erker**: issues that live inside the repository they belong to. This is
  the half that turns an entry into work.

The missing piece is not a fourth tool. It is that capture, triage and work
are three stores with no path between them: a blurb in the inbox never
becomes a Weltbild concept unless someone retypes it, and a decision in a
walk record never becomes an erker issue unless someone opens one.

## Why this belongs near the view layer

Every one of those entries is a resource with a type. A pile of them is a
container. A triage screen is a container view that shows each entry
through the view its type selects, with the classification as an action on
it. The plan derived from them is a query. None of that needs a new
application, and the substrate is the one being built anyway.

That makes this the first honest test of whether the view layer is worth
anything to its author: if the triage screen is cheaper to build as views
than as another small app, the claim holds. If it is not, the claim was
wrong and this note is the evidence.

## The trap this idea is walking into

A system that classifies every thought into invariants, decisions and
considerations, and derives plans from them, is exactly the kind of thing
that grows a model before it has processed a single entry. The same failure
as the twenty rendering-layer attempts, one domain over.

So: no schema up front. The first version stores the blurb and one
free-text classification, and the categories are whatever gets written down
in practice. The vocabulary arrives once the same category has been written
twice.
