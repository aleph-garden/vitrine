# Writing (draft, nothing of this is built yet)

A view asks for a change and the host carries it out. The same split the
read side already has: `resolve` says what a view wants to see, `act` says
what it wants done, and how either is transported belongs to the host.

## Why the core stays out of it

The obvious design is a CRUD API: create, update, delete, with a container
to post into and a patch of quads to apply. It is also the design that
drags LDP and RDF into a core that today knows IRIs, media types, bytes,
and quads only as data it passes through. "Container" is an LDP word.
"Slug" is an LDP word. A patch made of `remove` and `insert` quads is RDF.
None of them can appear in a contract that is meant to hold for a host over
a filesystem, an API, or a CRDT store.

So writing is shaped like reading. A resource arrives as bytes with a media
type and the host's statements about it. A change leaves as bytes with a
media type, inside an activity that says what kind of change it is.

## Contract delta

```ts
type Context = {
  resolve(iri: string): Promise<Resource>
  act(activity: Activity): Promise<Outcome>   // new
  emit(event: Event): void
  events: AsyncIterable<Event>
}

type Activity = Event & {
  /** What the change carries, when it carries anything. */
  contentType?: string
  body?: string | Uint8Array
  /** The version the change was made against, as the host handed it out. */
  basedOn?: string
}

type Outcome =
  | { ok: true; iri: string; version?: string }
  | { ok: false; reason: 'denied' | 'conflict' | 'invalid' | 'unsupported'; detail?: Resource }
```

`Activity` is the `Event` the bus already carries, sent the other way.
`as:Update` with an `object` changes a resource, `as:Create` with a `target`
puts something into a collection, `as:Delete` removes one. Those are
ActivityStreams types, not protocol calls, and a host maps them onto
whatever it speaks.

The payload is content-typed, which is what keeps the core clean. A
Markdown view sends `text/markdown` and never learns what a quad is. A form
over RDF sends `text/n3`, a patch, produced by a helper on the RDF side. A
host that understands neither answers `unsupported`, and the view finds out.

## Versions, without an ETag in the contract

Two tabs on one resource overwrite each other unless a change can say what
it was based on. That is not an HTTP problem: a revision number, a content
hash, a CRDT vector and an ETag are all the same thing to us.

```ts
type Resource = { …; version?: string }   // opaque, the host issues it
```

The core never reads it, compares it, or knows its shape. A host that has
nothing to put there leaves it out, and its writes are last write wins,
which it owes its users as documentation. A host that has one rejects a
stale change with `conflict`, and the view can show what it had.

## What a view may ask for at all

`allow` is already in `Resource` and has been unused: `"read" | "write" |
"append" | "control"`, as this requester's modes. A view renders an edit
control when `write` is there and renders none when it is not. The host
decides for real, since the modes were true when the resource was read and
the answer can change between then and the request.

## The loop closes on what exists

A host that carried a change out emits `as:Update` for the IRI. That is
already the path every instance re-renders on, so a resource open in
another region updates with no new machinery. The write and the refresh are
the same event seen from two sides.

## Editing is a view

Not a mode, not a flag on `render`, not a second entry point. A form is a
view over the same resource, selected by `hint.view`, and the host's chrome
offers the switch. The rule table decides which form applies to what, the
same way it decides which card applies.

The first form worth building generates itself from a SHACL shape, which
the pod already validates against. That makes the shape the single
description of what may be written, used by the server to reject and by the
form to prevent. And a rejected write answers with a validation report,
which is RDF, which is a resource, which a view renders. The error path
needs no error machinery.

## What stays the host's

Transport and authorisation. Conflict handling, including what the user
sees and what happens to their unsaved text. Optimistic rendering and undo,
because a view that keeps its own idea of the truth is a second source of
it. Queueing while offline, if a host wants that at all.

## What this costs

**Blank nodes.** A patch cannot address what has no IRI, which is why N3
Patch restricts them. A form over a structure rooted in blank nodes
replaces the subtree it owns, and the honest version of that rule has to be
written down before the first form is built.

**Media type guessing.** A view cannot know what its host accepts. The
first answer is to ask and be refused. Announcing what a host takes is a
second mechanism, and it waits for a second host that needs it.

**Partial writes.** One activity, one resource. A change that spans two
resources is two activities and the host cannot make them atomic, so the
view has to be able to live with one landing and the other failing.

## What it opens

A pod stops being a place you can only look at. An inbox view accepts, an
annotation view writes back, and the capture-and-triage pile that wants to
exist becomes a container you can actually add to from the thing that shows
it to you.
