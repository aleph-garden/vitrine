// The greeting at the host's own IRI, as a view. Nothing here reads the
// resource: the host answers its own IRI with the host document itself.

import type { View } from '@aleph-garden/vitrine'

export const LANDING_VIEW = 'https://w3id.org/aleph/ns/view#Landing'

const HTML = `<section class="landing">
  <h1>Aleph Garden</h1>
  <p>Your browser knows how to show an image or a PDF. Everything else it shows as raw text, or not at all. Aleph Garden shows a note as a note, a list as a list, a person as a profile. And you decide how things look.</p>
  <p><a href="/vitrine/docs/" target="_top">Read about Vitrine</a> · <a href="https://github.com/aleph-garden/vocab" target="_top">The vocabularies</a></p>
</section>`

/** Applies to the one IRI the deployment answers with this document, which
 *  it takes from the location rather than from the build, so that a preview
 *  deployment and a local run greet as well. The links carry target="_top",
 *  so the browser follows them to the pages they name instead of the runtime
 *  showing them as resources. */
export function landingView(origin: string): View {
  return {
    id: LANDING_VIEW,
    when: [{ iri: `${origin}/` }],
    async render() {
      return { html: HTML }
    }
  }
}
