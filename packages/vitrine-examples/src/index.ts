// Views the documentation shows and runs. Each one is a complete view under
// the contract, written in plain JavaScript with no framework, and each one
// demonstrates one part of it: render from a graph and from a body, reaching
// another resource, hydration, events, and a patch.

import { rdf, schema, xsd } from '@aleph-garden/terms'
import {
  ALEPH,
  type Context,
  escapeHtml,
  type Handle,
  objects,
  type Quad,
  type Resource,
  type Term,
  type View
} from '@aleph-garden/vitrine'

// ------------------------------------------------------------- resources

const named = (value: string): Term => ({ termType: 'NamedNode', value })
const literal = (value: string): Term => ({
  termType: 'Literal',
  value,
  datatype: xsd.string
})
const quad = (subject: string, predicate: string, object: Term): Quad => ({
  subject: named(subject),
  predicate: named(predicate),
  object
})

type PersonFields = {
  name: string
  /** Where the portrait lives. The fixture pod is fiction, so this points at
   *  a file the documentation site serves. */
  image?: string
  birthDate?: string
  deathDate?: string
  worksFor?: string
}

function person(iri: string, fields: PersonFields): Resource {
  const graph = [
    quad(iri, rdf.type, named(schema.Person)),
    quad(iri, schema.name, literal(fields.name))
  ]
  if (fields.image) graph.push(quad(iri, schema.image, named(fields.image)))
  if (fields.birthDate) graph.push(quad(iri, schema.birthDate, literal(fields.birthDate)))
  if (fields.deathDate) graph.push(quad(iri, schema.deathDate, literal(fields.deathDate)))
  if (fields.worksFor) graph.push(quad(iri, schema.worksFor, named(fields.worksFor)))
  return { iri, contentType: 'text/turtle', body: '', graph, meta: [], allow: ['read'] }
}

const PACKING = ['- [ ] passport', '- [x] charger', '- [ ] towel'].join('\n')

/** The fixture pod the examples run against. A host answers `resolve` from
 *  the network; this one answers from a record, which is all a view can
 *  tell apart. */
export const exampleResources: Record<string, Resource> = {
  'https://example.org/people/ada': person('https://example.org/people/ada', {
    name: 'Ada Lovelace',
    image: '/fixtures/ada.svg',
    birthDate: '1815-12-10',
    deathDate: '1852-11-27',
    worksFor: 'https://example.org/orgs/aeo'
  }),
  'https://example.org/people/grace': person('https://example.org/people/grace', {
    name: 'Grace Hopper',
    birthDate: '1906-12-09',
    deathDate: '1992-01-01'
  }),
  'https://example.org/people/injection': person('https://example.org/people/injection', {
    name: '<script>alert(1)</script>',
    birthDate: '1980-02-29'
  }),
  'https://example.org/people/nodates': person('https://example.org/people/nodates', {
    name: 'Anon'
  }),
  'https://example.org/people/tricked': person('https://example.org/people/tricked', {
    name: 'Mallory',
    worksFor: 'javascript:alert(1)'
  }),
  'https://example.org/orgs/aeo': {
    iri: 'https://example.org/orgs/aeo',
    contentType: 'text/turtle',
    body: '',
    graph: [
      quad('https://example.org/orgs/aeo', rdf.type, named(schema.Organization)),
      quad('https://example.org/orgs/aeo', schema.name, literal('Analytical Engine Office'))
    ],
    meta: [],
    allow: ['read']
  },
  'https://example.org/notes/packing.txt': {
    iri: 'https://example.org/notes/packing.txt',
    contentType: 'text/plain',
    body: PACKING,
    meta: [],
    allow: ['read']
  }
}

export async function exampleResolve(iri: string): Promise<Resource> {
  const resource = exampleResources[iri]
  if (!resource) throw Object.assign(new Error(`404 ${iri}`), { status: 404 })
  return resource
}

// ------------------------------------------------------------ plain text
// The smallest view there is: no state, no hydration, no graph. Registered
// after the checklist, so only a hint reaches it.

export const PLAIN_TEXT_VIEW = 'https://example.org/views#PlainText'

export const plainTextView: View = {
  id: PLAIN_TEXT_VIEW,
  when: [{ contentType: 'text/plain' }],

  async render(resource) {
    const body = typeof resource.body === 'string' ? resource.body : ''
    return { html: `<pre class="plain">${escapeHtml(body)}</pre>` }
  }
}

// ----------------------------------------------------------- person card
// Reads the graph, reaches one further resource, returns HTML. No hydrate,
// because nothing here behaves.

export const PERSON_CARD_VIEW = 'https://example.org/views#PersonCard'

/** An IRI a view may put in an href. Escaping says nothing about a scheme,
 *  and `javascript:` in a graph someone else wrote is the reason to look. */
const linkable = (iri: string) => /^https?:\/\//i.test(iri)

/** A date as the year, with the full value kept machine-readable. */
const year = (date: string) =>
  `<time datetime="${escapeHtml(date)}">${escapeHtml(date.slice(0, 4))}</time>`

function lifespan(born?: string, died?: string): string {
  if (born && died) return `<p class="lifespan">${year(born)}&ndash;${year(died)}</p>`
  if (born) return `<p class="lifespan">born ${year(born)}</p>`
  if (died) return `<p class="lifespan">died ${year(died)}</p>`
  return ''
}

export const personCardView: View = {
  id: PERSON_CARD_VIEW,
  when: [{ type: schema.Person }],

  async render(resource, ctx) {
    const graph = resource.graph ?? []
    const value = (predicate: string) => objects(graph, resource.iri, predicate)[0]?.value
    const name = value(schema.name) ?? resource.iri
    const image = value(schema.image)
    const employerIri = value(schema.worksFor)

    const portrait = image
      ? `<img class="portrait" src="${escapeHtml(image)}" alt="${escapeHtml(name)}" width="72" height="72">`
      : ''

    let employer = ''
    if (employerIri && linkable(employerIri)) {
      const org = await ctx.resolve(employerIri)
      const orgName = objects(org.graph ?? [], employerIri, schema.name)[0]?.value ?? employerIri
      employer = `<p class="employer"><a href="${escapeHtml(employerIri)}">${escapeHtml(orgName)}</a></p>`
    }

    return {
      html:
        `<article class="person-card">${portrait}<div class="who">` +
        `<h2>${escapeHtml(name)}</h2>` +
        `${lifespan(value(schema.birthDate), value(schema.deathDate))}` +
        `${employer}</div></article>`
    }
  }
}

// -------------------------------------------------------------- checklist
// Reads the body, hydrates into behaviour, emits an event per item, and
// answers events with a patch for one slot instead of a re-render.

export const CHECKLIST_VIEW = 'https://example.org/views#Checklist'

type Task = { text: string; done: boolean }

/** Lines in the `- [ ] text` form. Anything else is ignored. */
export function tasksOf(body: string): Task[] {
  return body
    .split('\n')
    .map((line) => /^\s*-\s*\[([ xX])\]\s*(.*)$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ text: match[2]!, done: match[1]! !== ' ' }))
}

const tally = (done: number, total: number) => `${done} of ${total}`

export const checklistView: View = {
  id: CHECKLIST_VIEW,
  when: [{ contentType: 'text/plain' }],

  async render(resource) {
    const body = typeof resource.body === 'string' ? resource.body : ''
    const tasks = tasksOf(body)
    const items = tasks
      .map(
        (task, index) =>
          `<li class="task${task.done ? ' is-done' : ''}">` +
          `<label><input type="checkbox" data-index="${index}"${task.done ? ' checked' : ''}> ` +
          `${escapeHtml(task.text)}</label></li>`
      )
      .join('')
    const done = tasks.filter((task) => task.done).length

    return {
      html:
        `<div class="checklist"><ul>${items}</ul>` +
        `<p class="tally"><span data-slot="count">${tally(done, tasks.length)}</span></p></div>`,

      hydrate(root: Element, ctx: Context): Handle {
        root.addEventListener('click', (event) => {
          const box = event.target as HTMLInputElement | null
          if (!box?.dataset.index) return
          ctx.emit({
            type: ALEPH.Select,
            object: `${resource.iri}#${box.dataset.index}`,
            target: resource.iri
          })
        })

        return {
          update(event) {
            if (event.type !== ALEPH.Select) return
            if (typeof event.object !== 'string' || !event.object.startsWith(resource.iri)) return
            const boxes = [...root.querySelectorAll<HTMLInputElement>('.task input')]
            const done = boxes.filter((box) => box.checked).length
            return { slot: 'count', html: tally(done, boxes.length) }
          }
        }
      }
    }
  }
}
