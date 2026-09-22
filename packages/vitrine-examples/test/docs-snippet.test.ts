import { expect, test } from 'bun:test'

// The overview page quotes personCardView verbatim. It has drifted twice
// already, once when the view grew a portrait and once when the packages
// moved to @aleph-garden/terms, so the quote is pinned to the source.
const SOURCE = `${import.meta.dir}/../src/index.ts`
const PAGE = `${import.meta.dir}/../../../docs/index.mdx`

test('the overview quotes the view as it is written', async () => {
  const source = await Bun.file(SOURCE).text()
  const from = source.indexOf('/** An IRI a view may put in an href')
  // The next banner comment ends the view; its width is not load-bearing.
  const to = source.slice(from).search(/\n\/\/ -{3,}/)
  expect(from).toBeGreaterThan(-1)
  expect(to).toBeGreaterThan(-1)
  const quoted = source
    .slice(from, from + to)
    .trimEnd()
    .replace('  id: PERSON_CARD_VIEW,', "  id: 'https://example.org/views#PersonCard',")

  const page = await Bun.file(PAGE).text()
  const start = page.indexOf('```ts\n')
  const block = page.slice(start + 6, page.indexOf('```', start + 6))

  for (const line of quoted.split('\n')) {
    expect(block).toContain(line)
  }
})
