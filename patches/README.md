# Patches

`@inrupt%2Foidc-client-ext@5.0.0.patch` adds an `exports` map to
`@inrupt/oidc-client-ext`, which ships an ESM build under `module` and a
CommonJS build under `main` but declares no `exports`. Without the map, bun
reaches the CommonJS build when `mock.module` replaces
`@inrupt/solid-client-authn-browser` after the real package has loaded, and
that build's `require('jose')` fails under bun 1.4 because jose 6 is ESM only.
The failure depends on test order. Drop the patch once the package declares
`exports` itself.
