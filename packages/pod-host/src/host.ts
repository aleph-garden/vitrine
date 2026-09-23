// The host a pod hands out: its own resources, the owner's session, and the
// Markdown view the vault needs.

import type { Host } from '@aleph-garden/host-core'
import { createSession } from '@aleph-garden/host-core'
import {
  containerView,
  fallbackView,
  sourceView,
  subjectsGridView,
  subjectsListView
} from '@aleph-garden/vitrine'
import { jsonLdParser } from '@aleph-garden/vitrine-jsonld'
import { markdownView } from '@aleph-garden/vitrine-markdown'
import { parseTurtle, turtleParser } from '@aleph-garden/vitrine-turtle'
import { podAddress } from './address.ts'
import { applySnippets } from './snippets.ts'

export const podHost: Host = {
  address: podAddress,
  parseTurtle,
  parsers: () => [turtleParser(), jsonLdParser()],
  session: () => createSession(),
  views: (config, session) => [
    markdownView({ sparqlEndpoint: config.sparqlEndpoint, webId: session.webId ?? '' }),
    containerView,
    // A graph no more specific rule claims is taken apart into its subjects;
    // the list, the statements and the source are there to switch to.
    subjectsGridView,
    subjectsListView,
    sourceView,
    fallbackView
  ],
  ready: (session) => void applySnippets(session.fetch)
}
