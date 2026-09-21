// Views the documentation shows and runs. Each one is a complete view under
// the contract, written in plain JavaScript with no framework, and each one
// demonstrates one part of it: render from a graph and from a body, reaching
// another resource, hydration, events, and a patch.

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
} from '@aleph-garden/view'

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const SCHEMA = 'https://schema.org/'

// ------------------------------------------------------------- resources

const named = (value: string): Term => ({ termType: 'NamedNode', value })
const literal = (value: string): Term => ({
  termType: 'Literal',
  value,
  datatype: 'http://www.w3.org/2001/XMLSchema#string'
})
const quad = (subject: string, predicate: string, object: Term): Quad => ({
  subject: named(subject),
  predicate: named(predicate),
  object
})

function person(iri: string, name: string, worksFor?: string): Resource {
  const graph = [
    quad(iri, RDF_TYPE, named(`${SCHEMA}Person`)),
    quad(iri, `${SCHEMA}name`, literal(name))
  ]
  if (worksFor) graph.push(quad(iri, `${SCHEMA}worksFor`, named(worksFor)))
  return { iri, contentType: 'text/turtle', body: '', graph, meta: [], allow: ['read'] }
}

const PACKING = ['- [ ] passport', '- [x] charger', '- [ ] towel'].join('\n')

/** The fixture pod the examples run against. A host answers `resolve` from
 *  the network; this one answers from a record, which is all a view can
 *  tell apart. */
export const exampleResources: Record<string, Resource> = {
  'https://example.org/people/ada': person(
    'https://example.org/people/ada',
    'Ada Lovelace',
    'https://example.org/orgs/aeo'
  ),
  'https://example.org/people/grace': person('https://example.org/people/grace', 'Grace Hopper'),
  'https://example.org/people/injection': person(
    'https://example.org/people/injection',
    '<script>alert(1)</script>'
  ),
  'https://example.org/orgs/aeo': {
    iri: 'https://example.org/orgs/aeo',
    contentType: 'text/turtle',
    body: '',
    graph: [
      quad('https://example.org/orgs/aeo', RDF_TYPE, named(`${SCHEMA}Organization`)),
      quad('https://example.org/orgs/aeo', `${SCHEMA}name`, literal('Analytical Engine Office'))
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

export const personCardView: View = {
  id: PERSON_CARD_VIEW,
  when: [{ type: `${SCHEMA}Person` }],

  async render(resource, ctx) {
    const graph = resource.graph ?? []
    const name = objects(graph, resource.iri, `${SCHEMA}name`)[0]?.value ?? resource.iri
    const employerIri = objects(graph, resource.iri, `${SCHEMA}worksFor`)[0]?.value

    let employer = ''
    if (employerIri) {
      const org = await ctx.resolve(employerIri)
      const orgName =
        objects(org.graph ?? [], employerIri, `${SCHEMA}name`)[0]?.value ?? employerIri
      employer = `<p class="employer"><a href="${escapeHtml(employerIri)}">${escapeHtml(orgName)}</a></p>`
    }

    return {
      html: `<article class="person-card"><h2>${escapeHtml(name)}</h2>${employer}</article>`
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
