## Context

See proposal.md for the motivation. pod.toph.so runs the Community Solid
Server 7.2.0 container image with a configuration kept in the fleet
repository: the root of the server is the pod, an external WebID owns it, and
a `ConstantConverter` hands out the pod host's `index.html` for every HTML
request, with its assets served at `/assets/`. nixpkgs has no package for the
server.

## Goals / Non-Goals

**Goals:**

- The same server version, and the same way of serving the pod host, as
  pod.toph.so.
- Real access control and a real login, so `allow` and `denied` paths run.

**Non-Goals:**

- Reproducing the fleet's external OpenID Connect login or its external
  WebID. The development pod uses the server's own email and password login
  and the WebID the server issues.
- HTTPS. The server and the browser accept `http://localhost`.

## Decisions

### The server is built from source with `buildNpmPackage`

A flake-parts module builds `CommunitySolidServer` at tag `v7.2.0` from GitHub
with `buildNpmPackage` and Node 22, the way the fleet builds its
`css-oidc-login` plugin, and exposes `packages.community-solid-server`.

Alternatives: the container image, which needs a container runtime on the
developer's machine and hides the server's files from the configuration;
`@solid/community-server` as an npm devDependency, which puts a second
install of the server into the workspace lockfile and the fixed-output
`node_modules` the pod host's build hashes.

### The pod is served at `/dev/` and created by the account seed

The server uses its file-storage preset with the pod host's converter added,
and a seed file creates one account with a pod named `dev`. The server then
issues the WebID `http://localhost:3000/dev/profile/card#me` and writes the
pod's ACL, which grants the owner full access and everyone else Read.

Alternative: the root pod with a linked WebID, as in the fleet. Rejected
because it needs the ownership-check override and a hand-written root ACL;
the address difference does not matter to the pod host, which renders any IRI
it is handed.

After the server answers, a seed step copies the seed data from
`dev-pod/seed/` into the pod with `PUT` requests as the account, using a
client credential minted through the account API, and skips that when the
pod already holds the notes. A direct copy into `.dev-pod/` would bypass the
server's content-type metadata.

### The pod host rebuilds in watch mode beside the server

`nix run .#dev-pod` runs two processes and stops both on exit: `vite build
--watch` for `packages/pod-host` with a host document naming
`http://localhost:3000/` as issuer, and the server with
`--config dev-pod/server-config.json`, where the converter reads
`packages/pod-host/dist/index.html` and the static entry serves
`packages/pod-host/dist/assets/`. The server reads the file at request time,
so a rebuild shows on the next load.

The app runs from the working tree and uses its `node_modules`, installed by
`bun install` in the dev shell; it does not use the fixed-output tree of the
Nix build.

## Risks / Trade-offs

- [`buildNpmPackage` needs `npmDepsHash` and the server's build step, which
  runs `componentsjs-generator`] → the fleet builds a Components.js package
  the same way; the hash is pinned once and changes only with the tag.
- [The configuration here and the fleet's drift apart] → the converter and
  static entries are copied from the fleet's configuration with a comment
  naming it; the identity part differs on purpose.
- [The development password is public] → the server listens on loopback only.

## Migration Plan

None. Nothing deployed changes.
