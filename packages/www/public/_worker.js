// Serves the host for `/` and for viewer paths, and the static files for
// everything else. A `_redirects` rule cannot name the reserved segment's
// path shape, so the routing lives here; `_headers` does not reach a
// response a worker returns, so the policy on the host lives here too.

const POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https: 'unsafe-inline'",
  'img-src https: data:',
  "font-src 'self' data:",
  'connect-src https:',
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "require-trusted-types-for 'script'",
  'trusted-types aleph dompurify'
].join('; ')

const IRI_PATH = /^\/-\//

// The vocabulary document and the view descriptors. Pages guesses a content
// type from the extension and these paths have none, so the type is set here.
const VOCABULARY = '/ns/vitrine'
const DESCRIPTOR = /^\/views\/[a-z-]+$/

// Each document has one representation and no HTML one, so a browser gets it
// as text/plain and reads it rather than downloading it.
function typed(doc, request, contentType) {
  const accept = request.headers.get('accept') ?? ''
  const html = accept.includes('text/html') && !accept.includes(contentType)
  const response = new Response(doc.body, doc)
  response.headers.set(
    'content-type',
    html ? 'text/plain; charset=utf-8' : `${contentType}; charset=utf-8`
  )
  return response
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/' || url.pathname === '/index.html' || IRI_PATH.test(url.pathname)) {
      const host = await env.ASSETS.fetch(new Request(new URL('/', url.origin), request))
      const response = new Response(host.body, host)
      response.headers.set('content-security-policy', POLICY)
      return response
    }
    if (url.pathname === VOCABULARY) {
      return typed(await env.ASSETS.fetch(request), request, 'text/turtle')
    }
    if (DESCRIPTOR.test(url.pathname)) {
      const doc = await env.ASSETS.fetch(request)
      return doc.ok ? typed(doc, request, 'application/ld+json') : doc
    }
    return env.ASSETS.fetch(request)
  }
}
