## Why

The pod host can only be tried after a deploy, because it reads the resource
IRI from its own address and needs a Solid server to hand it out. Writing
through `ctx.act` (change `add-write-contract`) adds behaviour that depends on
access modes, ETags and a logged-in session, and each step of it needs a
check in a browser against a real server within seconds of the code change.

## What Changes

- The flake builds Community Solid Server 7.2.0, the version pod.toph.so runs,
  as a Nix package.
- `nix run .#dev-pod`, called by a `just dev-pod` recipe, starts that server on
  `http://localhost:3000/` with the pod host as the HTML view of every
  resource, and rebuilds the pod host whenever its sources change.
- The server stores the development pod in `.dev-pod/` in the checkout and
  seeds it on first start with sample notes and RDF documents. One account
  with fixed development credentials owns the pod.
- The pod's access control lets anyone read and only the account write, so
  the logged-out and the logged-in view can both be tried.

## Capabilities

### New Capabilities

- `dev-pod`: a local Solid server serving the pod host from the working tree,
  with seeded data and a development account, for trying changes in a
  browser.

### Modified Capabilities

None.

## Impact

- New Nix modules under `nix/` for the server package and the `dev-pod` app;
  a server configuration and seed data in the repository.
- `justfile` gains `dev-pod`; `.gitignore` gains `.dev-pod/`.
- No change to any published package or to the pod host's build output.
- The acceptance test planned in `add-write-contract` (its task 5.1) runs
  against the same server package.
