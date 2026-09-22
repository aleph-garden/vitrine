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

// The vocabulary document, served under the media type the client asked for.
// There is one Turtle representation and no HTML one, so a browser gets it as
// text/plain and reads it rather than downloading it. Pages guesses a content
// type from the extension and this path has none, so the type is set here.
const VOCABULARY = '/ns/vitrine'

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
      const doc = await env.ASSETS.fetch(request)
      const accept = request.headers.get('accept') ?? ''
      const html = accept.includes('text/html') && !accept.includes('text/turtle')
      const response = new Response(doc.body, doc)
      response.headers.set(
        'content-type',
        html ? 'text/plain; charset=utf-8' : 'text/turtle; charset=utf-8'
      )
      return response
    }
    return env.ASSETS.fetch(request)
  }
}
