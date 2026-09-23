# @aleph-garden/vitrine-markdown

> Before 1.0. Any interface here can change in any release, including the
> ones marked `-dev` patches. Build against it to experiment, depend on an
> exact version, and expect to follow breaking changes by hand.

Obsidian-flavoured Markdown as a Vitrine view: frontmatter as properties,
wikilinks resolved through the pod's type index, embeds, tags, tasks, callouts,
math, diagrams, and SPARQL blocks run through the host.

## This package sits in the wrong place

A view is one resource among many, identified by an IRI that dereferences to a
descriptor. This one is a package in the library's own repository because it was
written before that was true. It will move out.

What that means for you today: depending on this package couples you to the
library's release cycle for something that is only a view. The identifier
`https://aleph.garden/views/markdown` is the durable name; this package is the
current way to obtain an implementation of it, and it will not stay the way.
