// The host at aleph.garden: any IRI, no session, and the three views that
// escape everything they show. The Markdown view joins once the region is a
// sandboxed iframe, which the host design defers.

import type { Host } from '@aleph-garden/host-core'
import { anonymousSession } from '@aleph-garden/host-core'
import { containerView, fallbackView } from '@aleph-garden/vitrine'
import { parseTurtle, turtleParser } from '@aleph-garden/vitrine-turtle'
import { gardenAddress } from './address.ts'
import { landingView } from './landing.ts'

export const gardenHost: Host = {
  address: gardenAddress,
  parseTurtle,
  parsers: () => [turtleParser()],
  session: async () => anonymousSession(),
  views: () => [landingView(location.origin), containerView, fallbackView]
}
