# Cases for the RDF layer

Cases that came up while the RDF layer was being decided, each held back until
a second real instance asks for it. Each entry says what the case is and what
covers it today.

## Subclasses

A view registered for `schema:Person` does not apply to a `schema:Patient`.
Covering it means evaluating `rdfs:subClassOf` during selection, which needs
the vocabulary at hand. Today a rule names every type it applies to.

## Subjects that live elsewhere

A SPARQL CONSTRUCT result holds subjects whose IRIs point at other documents,
so `doc#fragment` cannot address them. Covering it needs "this subject, within
this graph" as a separate field of `Show`. Today every subject a view embeds
is a fragment of the document it came from.

## Blank nodes

A blank node has no IRI and cannot be embedded on its own. Today the view that
draws its parent draws it inline.

## Metadata in a separate document

Solid and LDP attach a resource's metadata as its own document through
`Link: rel="describedby"`. The resolver does not follow it. Covering it means
fetching that document and adding its quads under its own IRI.

## Another representation of the same IRI

`resolve` fetches one representation with a fixed `Accept`. A view that needs
a different one, an image behind an IRI that answers Turtle by default, would
need `resolve(iri, { accept })`.

## Competing parsers

Two parsers for one content type, one of them faulty. The first registered
wins, the same way views are ordered, and the host decides that order. Choosing
a parser per resource, the way `show.view` chooses a view, does not exist.

## Conditions over patterns

"Draw this image on a map when its EXIF carries coordinates" is a condition on
a pattern in the graph, not on a type. That is the `ask` condition, which the
contract names and which never holds today. It belongs with lenses (which
properties of a type to show, in which order) in a design of its own.

## Reactive patterns

The runtime tracks dependencies per IRI: a view is redrawn when a resource it
resolved is updated. Tracking the patterns a view read instead, "the name of
this subject", would redraw only when those statements change. That pays off
once writes are frequent. Today the IRI is the unit.

## Queries

`about` is a single triple pattern over quads already in hand, synchronous and
local. A SPARQL query goes to a source and is asynchronous. The two meet at the
resource: a query becomes a resource whose body is a CONSTRUCT result, and
`about` reads it like any other dataset. Nothing of this exists yet.

## Depth decided per layer

Transclusion stops at a fixed depth (3, and host-core offers no way to raise
it) and `render` at 8. A fixed number fits no page: a view that draws one line
can nest twenty deep, a view that fans out cannot nest three. The depth should
be a property of each layer, set where that layer is framed. A related idea: a
global edit mode in which a reader builds their frames and sets such things per
layer, switching views and limits in place. Today both limits are constants,
and a host that nests deeper draws the lower levels itself with `ctx.render`.
