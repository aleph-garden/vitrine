// What the one region holds when the resource does not arrive. Shared by
// every host, because a failure reads the same wherever it happens.

import type { Hint } from '@aleph-garden/vitrine'
import type { Runtime } from '@aleph-garden/vitrine/dom'
import { writeHtml } from '@aleph-garden/vitrine/dom'
import type { Session } from './session.ts'

export type Region = {
  session: Session
  credentialed: (origin: string) => boolean
}

/** Mounts the resource into the region and puts a failure there: a 401
 *  without a session says so and offers the source, a 401 on an origin the
 *  session does not reach says so and offers the source, anything else shows
 *  the message with a link to the resource itself, which a foreign https
 *  resource needs when CORS refuses the host and the browser can still open
 *  it. */
export async function mountInto(
  runtime: Runtime,
  root: Element,
  iri: string,
  hint: Hint | undefined,
  region: Region
): Promise<void> {
  try {
    await runtime.mount(root, iri, hint)
  } catch (e) {
    const status = (e as { status?: number }).status
    const link = `<a href="${escapeAttr(iri)}" target="_top">Open at source</a>`
    if (status === 401 && !region.session.webId) {
      writeHtml(root, `<p class="login-needed">This resource needs a login. ${link}</p>`)
      return
    }
    if (status === 401 && !region.credentialed(new URL(iri).origin)) {
      const hostname = escapeText(new URL(iri).hostname)
      writeHtml(
        root,
        `<p class="login-needed">Your session does not apply to ${hostname}. ${link} to log in there.</p>`
      )
      return
    }
    const message = e instanceof Error ? e.message : String(e)
    writeHtml(root, `<p class="error">${escapeText(message)} ${link}</p>`)
  }
}

function escapeText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function escapeAttr(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;')
}
