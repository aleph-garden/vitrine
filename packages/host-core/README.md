# @aleph-garden/host-core

The browser end of a Vitrine host. It carries a Solid session, a fetch that
uses the session's credentials, navigation, the surrounding chrome, and the
region a resource renders into with its loading and failure states.

A host built on this package brings three things of its own: an address scheme
that turns the browser's location into an IRI, the views and parsers it
registers, and the host document the build embeds into `index.html`. Two hosts
exist on it today. One is the page a Community Solid Server hands out as the
`text/html` representation of every resource. The other reads the IRI out of
its own address after a `/-/` segment.

An application that only embeds a rendered region needs
[`@aleph-garden/vitrine`](https://www.npmjs.com/package/@aleph-garden/vitrine)
and none of this.

## Entry points

| Specifier | What it holds |
| --- | --- |
| `@aleph-garden/host-core` | `boot`, the session, navigation, chrome and region |
| `@aleph-garden/host-core/style.css` | The stylesheet the chrome and the built-in views expect |
| `@aleph-garden/host-core/vite` | Vite plugins that write the host document into `index.html` |

The `/vite` entry point needs Vite, declared here as an optional peer
dependency. The rest of the package does not.

## Status

Version `0.1.1-dev`. The interfaces change between releases without a
deprecation period, so pin an exact version. The repository holds TypeScript;
the published package holds the JavaScript and declaration files compiled from
it at build time.
