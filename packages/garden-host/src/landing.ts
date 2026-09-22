// The greeting at the host's own IRI, as a view. Nothing here reads the
// resource: the host answers its own IRI with the host document itself, and
// the rule table picks this view for it the same way it picks a view for
// anything else. The page is the mechanism it describes, so the copy says so.

import { escapeHtml, type View } from '@aleph-garden/vitrine'

export const LANDING_VIEW = 'https://aleph.garden/views/landing'

/** A repository in the lab, with what a reader can check. `commits` and
 *  `last` were measured 2026-09-22 from each repository's own history and
 *  are recorded in planning/catalog.md. `href` is absent where the source is
 *  not public, because a link a reader cannot follow is worse than none. */
type Repository = {
  name: string
  what: string
  commits: number
  last: string
  href?: string
  closed?: string
}

const LAB: Repository[] = [
  {
    name: 'vitrine',
    what: 'Turns an address into HTML. A rule table picks the view, the view returns the markup. It draws this page.',
    commits: 97,
    last: '2026-09-21'
  },
  {
    name: 'marginalia',
    what: 'Deferred semantics for CommonMark. A document becomes a structural RDF graph and SPARQL CONSTRUCT rules give it meaning.',
    commits: 27,
    last: '2026-09-19'
  },
  {
    name: 'quadpod',
    what: 'A Solid pod in Rust over Oxigraph. Every resource is a named graph in one quad store, so a question that spans resources is one query. An experiment, and a candidate for the substrate underneath the rest.',
    commits: 365,
    last: '2026-09-13',
    href: 'https://github.com/aleph-garden/quadpod',
    closed:
      'Well before a first release. It verifies credentials and issues none, so it needs an identity provider beside it.'
  },
  {
    name: 'vocab',
    what: 'The vocabularies the rest of the lab names, in Turtle.',
    commits: 18,
    last: '2026-09-01',
    href: 'https://github.com/aleph-garden/vocab'
  },
  {
    name: 'www',
    what: 'Where this site is moving. The deployment still comes out of vitrine.',
    commits: 4,
    last: '2026-09-17'
  },
  {
    name: 'garden',
    what: 'SKOS concepts placed as rooms in a generated garden, to see a scheme by walking it.',
    commits: 37,
    last: '2026-08-25'
  },
  {
    name: 'memex',
    what: 'Search over the hub that collects what the other pieces write.',
    commits: 79,
    last: '2026-08-20'
  },
  {
    name: 'wiki',
    what: 'RDF knowledge graphs in a Solid pod, drawn as a graph. The first thing here that drew one.',
    commits: 198,
    last: '2026-05-29',
    href: 'https://github.com/aleph-garden/wiki'
  },
  {
    name: 'aleph',
    what: 'The umbrella repository and its VitePress site.',
    commits: 27,
    last: '2026-04-10',
    closed:
      'Parked. The deployment you are reading replaced its site, and its deploy job was retired on 2026-09-22.'
  }
]

function row(repo: Repository): string {
  const name = repo.href
    ? `<a href="${escapeHtml(repo.href)}" target="_top">${escapeHtml(repo.name)}</a>`
    : escapeHtml(repo.name)
  const closed = repo.closed ? ` <span class="closed">${escapeHtml(repo.closed)}</span>` : ''
  return `<tr>
      <td class="name">${name}</td>
      <td>${escapeHtml(repo.what)}${closed}</td>
      <td class="when">${repo.commits} commits, last ${escapeHtml(repo.last)}</td>
      <td class="closed">${repo.href ? 'public' : 'not public'}</td>
    </tr>`
}

function html(origin: string): string {
  const here = escapeHtml(`${origin}/`)
  return `<section class="landing">
  <h1>Aleph Garden</h1>
  <p class="lede">Aleph Garden is my workshop for one mechanism: a resource has an address, a table of rules picks the code that draws it, and you replace that code without building an application around it.</p>
  <p>I am <a href="https://github.com/tophcodes" target="_top">Christopher M&uuml;hl</a> and I work on it in the open, in pieces.</p>
  <p>This page is the mechanism running. A rule matched the address <code>${here}</code>, named a view, and that view returned the markup you are reading. There is no page behind it. Change the row and this page draws differently.</p>
  <p>The same table decides the rest. Put an IRI after <code>${here}-/</code> and the rules pick a view for whatever is at that address: a note as a note, a container as a listing, a graph as a table of statements. The addresses are IRIs and the data underneath is RDF, so a rule can say "anything of this type" and have the type mean the same thing in my store and in yours.</p>
  <p>Vitrine is the part that draws. It reads and never writes, so editing and permissions stay with the tools that already do them.</p>
  <p class="next"><a href="/vitrine/docs/" target="_top">Read the Vitrine documentation</a> <a href="/vitrine/docs/run/install/" target="_top">Clone it and build it</a> <a href="https://github.com/aleph-garden/vocab" target="_top">The vocabularies</a></p>

  <h2>What is in the lab</h2>
  <p class="caveat">Nine repositories. The counts and dates were measured on 2026-09-22 from each repository's own history. Three are public and linked; the other six are private today, so their numbers are mine to assert and yours to discount.</p>
  <table class="lab">
    <thead>
      <tr><th>Repository</th><th>What it is</th><th>Activity</th><th>Source</th></tr>
    </thead>
    <tbody>
      ${LAB.map(row).join('\n      ')}
    </tbody>
  </table>
  <p class="caveat">There is no maturity column, on purpose. Six labels are defined for this lab and each carries a test someone else can run without asking me. The one that decides whether a repository is worth your afternoon is Buildable: clone it, follow the README's own commands from a clean checkout, reach what the README promises. Nobody has run that test this quarter for any row above, so no row carries a label. What that costs you: for every repository here, you find out by cloning it.</p>
</section>`
}

/** Applies to the one IRI the deployment answers with this document, which
 *  it takes from the location rather than from the build, so that a preview
 *  deployment and a local run greet as well. The links carry target="_top",
 *  so the browser follows them to the pages they name instead of the runtime
 *  showing them as resources. */
export function landingView(origin: string): View {
  const body = html(origin)
  return {
    id: LANDING_VIEW,
    when: [{ iri: `${origin}/` }],
    async render() {
      return { html: body }
    }
  }
}
