// The vault's own CSS snippets, from the pod: Obsidian's appearance.json
// names them, and the Markdown view emits Obsidian's class names and
// variables. A pod's content is the owner's; no other host has a vault.

import type { Fetch } from '@aleph-garden/host-core'

export async function applySnippets(fetch: Fetch): Promise<void> {
  try {
    const base = new URL('/.obsidian/', location.href)
    const appearance = (await (await fetch(new URL('appearance.json', base).href)).json()) as {
      enabledCssSnippets?: string[]
    }
    for (const name of appearance.enabledCssSnippets ?? []) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = new URL(`snippets/${name}.css`, base).href
      document.head.append(link)
    }
  } catch {
    // No snippets, or none readable: the host's defaults stay.
  }
}
