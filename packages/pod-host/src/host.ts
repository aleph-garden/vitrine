// The host a pod hands out: its own resources, the owner's session, and the
// Markdown view the vault needs.

import type { Host } from '@aleph-garden/host-core'
import { createSession } from '@aleph-garden/host-core'
import { containerView, fallbackView } from '@aleph-garden/vitrine'
import { markdownView } from '@aleph-garden/vitrine-markdown'
import { parseTurtle, turtleParser } from '@aleph-garden/vitrine-turtle'
import { podAddress } from './address.ts'
import { applySnippets } from './snippets.ts'

export const podHost: Host = {
  address: podAddress,
  parseTurtle,
  parsers: () => [turtleParser()],
  session: () => createSession(),
  views: (config, session) => [
    markdownView({ sparqlEndpoint: config.sparqlEndpoint, webId: session.webId ?? '' }),
    containerView,
    fallbackView
  ],
  ready: (session) => void applySnippets(session.fetch)
}
