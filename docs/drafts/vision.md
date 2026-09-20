# Why this exists (draft)

## The case it started from

A historical event is a time, a place and a set of people at once. Its
data spans several vocabularies, and no single renderer owns it. What it
wants is a timeline, a map, and a card per person, side by side, built
from the data rather than from a page someone wrote by hand. As a
learning tool that is the whole product.

Nothing renders that today. The pieces exist: the event is in a graph, the
people are in a graph, the vocabularies are standard and a decade old. What
is missing is anywhere to put a renderer.

## Why there are so few renderers

To show one kind of thing on the web you build an application. Fetching,
authentication, routing, layout, state, a deployment. The renderer is the
small part; the frame around it is the work. So a handful of applications
exist per domain, each shaped by the requirements of whoever built it, and
each one is a silo of a second kind: the data may be yours, the way you
see it is theirs.

RDF has this worse than most. The tools that exist are enterprise
tooling or look like the decade they were written in, and the answer to
"I want it to look different" is to write another whole application.

The missing piece is a socket. Something that says: here is a resource,
hand back HTML, and lets everything else stay where it is.

## What a view is

A rule table maps a resource to a view, by content type, by `rdf:type`, by
IRI, or by a query over its shape. A view takes the resource and returns
HTML. That is all of it.

With that in place the frame stops being the work. An application keeps
its shell, its session and its navigation, and you replace the one part
that bothers you: the form, the person card, the table. Your replacement
then applies everywhere a resource of that kind is opened, since the rule
table is what decides.

Ownership of the data is the precondition. A renderer can only be as good
as its access, and a graph you hold is the only case where the access is
total. That is what Solid buys here, and any store with the same property
would do.

## Why views have to compose

The event is the argument. Time, place and people are three vocabularies,
and a view that tried to own all three would be an application again,
with the same requirements baked in and the same wall when a fourth
vocabulary shows up.

So a view delegates. The event view knows what an event is and hands each
person to whatever view the rule table picks for a person, the place to
whatever renders a place. It never learns what those are. A child brought
in this way keeps its own identity: its own region, its own updates, its
own links.

This is the mechanism a desktop uses when it opens a file with the handler
its MIME type names, and the one compound documents used when a
spreadsheet sat inside a presentation inside a mail. Over IRIs it also
crosses machines, and none of it needs RDF, since a content type is enough
to dispatch.

## Where views come from

A view is something someone published and you adopted. A registry is where
people present them: single views, kits, base sets you
switch on as a unit. Taking one is still your decision, and your rule
table is still yours: the registry presents, your rules decide.

Versioning turns the awkward part of that into an ordinary screen. Before
you move a kit from one version to the next, you put both over the same
resource and look at them side by side. Which is two regions rendering one
IRI through two rule tables, so the comparison is built out of the same
parts as everything else here.

## Who this is for

People who write code. The promise is that the piece you want to replace
is small and that replacing it does not cost you an application.

What someone who does not write code wants from this, I do not know, and
guessing would shape the contract around an invented person. The rule
table is plain data, so a way to assemble one without writing code can
arrive later without touching anything below it.

## Open questions

**Trust in a view you did not write.** A view is code, and code from a
registry is code from a stranger. The direction is a region that is a
sandboxed frame with an opaque origin: the view renders inside it without
cookies, storage or the session, and reaches data only through the channel
the host answers. Until that stands, a host runs the views its operator
chose, and the first line of defence is that all view HTML enters the
document through one sanitizer under a content security policy.

**Who a view is.** View ids are IRIs, so a view is already named the way
everything else is. What a registry entry has to carry beyond that name,
and what signing a release of a kit would mean, is open.

**Whether a resource may propose its own view.** A publisher naming a
default view is self-description of the kind the rest of the system uses,
and it would make a foreign resource presentable on first contact. It also
lets the publisher decide how your data looks, which is the thing this is
built against. The precedence order already exists to settle it; which way
it should point is undecided.

**Views that are not JavaScript.** A view is a function from data to
HTML with one async import for reaching other resources, which is a WIT
world. A WASM view then comes from any language that compiles there. This
is a port of the same contract, and it waits for someone who wants it.

**Declarative views.** Fresnel describes which properties of a resource to
show and in what order, and for a card that is enough, with no code at
all. A declarative view is one code view that reads a lens, so both live
under the same contract and the choice stays per view.

## What is not a problem

**That there is no ecosystem yet.** There is no ecosystem because there is
nowhere for a single view to exist. A socket is the precondition for one,
and the first two hundred views not existing yet says nothing about
whether the socket is right.

**That one page could hold hundreds of instances.** It could, and the
answer is to mount what is visible. That is a measurement away and changes
no contract.

**That this is smaller than an application.** It is meant to be. An
application is what you build when the only way to show something is to
bring your own everything.
