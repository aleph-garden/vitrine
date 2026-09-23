// The IRIs more than one package names, and the helper that declares a
// vocabulary this dictionary does not carry. Strings, so that a consumer
// working in RDF/JS wraps them in its own namedNode and nothing here has
// to agree with it about term representation.

export type Vocab<K extends string> = Readonly<Record<K, string>>

/** The named terms of one namespace, each prefixed with `base`. Names are
 *  given one by one so that a typo fails to compile and an editor completes
 *  them. */
export function ns<const K extends string>(base: string, ...names: K[]): Vocab<K> {
  return Object.freeze(Object.fromEntries(names.map((name) => [name, base + name]))) as Vocab<K>
}

export const rdf = ns('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'type', 'value')

export const rdfs = ns('http://www.w3.org/2000/01/rdf-schema#', 'label', 'comment', 'seeAlso')

export const xsd = ns('http://www.w3.org/2001/XMLSchema#', 'string', 'dateTime', 'integer')

export const dcterms = ns('http://purl.org/dc/terms/', 'title', 'created', 'modified')

export const ldp = ns('http://www.w3.org/ns/ldp#', 'Container', 'BasicContainer', 'contains')

export const ma = ns('http://www.w3.org/ns/ma-ont#', 'format')

export const solid = ns(
  'http://www.w3.org/ns/solid/terms#',
  'oidcIssuer',
  'privateTypeIndex',
  'publicTypeIndex',
  'forClass',
  'instanceContainer'
)

export const pim = ns('http://www.w3.org/ns/pim/space#', 'storage')

export const vitrine = ns('https://w3id.org/vitrine/ns#', 'View', 'Host', 'Select', 'Meta')

export const schema = ns(
  'https://schema.org/',
  'Person',
  'Organization',
  'NoteDigitalDocument',
  'name',
  'description',
  'image',
  'author',
  'knows',
  'worksFor',
  'birthDate',
  'deathDate',
  'dateCreated'
)
