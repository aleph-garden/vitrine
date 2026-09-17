// Serves the shell for `/` and for IRI paths, and the static files for
// everything else. A `_redirects` rule cannot name a path that begins
// with `https://`, so the routing lives here; `_headers` does not reach
// a response a worker returns, so the policy on the shell lives here too.

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
  'trusted-types aleph'
].join('; ')

const IRI_PATH = /^\/https?:\/\//

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/' || IRI_PATH.test(url.pathname)) {
      const shell = await env.ASSETS.fetch(new Request(new URL('/', url.origin), request))
      const response = new Response(shell.body, shell)
      response.headers.set('content-security-policy', POLICY)
      return response
    }
    return env.ASSETS.fetch(request)
  }
}
